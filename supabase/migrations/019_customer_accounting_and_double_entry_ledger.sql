-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CUSTOMER FINANCIAL ACCOUNTING & DOUBLE-ENTRY LEDGER ENGINE
-- ==============================================================================

-- 1. Extend ledger_transactions CHECK constraints to support complete transaction types
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_txn_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_txn_type CHECK (
    transaction_type IN (
        -- Credits (Increases Dairy Liability to Customer)
        'MILK_COLLECTION_CREDIT',
        'CUSTOMER_INCENTIVE_CREDIT',
        'APPROVED_ADJUSTMENT_CREDIT',
        'LEDGER_ADJUSTMENT_CREDIT',
        'OPENING_BALANCE_CREDIT',
        'ADVANCE_RECOVERY_CREDIT',

        -- Debits (Decreases Dairy Liability to Customer)
        'CUSTOMER_ADVANCE_DEBIT',
        'ADVANCE_DEBIT',
        'FEED_PURCHASE_DEBIT',
        'AUTHORIZED_DEDUCTION_DEBIT',
        'DEDUCTION_DEBIT',
        'PAYOUT_SETTLEMENT_DEBIT',
        'PAYMENT_PAYOUT_DEBIT',
        'APPROVED_ADJUSTMENT_DEBIT',
        'LEDGER_ADJUSTMENT_DEBIT',
        'COLLECTION_REVERSAL_DEBIT',
        'OPENING_BALANCE_DEBIT'
    )
);

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_ref_entity;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_ref_entity CHECK (
    reference_entity IN (
        'MILK_COLLECTION',
        'FEED_SALE',
        'CUSTOMER_ADVANCE',
        'CUSTOMER_DEDUCTION',
        'CUSTOMER_PAYMENT',
        'MANUAL_ADJUSTMENT',
        'CUSTOMER_PAYOUT',
        'CUSTOMER_RECEIPT',
        'PAYMENT_BATCH',
        'OPENING_BALANCE',
        'CUSTOMER_INCENTIVE',
        'ADVANCE_RECOVERY'
    )
);

-- 2. Extend ledger_entries CHECK constraint for full double-entry chart of accounts
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_entry_account_type;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_entry_account_type CHECK (
    account_type IN (
        'CUSTOMER_PAYABLE',
        'MILK_PURCHASE_EXPENSE',
        'FEED_INVENTORY',
        'CASH_BANK',
        'ADVANCE_RECEIVABLE',
        'DEDUCTION_INCOME',
        'INCENTIVE_EXPENSE',
        'OPENING_BALANCE_EQUITY',
        'RECONCILIATION_SUSPENSE'
    )
);

-- 3. Enhance customer_advances table schema
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(10,2);
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(10,2);
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE customer_advances ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE customer_advances ALTER COLUMN disbursed_by DROP NOT NULL;

-- Backfill requested_amount and approved_amount for existing advances if any
UPDATE customer_advances SET requested_amount = principal_amount WHERE requested_amount IS NULL;
UPDATE customer_advances SET approved_amount = principal_amount WHERE approved_amount IS NULL;

ALTER TABLE customer_advances DROP CONSTRAINT IF EXISTS chk_advance_status;
ALTER TABLE customer_advances ADD CONSTRAINT chk_advance_status CHECK (
    status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED', 'FULLY_RECOVERED', 'WRITTEN_OFF')
);

-- 4. Enhance customer_deductions table schema
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS supporting_reference VARCHAR(100);
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'POSTED';
ALTER TABLE customer_deductions ADD COLUMN IF NOT EXISTS ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;

ALTER TABLE customer_deductions DROP CONSTRAINT IF EXISTS chk_deduction_category;
ALTER TABLE customer_deductions ADD CONSTRAINT chk_deduction_category CHECK (
    deduction_category IN (
        'VETERINARY_MEDICINE',
        'AI_BREEDING_CHARGE',
        'CATTLE_INSURANCE',
        'MEMBERSHIP_FEE',
        'OTHER',
        'EQUIPMENT_MAINTENANCE',
        'SUPPLY_CHARGE'
    )
);

-- 5. Enhance customer_adjustments table schema
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL;
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE customer_adjustments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'POSTED';

-- 6. Enhance customer_ledger_accounts
ALTER TABLE customer_ledger_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 7. Immutability trigger on ledger_transactions to prevent direct UPDATE or DELETE
CREATE OR REPLACE FUNCTION public.trigger_enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be updated.'
            USING ERRCODE = '22000';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CANNOT_DELETE_LEDGER: Finalized ledger transactions are strictly immutable and cannot be deleted.'
            USING ERRCODE = '22000';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_transactions_immutable ON ledger_transactions;
CREATE TRIGGER trg_ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.trigger_enforce_ledger_immutability();

-- 8. Stored Procedure: Post Customer Advance (Disbursement)
CREATE OR REPLACE FUNCTION public.post_customer_advance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_recovery_type VARCHAR(30) DEFAULT 'MONTHLY_BILL_DEDUCTION',
    p_idempotency_key VARCHAR(128) DEFAULT NULL,
    p_advance_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_existing_txn RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_advance_id UUID;
    v_advance_date DATE;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_advance_date := COALESCE(p_advance_date, CURRENT_DATE);
    v_idempotency_key := COALESCE(p_idempotency_key, 'ADV-' || p_customer_id::text || '-' || CURRENT_DATE::text || '-' || ROUND(p_amount, 2)::text);

    -- 1. Idempotency check: Return existing transaction if duplicate
    SELECT lt.*, ca.id AS advance_id, ca.status AS advance_status
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_advances ca ON ca.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'advanceId', v_existing_txn.advance_id,
            'ledgerTransactionId', v_existing_txn.id,
            'customerId', v_existing_txn.customer_id,
            'centerId', v_existing_txn.center_id,
            'principalAmount', v_existing_txn.amount,
            'balanceAfter', v_existing_txn.balance_after,
            'status', v_existing_txn.advance_status,
            'isIdempotentReplay', TRUE,
            'createdAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Advance amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
        RAISE EXCEPTION 'A valid advance reason is mandatory (minimum 3 characters)' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been soft-deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Cross-organization advance disbursement is strictly prohibited' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL THEN
        RAISE EXCEPTION 'Actor % does not exist', p_actor_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock Customer Ledger Account with FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - p_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - p_amount; -- DEBIT decreases dairy liability to customer
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Advance
    v_advance_id := gen_random_uuid();
    INSERT INTO customer_advances (
        id, customer_id, center_id, advance_date, principal_amount,
        requested_amount, approved_amount, reason, recovery_type,
        total_recovered_amount, outstanding_amount, status,
        approved_by, approved_at, disbursed_by, disbursed_at
    ) VALUES (
        v_advance_id, p_customer_id, p_center_id, v_advance_date, p_amount,
        p_amount, p_amount, p_reason, p_recovery_type,
        0.00, p_amount, 'ACTIVE',
        p_actor_id, NOW(), p_actor_id, NOW()
    );

    -- 5. Insert Ledger Transaction (Debit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, 'CUSTOMER_ADVANCE_DEBIT',
        'DEBIT', p_amount, v_new_balance, 'CUSTOMER_ADVANCE', v_advance_id,
        'Customer Advance: ' || p_reason, v_idempotency_key, p_actor_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
    );

    -- Entry 2: Credit Cash/Bank (Asset decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, p_center_id, 'CASH_BANK', 'CREDIT', p_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_ADVANCE_DISBURSED',
        'CUSTOMER_ADVANCE', v_advance_id,
        jsonb_build_object(
            'amount', p_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'reason', p_reason
        )
    );

    -- 8. Return Receipt
    SELECT jsonb_build_object(
        'advanceId', v_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'centerId', p_center_id,
        'principalAmount', p_amount,
        'outstandingAmount', p_amount,
        'recoveredAmount', 0.00,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'reason', p_reason,
        'status', 'ACTIVE',
        'recoveryType', p_recovery_type,
        'disbursedBy', p_actor_id,
        'receiptNumber', 'ADV-' || UPPER(SUBSTRING(v_advance_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'disbursedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, VARCHAR, DATE) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, VARCHAR, DATE) TO authenticated, service_role;

-- 9. Stored Procedure: Request Customer Advance (Pending Approval)
CREATE OR REPLACE FUNCTION public.request_customer_advance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_recovery_type VARCHAR(30) DEFAULT 'MONTHLY_BILL_DEDUCTION',
    p_advance_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_advance_id UUID;
    v_result JSONB;
BEGIN
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Advance amount must be strictly positive' USING ERRCODE = '22003';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
        RAISE EXCEPTION 'A valid advance reason is mandatory' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    v_advance_id := gen_random_uuid();
    INSERT INTO customer_advances (
        id, customer_id, center_id, advance_date, principal_amount,
        requested_amount, approved_amount, reason, recovery_type,
        total_recovered_amount, outstanding_amount, status
    ) VALUES (
        v_advance_id, p_customer_id, p_center_id, p_advance_date, p_amount,
        p_amount, 0.00, p_reason, p_recovery_type,
        0.00, p_amount, 'PENDING_APPROVAL'
    );

    SELECT jsonb_build_object(
        'advanceId', v_advance_id,
        'customerId', p_customer_id,
        'centerId', p_center_id,
        'requestedAmount', p_amount,
        'reason', p_reason,
        'status', 'PENDING_APPROVAL',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.request_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, DATE) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.request_customer_advance(UUID, UUID, UUID, NUMERIC, TEXT, VARCHAR, DATE) TO authenticated, service_role;

-- 10. Stored Procedure: Approve Customer Advance (Triggers Financial Posting)
CREATE OR REPLACE FUNCTION public.approve_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_approved_amount NUMERIC(10,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_final_amount NUMERIC(10,2);
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status <> 'PENDING_APPROVAL' THEN
        RAISE EXCEPTION 'Advance % is already in % status and cannot be approved', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    v_final_amount := COALESCE(p_approved_amount, v_advance.requested_amount);
    IF v_final_amount <= 0.00 THEN
        RAISE EXCEPTION 'Approved amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to approve customer advances', p_actor_id USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_advance.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_advance.center_id;

    -- Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_advance.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - v_final_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_advance.customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - v_final_amount;
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- Update Advance Record
    UPDATE customer_advances
    SET status = 'ACTIVE',
        approved_amount = v_final_amount,
        principal_amount = v_final_amount,
        outstanding_amount = v_final_amount,
        approved_by = p_actor_id,
        approved_at = NOW(),
        disbursed_by = p_actor_id,
        disbursed_at = NOW()
    WHERE id = p_advance_id;

    -- Insert Ledger Transaction (Debit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, v_advance.center_id, v_advance.customer_id, 'CUSTOMER_ADVANCE_DEBIT',
        'DEBIT', v_final_amount, v_new_balance, 'CUSTOMER_ADVANCE', p_advance_id,
        'Customer Advance Approved: ' || COALESCE(v_advance.reason, 'Approved Advance'),
        'ADV-APP-' || p_advance_id::text, p_actor_id, NOW()
    );

    -- Insert Balanced Double-Entry Journal Entries
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', v_final_amount
    );

    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_advance.center_id, 'CASH_BANK', 'CREDIT', v_final_amount
    );

    -- Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_APPROVED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object(
            'approvedAmount', v_final_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', v_advance.customer_id,
        'status', 'ACTIVE',
        'approvedAmount', v_final_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'approvedBy', p_actor_id,
        'receiptNumber', 'ADV-' || UPPER(SUBSTRING(p_advance_id::text, 1, 8)),
        'approvedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.approve_customer_advance(UUID, UUID, NUMERIC) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_customer_advance(UUID, UUID, NUMERIC) TO authenticated, service_role;

-- 11. Stored Procedure: Reject Customer Advance (Does NOT Mutate Ledger)
CREATE OR REPLACE FUNCTION public.reject_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_actor RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status <> 'PENDING_APPROVAL' THEN
        RAISE EXCEPTION 'Advance % is already in % status and cannot be rejected', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) < 3 THEN
        RAISE EXCEPTION 'Rejection reason is mandatory (minimum 3 characters)' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to reject advances', p_actor_id USING ERRCODE = '42501';
    END IF;

    UPDATE customer_advances
    SET status = 'REJECTED',
        rejection_reason = p_rejection_reason,
        rejected_by = p_actor_id,
        rejected_at = NOW()
    WHERE id = p_advance_id;

    -- Audit Log (No ledger transaction created!)
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        (SELECT organization_id FROM dairy_centers WHERE id = v_advance.center_id),
        v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_REJECTED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object('reason', p_rejection_reason, 'status', 'REJECTED')
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'status', 'REJECTED',
        'rejectionReason', p_rejection_reason,
        'rejectedBy', p_actor_id,
        'rejectedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.reject_customer_advance(UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reject_customer_advance(UUID, UUID, TEXT) TO authenticated, service_role;

-- 12. Stored Procedure: Recover Customer Advance (Partial or Full)
CREATE OR REPLACE FUNCTION public.recover_customer_advance(
    p_advance_id UUID,
    p_actor_id UUID,
    p_recovery_amount NUMERIC(10,2),
    p_idempotency_key VARCHAR(128) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_advance RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_existing_txn RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_recovered NUMERIC(10,2);
    v_new_outstanding NUMERIC(10,2);
    v_new_status VARCHAR(20);
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'REC-' || p_advance_id::text || '-' || ROUND(p_recovery_amount, 2)::text || '-' || CURRENT_DATE::text);

    -- 1. Idempotency Check
    SELECT lt.*, ca.outstanding_amount, ca.status AS advance_status
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_advances ca ON ca.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'advanceId', p_advance_id,
            'ledgerTransactionId', v_existing_txn.id,
            'recoveredAmount', v_existing_txn.amount,
            'outstandingAmount', v_existing_txn.outstanding_amount,
            'status', v_existing_txn.advance_status,
            'isIdempotentReplay', TRUE,
            'recoveredAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Fetch Advance FOR UPDATE
    SELECT * INTO v_advance FROM customer_advances WHERE id = p_advance_id FOR UPDATE;
    IF v_advance.id IS NULL THEN
        RAISE EXCEPTION 'Customer advance % does not exist', p_advance_id USING ERRCODE = 'P0002';
    END IF;

    IF v_advance.status NOT IN ('ACTIVE', 'APPROVED') THEN
        RAISE EXCEPTION 'Advance % is % and cannot be recovered', p_advance_id, v_advance.status USING ERRCODE = '22000';
    END IF;

    IF p_recovery_amount <= 0.00 THEN
        RAISE EXCEPTION 'Recovery amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    -- CRITICAL BUSINESS INVARIANT: Prevent recovered amount from exceeding outstanding principal!
    IF p_recovery_amount > v_advance.outstanding_amount THEN
        RAISE EXCEPTION 'OVER_RECOVERY_PROHIBITED: Recovery amount % exceeds outstanding balance %',
            p_recovery_amount, v_advance.outstanding_amount USING ERRCODE = '22003';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_advance.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_advance.center_id;

    -- 3. Compute New Balances
    v_new_recovered := v_advance.total_recovered_amount + p_recovery_amount;
    v_new_outstanding := v_advance.outstanding_amount - p_recovery_amount;
    v_new_status := CASE WHEN v_new_outstanding = 0.00 THEN 'FULLY_RECOVERED' ELSE 'ACTIVE' END;

    -- Update Customer Advance
    UPDATE customer_advances
    SET total_recovered_amount = v_new_recovered,
        outstanding_amount = v_new_outstanding,
        status = v_new_status
    WHERE id = p_advance_id;

    -- 4. Lock Customer Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_advance.customer_id 
    FOR UPDATE;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + p_recovery_amount; -- CREDIT increases dairy liability / offsets advance debit

    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- 5. Insert Ledger Transaction (Credit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, v_advance.center_id, v_advance.customer_id, 'ADVANCE_RECOVERY_CREDIT',
        'CREDIT', p_recovery_amount, v_new_balance, 'ADVANCE_RECOVERY', p_advance_id,
        'Advance Recovery (' || (CASE WHEN v_new_status = 'FULLY_RECOVERED' THEN 'FULL' ELSE 'PARTIAL' END) || '): ' || COALESCE(p_notes, 'Direct Cash/Bill Repayment'),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Cash/Bank (Cash received increases asset)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_advance.center_id, 'CASH_BANK', 'DEBIT', p_recovery_amount
    );

    -- Entry 2: Credit Customer Payable (Liability increases back)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_recovery_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, v_advance.center_id, p_actor_id, 'CUSTOMER_ADVANCE_RECOVERED',
        'CUSTOMER_ADVANCE', p_advance_id,
        jsonb_build_object(
            'recoveredAmount', p_recovery_amount,
            'totalRecovered', v_new_recovered,
            'remainingOutstanding', v_new_outstanding,
            'status', v_new_status,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'advanceId', p_advance_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', v_advance.customer_id,
        'recoveredAmount', p_recovery_amount,
        'totalRecoveredAmount', v_new_recovered,
        'remainingPrincipal', v_new_outstanding,
        'outstandingAmount', v_new_outstanding,
        'status', v_new_status,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'receiptNumber', 'REC-' || UPPER(SUBSTRING(v_ledger_txn_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'recoveredAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.recover_customer_advance(UUID, UUID, NUMERIC, VARCHAR, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.recover_customer_advance(UUID, UUID, NUMERIC, VARCHAR, TEXT) TO authenticated, service_role;

-- 13. Stored Procedure: Post Customer Authorized Deduction
CREATE OR REPLACE FUNCTION public.post_customer_deduction(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_category VARCHAR(50),
    p_amount NUMERIC(10,2),
    p_description TEXT,
    p_supporting_reference VARCHAR(100) DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_existing_txn RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_deduction_id UUID;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'DED-' || p_customer_id::text || '-' || p_category || '-' || CURRENT_DATE::text || '-' || ROUND(p_amount, 2)::text);

    -- 1. Idempotency Check
    SELECT lt.*, cd.id AS deduction_id, cd.deduction_category
    INTO v_existing_txn
    FROM ledger_transactions lt
    JOIN customer_deductions cd ON cd.id = lt.reference_id
    WHERE lt.idempotency_key = v_idempotency_key;

    IF v_existing_txn.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'deductionId', v_existing_txn.deduction_id,
            'ledgerTransactionId', v_existing_txn.id,
            'customerId', v_existing_txn.customer_id,
            'category', v_existing_txn.deduction_category,
            'amount', v_existing_txn.amount,
            'balanceAfter', v_existing_txn.balance_after,
            'isIdempotentReplay', TRUE,
            'createdAt', v_existing_txn.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Deduction amount must be strictly positive' USING ERRCODE = '22003';
    END IF;

    IF p_category NOT IN ('VETERINARY_MEDICINE', 'AI_BREEDING_CHARGE', 'CATTLE_INSURANCE', 'MEMBERSHIP_FEE', 'OTHER', 'EQUIPMENT_MAINTENANCE', 'SUPPLY_CHARGE') THEN
        RAISE EXCEPTION 'Invalid deduction category %', p_category USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', p_center_id USING ERRCODE = '22000';
    END IF;

    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Cross-organization deduction is strictly prohibited' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL THEN
        RAISE EXCEPTION 'Actor % does not exist', p_actor_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock Customer Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        v_prev_balance := 0.00;
        v_new_balance := 0.00 - p_amount;
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - p_amount; -- DEBIT decreases dairy liability to customer
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Deduction Record
    v_deduction_id := gen_random_uuid();
    v_ledger_txn_id := gen_random_uuid();

    -- 4. Insert Ledger Transaction (Debit)
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, 'AUTHORIZED_DEDUCTION_DEBIT',
        'DEBIT', p_amount, v_new_balance, 'CUSTOMER_DEDUCTION', v_deduction_id,
        'Authorized Deduction [' || p_category || ']: ' || COALESCE(p_description, ''),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Insert Customer Deduction Record
    INSERT INTO customer_deductions (
        id, customer_id, center_id, deduction_category, amount,
        description, supporting_reference, status, approved_by,
        ledger_transaction_id, created_at
    ) VALUES (
        v_deduction_id, p_customer_id, p_center_id, p_category, p_amount,
        p_description, p_supporting_reference, 'POSTED', p_actor_id,
        v_ledger_txn_id, NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
    );

    -- Entry 2: Credit Deduction Income (Income/Recovery increases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, p_center_id, 'DEDUCTION_INCOME', 'CREDIT', p_amount
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_DEDUCTION_POSTED',
        'CUSTOMER_DEDUCTION', v_deduction_id,
        jsonb_build_object(
            'category', p_category,
            'amount', p_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'description', p_description
        )
    );

    SELECT jsonb_build_object(
        'deductionId', v_deduction_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'category', p_category,
        'amount', p_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'description', p_description,
        'supportingReference', p_supporting_reference,
        'receiptNumber', 'DED-' || UPPER(SUBSTRING(v_deduction_id::text, 1, 8)),
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_deduction(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, VARCHAR, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_deduction(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 14. Stored Procedure: Post Opening Balance
CREATE OR REPLACE FUNCTION public.post_customer_opening_balance(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_amount NUMERIC(10,2),
    p_direction VARCHAR(10),
    p_opening_date DATE DEFAULT CURRENT_DATE,
    p_supporting_reference VARCHAR(100) DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_existing_ob RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_txn_type VARCHAR(40);
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'OB-' || p_customer_id::text || '-' || p_direction);

    -- 1. Authorization: Only ADMIN / DAIRY_OWNER / SUPER_ADMIN can post opening balance
    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER') THEN
        RAISE EXCEPTION 'Actor % is not authorized to initialize customer opening balances', p_actor_id USING ERRCODE = '42501';
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Opening balance amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_direction NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'Opening balance direction must be CREDIT or DEBIT' USING ERRCODE = '22023';
    END IF;

    -- Check if opening balance already posted for this customer (Prevent duplicates)
    SELECT * INTO v_existing_ob
    FROM ledger_transactions
    WHERE customer_id = p_customer_id
      AND transaction_type IN ('OPENING_BALANCE_CREDIT', 'OPENING_BALANCE_DEBIT');

    IF v_existing_ob.id IS NOT NULL THEN
        RAISE EXCEPTION 'OPENING_BALANCE_EXISTS: Customer % already has a finalized opening balance (Txn %)',
            p_customer_id, v_existing_ob.id USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;

    -- 3. Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF p_direction = 'CREDIT' THEN
        v_txn_type := 'OPENING_BALANCE_CREDIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance + p_amount;
        END IF;
    ELSE
        v_txn_type := 'OPENING_BALANCE_DEBIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := 0.00 - p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance - p_amount;
        END IF;
    END IF;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Ledger Transaction
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, v_txn_type,
        p_direction, p_amount, v_new_balance, 'OPENING_BALANCE', v_ledger_txn_id,
        'Initial Customer Opening Balance (' || p_direction || ') as of ' || p_opening_date::text || COALESCE(' Ref: ' || p_supporting_reference, ''),
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Balanced Double-Entry Journal Entries
    IF p_direction = 'CREDIT' THEN
        -- Dairy liability increases: Debit Opening Balance Equity, Credit Customer Payable
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'OPENING_BALANCE_EQUITY', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_amount
        );
    ELSE
        -- Customer owes dairy: Debit Customer Payable, Credit Opening Balance Equity
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'OPENING_BALANCE_EQUITY', 'CREDIT', p_amount
        );
    END IF;

    -- 6. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_OPENING_BALANCE_SET',
        'CUSTOMER_LEDGER_ACCOUNT', v_ledger_account.id,
        jsonb_build_object(
            'amount', p_amount,
            'direction', p_direction,
            'date', p_opening_date,
            'reference', p_supporting_reference,
            'newBalance', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'amount', p_amount,
        'direction', p_direction,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'openingDate', p_opening_date,
        'supportingReference', p_supporting_reference,
        'status', 'POSTED',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_opening_balance(UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_opening_balance(UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 15. Stored Procedure: Post Authorized Ledger Adjustment
CREATE OR REPLACE FUNCTION public.post_customer_adjustment(
    p_customer_id UUID,
    p_center_id UUID,
    p_actor_id UUID,
    p_direction VARCHAR(10),
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_original_txn_id UUID DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_center RECORD;
    v_actor RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_txn_type VARCHAR(40);
    v_adj_id UUID;
    v_ledger_txn_id UUID;
    v_idempotency_key VARCHAR(128);
    v_result JSONB;
BEGIN
    v_idempotency_key := COALESCE(p_idempotency_key, 'ADJ-' || p_customer_id::text || '-' || p_direction || '-' || ROUND(p_amount, 2)::text || '-' || gen_random_uuid()::text);

    -- 1. Authorization: Supervisor or higher
    SELECT * INTO v_actor FROM users WHERE id = p_actor_id;
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Actor % is not authorized to create ledger adjustments. Requires Supervisor or higher.', p_actor_id USING ERRCODE = '42501';
    END IF;

    -- 2. Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Adjustment amount must be strictly greater than 0.00' USING ERRCODE = '22003';
    END IF;

    IF p_direction NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'Adjustment direction must be CREDIT or DEBIT' USING ERRCODE = '22023';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Mandatory adjustment reason (minimum 5 characters) is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or has been deleted', p_customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;

    -- 3. Lock Ledger Account
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    IF p_direction = 'CREDIT' THEN
        v_txn_type := 'APPROVED_ADJUSTMENT_CREDIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance + p_amount;
        END IF;
    ELSE
        v_txn_type := 'APPROVED_ADJUSTMENT_DEBIT';
        IF v_ledger_account.id IS NULL THEN
            v_prev_balance := 0.00;
            v_new_balance := 0.00 - p_amount;
        ELSE
            v_prev_balance := v_ledger_account.current_balance;
            v_new_balance := v_prev_balance - p_amount;
        END IF;
    END IF;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            p_customer_id, v_center.organization_id, 'INR', v_new_balance, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    ELSE
        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;
    END IF;

    -- 4. Insert Customer Adjustment record
    v_adj_id := gen_random_uuid();
    v_ledger_txn_id := gen_random_uuid();

    -- 4. Insert Ledger Transaction
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, p_center_id, p_customer_id, v_txn_type,
        p_direction, p_amount, v_new_balance, 'MANUAL_ADJUSTMENT', v_adj_id,
        'Approved Adjustment [' || p_direction || ']: ' || p_reason,
        v_idempotency_key, p_actor_id, NOW()
    );

    -- 5. Insert Customer Adjustment record
    INSERT INTO customer_adjustments (
        id, customer_id, adjustment_type, amount, reason,
        approved_by, organization_id, center_id, original_transaction_id,
        ledger_transaction_id, idempotency_key, status, created_at
    ) VALUES (
        v_adj_id, p_customer_id, p_direction, p_amount, p_reason,
        p_actor_id, v_center.organization_id, p_center_id, p_original_txn_id,
        v_ledger_txn_id, v_idempotency_key, 'POSTED', NOW()
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    IF p_direction = 'CREDIT' THEN
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'INCENTIVE_EXPENSE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', p_amount
        );
    ELSE
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', p_amount
        );
        INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
        ) VALUES (
            v_ledger_txn_id, p_center_id, 'DEDUCTION_INCOME', 'CREDIT', p_amount
        );
    END IF;

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id, center_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_center.organization_id, p_center_id, p_actor_id, 'CUSTOMER_LEDGER_ADJUSTMENT_POSTED',
        'CUSTOMER_ADJUSTMENT', v_adj_id,
        jsonb_build_object(
            'amount', p_amount,
            'direction', p_direction,
            'reason', p_reason,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'originalTxnId', p_original_txn_id
        )
    );

    SELECT jsonb_build_object(
        'adjustmentId', v_adj_id,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerId', p_customer_id,
        'direction', p_direction,
        'amount', p_amount,
        'reason', p_reason,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'status', 'POSTED',
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.post_customer_adjustment(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.post_customer_adjustment(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR) TO authenticated, service_role;

-- 16. Stored Procedure: Account Reconciliation Service
CREATE OR REPLACE FUNCTION public.reconcile_customer_ledger(
    p_customer_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_stored_balance NUMERIC(12,2) := 0.00;
    v_computed_balance NUMERIC(12,2) := 0.00;
    v_total_credits NUMERIC(12,2) := 0.00;
    v_total_debits NUMERIC(12,2) := 0.00;
    v_total_milk_credits NUMERIC(12,2) := 0.00;
    v_total_advance_debits NUMERIC(12,2) := 0.00;
    v_total_recovery_credits NUMERIC(12,2) := 0.00;
    v_total_deduction_debits NUMERIC(12,2) := 0.00;
    v_total_payout_debits NUMERIC(12,2) := 0.00;
    v_total_adj_credits NUMERIC(12,2) := 0.00;
    v_total_adj_debits NUMERIC(12,2) := 0.00;
    v_journal_total_debits NUMERIC(12,2) := 0.00;
    v_journal_total_credits NUMERIC(12,2) := 0.00;
    v_discrepancies JSONB := '[]'::JSONB;
    v_unbalanced_count INT := 0;
    v_orphan_count INT := 0;
    v_missing_collection_count INT := 0;
    v_rec RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_ledger_account FROM customer_ledger_accounts WHERE customer_id = p_customer_id;
    IF v_ledger_account.id IS NOT NULL THEN
        v_stored_balance := v_ledger_account.current_balance;
    END IF;

    -- Aggregate transaction credits and debits
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type = 'MILK_COLLECTION_CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RECOVERY_CREDIT' THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('PAYOUT_SETTLEMENT_DEBIT', 'PAYMENT_PAYOUT_DEBIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('APPROVED_ADJUSTMENT_CREDIT', 'LEDGER_ADJUSTMENT_CREDIT', 'OPENING_BALANCE_CREDIT') THEN amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN transaction_type IN ('APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT', 'OPENING_BALANCE_DEBIT') THEN amount ELSE 0 END), 0.00)
    INTO 
        v_total_credits, v_total_debits,
        v_total_milk_credits, v_total_advance_debits, v_total_recovery_credits,
        v_total_deduction_debits, v_total_payout_debits,
        v_total_adj_credits, v_total_adj_debits
    FROM ledger_transactions
    WHERE customer_id = p_customer_id;

    v_computed_balance := v_total_credits - v_total_debits;

    -- Check 1: Running Balance Mismatch
    IF v_stored_balance <> v_computed_balance THEN
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'RUNNING_BALANCE_MISMATCH',
            'severity', 'CRITICAL',
            'storedBalance', v_stored_balance,
            'computedBalance', v_computed_balance,
            'difference', v_stored_balance - v_computed_balance,
            'message', 'Customer ledger account current_balance does not match sum of transaction credits minus debits'
        );
    END IF;

    -- Check 2: Unbalanced Journal Entries
    FOR v_rec IN 
        SELECT lt.id AS txn_id, lt.transaction_type, lt.amount AS txn_amount,
               COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) AS debit_sum,
               COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00) AS credit_sum
        FROM ledger_transactions lt
        LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
        WHERE lt.customer_id = p_customer_id
        GROUP BY lt.id, lt.transaction_type, lt.amount
        HAVING COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) <> COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00)
            OR COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00) <> lt.amount
    LOOP
        v_unbalanced_count := v_unbalanced_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'UNBALANCED_JOURNAL',
            'severity', 'CRITICAL',
            'transactionId', v_rec.txn_id,
            'transactionType', v_rec.transaction_type,
            'expectedAmount', v_rec.txn_amount,
            'debitSum', v_rec.debit_sum,
            'creditSum', v_rec.credit_sum,
            'message', 'Journal entries do not balance for transaction ' || v_rec.txn_id
        );
    END LOOP;

    -- Check 3: Orphan Transactions (Milk Collection reference missing in milk_collections table)
    FOR v_rec IN
        SELECT lt.id AS txn_id, lt.reference_id
        FROM ledger_transactions lt
        WHERE lt.customer_id = p_customer_id
          AND lt.reference_entity = 'MILK_COLLECTION'
          AND NOT EXISTS (SELECT 1 FROM milk_collections mc WHERE mc.id = lt.reference_id)
    LOOP
        v_orphan_count := v_orphan_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'ORPHAN_TRANSACTION',
            'severity', 'HIGH',
            'transactionId', v_rec.txn_id,
            'referenceId', v_rec.reference_id,
            'message', 'Ledger transaction references a milk_collection record that does not exist'
        );
    END LOOP;

    -- Check 4: Missing Ledger Entries for Completed Milk Collections
    FOR v_rec IN
        SELECT mc.id AS collection_id, mc.total_amount
        FROM milk_collections mc
        WHERE mc.customer_id = p_customer_id
          AND mc.transaction_status = 'COMPLETED'
          AND NOT EXISTS (
              SELECT 1 FROM ledger_transactions lt 
              WHERE lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION'
          )
    LOOP
        v_missing_collection_count := v_missing_collection_count + 1;
        v_discrepancies := v_discrepancies || jsonb_build_object(
            'type', 'MISSING_LEDGER_ENTRY',
            'severity', 'CRITICAL',
            'collectionId', v_rec.collection_id,
            'amount', v_rec.total_amount,
            'message', 'Completed milk collection has no corresponding ledger credit entry'
        );
    END LOOP;

    -- Total Journal Debits & Credits across customer transactions
    SELECT 
        COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0.00)
    INTO v_journal_total_debits, v_journal_total_credits
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le.transaction_id = lt.id
    WHERE lt.customer_id = p_customer_id;

    SELECT jsonb_build_object(
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'isReconciled', (jsonb_array_length(v_discrepancies) = 0),
        'discrepancyCount', jsonb_array_length(v_discrepancies),
        'accountBalance', v_stored_balance,
        'computedBalance', v_computed_balance,
        'summary', jsonb_build_object(
            'totalCredits', v_total_credits,
            'totalDebits', v_total_debits,
            'totalMilkCredits', v_total_milk_credits,
            'totalAdvanceDebits', v_total_advance_debits,
            'totalRecoveryCredits', v_total_recovery_credits,
            'totalDeductionDebits', v_total_deduction_debits,
            'totalPayoutDebits', v_total_payout_debits,
            'totalAdjustmentsCredit', v_total_adj_credits,
            'totalAdjustmentsDebit', v_total_adj_debits,
            'journalTotalDebits', v_journal_total_debits,
            'journalTotalCredits', v_journal_total_credits
        ),
        'discrepancies', v_discrepancies,
        'reconciledAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.reconcile_customer_ledger(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_ledger(UUID, UUID) TO authenticated, service_role;
