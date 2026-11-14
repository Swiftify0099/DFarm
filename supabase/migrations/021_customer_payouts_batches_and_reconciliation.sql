-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CUSTOMER PAYOUTS, PAYMENT COLLECTION, BATCHES & RECONCILIATION
-- ==============================================================================

-- 1. Extend ledger_transactions CHECK constraints to support P15 transaction types & entities
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_txn_type;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_txn_type CHECK (transaction_type IN (
    'MILK_COLLECTION_CREDIT', 'CUSTOMER_INCENTIVE_CREDIT', 'APPROVED_ADJUSTMENT_CREDIT',
    'LEDGER_ADJUSTMENT_CREDIT', 'OPENING_BALANCE_CREDIT', 'ADVANCE_RECOVERY_CREDIT',
    'CUSTOMER_RECEIPT_CREDIT', 'PAYOUT_REVERSAL_CREDIT',
    'CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT', 'FEED_PURCHASE_DEBIT',
    'AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT', 'PAYOUT_SETTLEMENT_DEBIT',
    'PAYMENT_PAYOUT_DEBIT', 'APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT',
    'COLLECTION_REVERSAL_DEBIT', 'RECEIPT_REVERSAL_DEBIT', 'OPENING_BALANCE_DEBIT'
));

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_ledger_ref_entity;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_ledger_ref_entity CHECK (reference_entity IN (
    'MILK_COLLECTION', 'FEED_SALE', 'CUSTOMER_ADVANCE',
    'CUSTOMER_DEDUCTION', 'CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT',
    'CUSTOMER_PAYOUT', 'CUSTOMER_RECEIPT', 'PAYMENT_BATCH',
    'ADVANCE_RECOVERY', 'OPENING_BALANCE'
));

-- 2. Customer Payouts Master Table (Dairy Pays Farmer)
CREATE TABLE IF NOT EXISTS customer_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    batch_id UUID, -- Foreign key added below after payment_batches is created
    direction VARCHAR(20) NOT NULL DEFAULT 'DAIRY_PAYS_CUSTOMER',
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    reference_number VARCHAR(100),
    source_transaction_type VARCHAR(50) NOT NULL DEFAULT 'MANUAL_PAYOUT',
    source_transaction_id UUID,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    bank_account_mask VARCHAR(30),
    bank_ifsc VARCHAR(20),
    recipient_name VARCHAR(150),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payout_amount CHECK (amount > 0.00),
    CONSTRAINT chk_payout_direction CHECK (direction = 'DAIRY_PAYS_CUSTOMER'),
    CONSTRAINT chk_payout_method CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER_APPROVED_METHOD')),
    CONSTRAINT chk_payout_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'SETTLED',
        'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'RECONCILIATION_REQUIRED'
    ))
);

DROP TRIGGER IF EXISTS set_customer_payouts_updated_at ON customer_payouts;
CREATE TRIGGER set_customer_payouts_updated_at
BEFORE UPDATE ON customer_payouts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_payouts_org ON customer_payouts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_center ON customer_payouts(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_customer ON customer_payouts(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_status ON customer_payouts(status);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_ref ON customer_payouts(reference_number);

-- 3. Customer Receipts Master Table (Farmer Pays Dairy - Debt Repayment)
CREATE TABLE IF NOT EXISTS customer_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    direction VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER_PAYS_DAIRY',
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    reference_number VARCHAR(100) NOT NULL,
    receipt_number VARCHAR(60) NOT NULL UNIQUE,
    source_transaction_type VARCHAR(50) NOT NULL DEFAULT 'DEBT_REPAYMENT',
    source_transaction_id UUID,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_receipt_amount CHECK (amount > 0.00),
    CONSTRAINT chk_receipt_direction CHECK (direction = 'CUSTOMER_PAYS_DAIRY'),
    CONSTRAINT chk_receipt_method CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER_APPROVED_METHOD')),
    CONSTRAINT chk_receipt_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'SETTLED',
        'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'RECONCILIATION_REQUIRED'
    ))
);

DROP TRIGGER IF EXISTS set_customer_receipts_updated_at ON customer_receipts;
CREATE TRIGGER set_customer_receipts_updated_at
BEFORE UPDATE ON customer_receipts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_receipts_org ON customer_receipts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_center ON customer_receipts(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_status ON customer_receipts(status);

-- 4. Payment Batches Table (Bulk Beneficiary Payouts)
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    batch_number VARCHAR(60) NOT NULL UNIQUE,
    billing_cycle_id UUID,
    billing_period_start DATE,
    billing_period_end DATE,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_beneficiaries INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    successful_count INT NOT NULL DEFAULT 0,
    successful_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    failed_count INT NOT NULL DEFAULT 0,
    failed_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_count INT NOT NULL DEFAULT 0,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'UNRECONCILED',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_batch_counts CHECK (
        total_beneficiaries >= 0 AND successful_count >= 0 AND failed_count >= 0 AND pending_count >= 0
    ),
    CONSTRAINT chk_batch_amounts CHECK (
        total_amount >= 0.00 AND successful_amount >= 0.00 AND failed_amount >= 0.00 AND pending_amount >= 0.00
    ),
    CONSTRAINT chk_batch_status CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'PROCESSING',
        'SETTLED', 'PARTIALLY_SETTLED', 'FAILED', 'CANCELLED'
    ))
);

DROP TRIGGER IF EXISTS set_payment_batches_updated_at ON payment_batches;
CREATE TRIGGER set_payment_batches_updated_at
BEFORE UPDATE ON payment_batches
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_batches_org ON payment_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_batches_center ON payment_batches(center_id);

-- Add foreign key from customer_payouts to payment_batches
ALTER TABLE customer_payouts DROP CONSTRAINT IF EXISTS fk_payout_batch;
ALTER TABLE customer_payouts 
ADD CONSTRAINT fk_payout_batch 
FOREIGN KEY (batch_id) REFERENCES payment_batches(id) ON DELETE SET NULL;

-- 5. Payment Batch Items Table
CREATE TABLE IF NOT EXISTS payment_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    payout_id UUID NOT NULL REFERENCES customer_payouts(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    bank_account_mask VARCHAR(30),
    bank_ifsc VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    beneficiary_reference VARCHAR(100),
    failure_reason TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_batch_payout UNIQUE (batch_id, payout_id),
    CONSTRAINT chk_batch_item_status CHECK (status IN (
        'PENDING', 'SUBMITTED', 'SETTLED', 'FAILED', 'CANCELLED', 'RECONCILED'
    ))
);

DROP TRIGGER IF EXISTS set_payment_batch_items_updated_at ON payment_batch_items;
CREATE TRIGGER set_payment_batch_items_updated_at
BEFORE UPDATE ON payment_batch_items
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON payment_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_payout ON payment_batch_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_cust ON payment_batch_items(customer_id);

-- 6. Payment Reconciliation Records Table
CREATE TABLE IF NOT EXISTS payment_reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    statement_import_id UUID,
    source VARCHAR(30) NOT NULL,
    external_reference VARCHAR(100) NOT NULL,
    external_event_id VARCHAR(100),
    transaction_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    direction VARCHAR(20) NOT NULL,
    raw_details JSONB,
    matched_payout_id UUID REFERENCES customer_payouts(id) ON DELETE SET NULL,
    matched_receipt_id UUID REFERENCES customer_receipts(id) ON DELETE SET NULL,
    matched_batch_id UUID REFERENCES payment_batches(id) ON DELETE SET NULL,
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED',
    resolution_action VARCHAR(40),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_recon_source CHECK (source IN ('MANUAL_VERIFICATION', 'BANK_STATEMENT_CSV', 'PAYMENT_GATEWAY_WEBHOOK')),
    CONSTRAINT chk_recon_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_recon_status CHECK (reconciliation_status IN (
        'MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'DUPLICATE_REFERENCE',
        'PARTIALLY_RECONCILED', 'MANUAL_REVIEW_REQUIRED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_recon_org_ref ON payment_reconciliation_records(organization_id, external_reference);
CREATE INDEX IF NOT EXISTS idx_recon_status ON payment_reconciliation_records(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_recon_payout ON payment_reconciliation_records(matched_payout_id);
CREATE INDEX IF NOT EXISTS idx_recon_receipt ON payment_reconciliation_records(matched_receipt_id);

-- 7. Payment Adjustments Table (Reversals & Compensations)
CREATE TABLE IF NOT EXISTS payment_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES customer_payouts(id) ON DELETE RESTRICT,
    receipt_id UUID REFERENCES customer_receipts(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(30) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_adj_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_adj_type CHECK (adjustment_type IN (
        'REVERSAL_CREDIT', 'REVERSAL_DEBIT', 'OVERPAYMENT_CLAWBACK', 'UNDERPAYMENT_COMPENSATION'
    ))
);

CREATE INDEX IF NOT EXISTS idx_payment_adj_cust ON payment_adjustments(customer_id);

-- 8. Payment Approvals Audit Table
CREATE TABLE IF NOT EXISTS payment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID NOT NULL,
    approver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL,
    comments TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_approval_action CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'OVERRIDDEN'))
);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_entity ON payment_approvals(entity_type, entity_id);

-- ==============================================================================
-- 9. STORED PROCEDURES & BUSINESS LOGIC FUNCTIONS
-- ==============================================================================

-- 9.1 Create Customer Payout
CREATE OR REPLACE FUNCTION public.create_customer_payout(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_allow_overpayment_advance BOOLEAN,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_ledger_account RECORD;
    v_payout_id UUID;
    v_existing_payout RECORD;
    v_eligible_balance NUMERIC(12,2);
    v_mask VARCHAR(30);
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_payout 
    FROM customer_payouts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_payout.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'payoutId', v_existing_payout.id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00);

    -- 4. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance %', p_amount, v_eligible_balance USING ERRCODE = '22003';
    END IF;

    -- 5. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 6. Insert Payout in PENDING_APPROVAL status
    INSERT INTO customer_payouts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        bank_account_mask,
        bank_ifsc,
        recipient_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payout_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'DAIRY_PAYS_CUSTOMER',
        p_amount,
        'INR',
        p_payment_method,
        'PENDING_APPROVAL',
        p_reference_number,
        COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
        p_source_transaction_id,
        p_idempotency_key,
        v_mask,
        v_customer.bank_ifsc_code,
        v_customer.full_name,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    -- 7. Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_organization_id,
        p_center_id,
        p_created_by,
        'PAYOUT_CREATED',
        'CUSTOMER_PAYOUT',
        v_payout_id,
        jsonb_build_object('amount', p_amount, 'status', 'PENDING_APPROVAL', 'payment_method', p_payment_method)
    );

    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'organizationId', p_organization_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', p_amount,
        'eligibleBalance', v_eligible_balance,
        'remainingPayable', v_eligible_balance - p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'bankAccountMask', v_mask,
        'idempotencyKey', p_idempotency_key,
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.2 Approve Customer Payout
CREATE OR REPLACE FUNCTION public.approve_customer_payout(
    p_payout_id UUID,
    p_approver_id UUID,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_approver RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
        RAISE EXCEPTION 'Payout % cannot be approved from status %', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
    IF v_approver.id IS NULL THEN
        RAISE EXCEPTION 'Approver % does not exist', p_approver_id USING ERRCODE = 'P0002';
    END IF;

    -- Separation of duties: Creator cannot approve their own payout unless DAIRY_OWNER or SUPER_ADMIN
    IF v_payout.created_by = p_approver_id AND v_approver.role NOT IN ('DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'SELF_APPROVAL_PROHIBITED: Initiator cannot approve their own payout request' USING ERRCODE = '42501';
    END IF;

    UPDATE customer_payouts
    SET status = 'APPROVED',
        approved_by = p_approver_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;

    INSERT INTO payment_approvals (
        organization_id,
        entity_type,
        entity_id,
        approver_id,
        action,
        comments
    ) VALUES (
        v_payout.organization_id,
        'PAYOUT',
        p_payout_id,
        p_approver_id,
        'APPROVED',
        p_comments
    );

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'APPROVED',
        'approvedBy', p_approver_id,
        'approvedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.3 Submit Customer Payout
CREATE OR REPLACE FUNCTION public.submit_customer_payout(
    p_payout_id UUID,
    p_operator_id UUID,
    p_payment_reference VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Payout % must be APPROVED before submission (current: %)', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    UPDATE customer_payouts
    SET status = 'SUBMITTED',
        submitted_at = NOW(),
        reference_number = COALESCE(p_payment_reference, reference_number),
        updated_at = NOW()
    WHERE id = p_payout_id;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'SUBMITTED',
        'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number),
        'submittedAt', NOW(),
        'ledgerEffectApplied', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.4 Settle Customer Payout (Atomic Subledger Debit & Journal Entry Posting)
CREATE OR REPLACE FUNCTION public.settle_customer_payout(
    p_payout_id UUID,
    p_settled_by UUID,
    p_payment_reference VARCHAR(100),
    p_settled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_settled_timestamp TIMESTAMPTZ;
    v_receipt_number VARCHAR(60);
    v_result JSONB;
BEGIN
    -- 1. Fetch Payout FOR UPDATE
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    -- Idempotency check: If already SETTLED, return existing record
    IF v_payout.status = 'SETTLED' THEN
        SELECT current_balance INTO v_new_balance 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_payout.customer_id;

        SELECT jsonb_build_object(
            'payoutId', v_payout.id,
            'status', 'SETTLED',
            'amount', v_payout.amount,
            'referenceNumber', v_payout.reference_number,
            'settledAt', v_payout.settled_at,
            'ledgerTransactionId', v_payout.ledger_transaction_id,
            'customerBalanceAfter', v_new_balance,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- Valid prior statuses for settlement: SUBMITTED or APPROVED (for direct cash settlement)
    IF v_payout.status NOT IN ('SUBMITTED', 'APPROVED') THEN
        RAISE EXCEPTION 'Payout % cannot be settled from status %', p_payout_id, v_payout.status USING ERRCODE = '22000';
    END IF;

    v_settled_timestamp := COALESCE(p_settled_at, NOW());

    -- 2. Fetch Customer and Center
    SELECT * INTO v_customer FROM customers WHERE id = v_payout.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_payout.center_id;

    -- 3. Lock Customer Ledger Account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_payout.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        -- Create ledger account if none exists
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_payout.customer_id, v_payout.organization_id, 'INR', 0.00, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    END IF;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance - v_payout.amount; -- Liability decreased by debit

    -- 4. Update Customer Ledger Account Balance
    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = v_settled_timestamp,
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- 5. Insert Append-Only Ledger Transaction Header
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        'PAYMENT_PAYOUT_DEBIT',
        'DEBIT',
        v_payout.amount,
        v_new_balance,
        'CUSTOMER_PAYMENT',
        v_payout.id,
        'Settled Payout via ' || v_payout.payment_method || ' Ref: ' || COALESCE(p_payment_reference, v_payout.reference_number, 'N/A'),
        v_payout.idempotency_key,
        p_settled_by,
        v_settled_timestamp
    );

    -- 6. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Customer Payable (Liability decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'DEBIT', v_payout.amount
    );

    -- Entry 2: Credit Cash/Bank (Asset decreases)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_payout.center_id, 'CASH_BANK', 'CREDIT', v_payout.amount
    );

    -- 7. Update Customer Payout Status to SETTLED
    UPDATE customer_payouts
    SET status = 'SETTLED',
        reference_number = COALESCE(p_payment_reference, reference_number),
        settled_at = v_settled_timestamp,
        ledger_transaction_id = v_ledger_txn_id,
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- 8. If part of a batch, update batch item status
    IF v_payout.batch_id IS NOT NULL THEN
        UPDATE payment_batch_items
        SET status = 'SETTLED',
            settled_at = v_settled_timestamp,
            beneficiary_reference = COALESCE(p_payment_reference, beneficiary_reference),
            updated_at = NOW()
        WHERE batch_id = v_payout.batch_id AND payout_id = p_payout_id;

        -- Update batch aggregate totals
        UPDATE payment_batches
        SET successful_count = successful_count + 1,
            successful_amount = successful_amount + v_payout.amount,
            pending_count = GREATEST(0, pending_count - 1),
            pending_amount = GREATEST(0.00, pending_amount - v_payout.amount),
            updated_at = NOW()
        WHERE id = v_payout.batch_id;
    END IF;

    -- 9. Insert Sync Event
    v_receipt_number := 'RCP-PAY-' || UPPER(SUBSTRING(v_payout.id::text, 1, 8));
    INSERT INTO sync_events (
        organization_id, center_id, entity_type, entity_id, action, payload
    ) VALUES (
        v_payout.organization_id,
        v_payout.center_id,
        'PAYMENT_PAYOUT',
        v_payout.id,
        'UPDATE',
        jsonb_build_object(
            'payoutId', v_payout.id,
            'amount', v_payout.amount,
            'balanceAfter', v_new_balance,
            'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number)
        )
    );

    -- 10. Return Result
    SELECT jsonb_build_object(
        'payoutId', v_payout.id,
        'receiptNumber', v_receipt_number,
        'organizationName', (SELECT name FROM organizations WHERE id = v_payout.organization_id),
        'centerName', v_center.name,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'amount', v_payout.amount,
        'currency', v_payout.currency,
        'paymentMethod', v_payout.payment_method,
        'status', 'SETTLED',
        'referenceNumber', COALESCE(p_payment_reference, v_payout.reference_number),
        'settledAt', v_settled_timestamp,
        'previousBalance', v_prev_balance,
        'customerBalanceAfter', v_new_balance,
        'ledgerTransactionId', v_ledger_txn_id,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.5 Fail Customer Payout
CREATE OR REPLACE FUNCTION public.fail_customer_payout(
    p_payout_id UUID,
    p_actor_id UUID,
    p_failure_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status = 'SETTLED' THEN
        RAISE EXCEPTION 'CANNOT_FAIL_SETTLED_PAYOUT: Payout is already settled; use reversal instead' USING ERRCODE = '22000';
    END IF;

    UPDATE customer_payouts
    SET status = 'FAILED',
        failed_at = NOW(),
        failure_reason = p_failure_reason,
        updated_at = NOW()
    WHERE id = p_payout_id;

    IF v_payout.batch_id IS NOT NULL THEN
        UPDATE payment_batch_items
        SET status = 'FAILED',
            failure_reason = p_failure_reason,
            updated_at = NOW()
        WHERE batch_id = v_payout.batch_id AND payout_id = p_payout_id;

        UPDATE payment_batches
        SET failed_count = failed_count + 1,
            failed_amount = failed_amount + v_payout.amount,
            pending_count = GREATEST(0, pending_count - 1),
            pending_amount = GREATEST(0.00, pending_amount - v_payout.amount),
            updated_at = NOW()
        WHERE id = v_payout.batch_id;
    END IF;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'FAILED',
        'failureReason', p_failure_reason,
        'failedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.6 Reverse Customer Payout (Compensation Workflow for Settled Payouts)
CREATE OR REPLACE FUNCTION public.reverse_customer_payout(
    p_payout_id UUID,
    p_actor_id UUID,
    p_reason TEXT,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_payout RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_payout 
    FROM customer_payouts 
    WHERE id = p_payout_id 
    FOR UPDATE;

    IF v_payout.id IS NULL THEN
        RAISE EXCEPTION 'Payout % does not exist', p_payout_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payout.status <> 'SETTLED' THEN
        RAISE EXCEPTION 'Only SETTLED payouts can be reversed (current: %)', v_payout.status USING ERRCODE = '22000';
    END IF;

    -- Fetch customer ledger account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_payout.customer_id 
    FOR UPDATE;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + v_payout.amount; -- Restore farmer payable liability

    -- Update running balance
    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- Insert Reversal Ledger Transaction
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        'PAYOUT_REVERSAL_CREDIT',
        'CREDIT',
        v_payout.amount,
        v_new_balance,
        'CUSTOMER_PAYMENT',
        v_payout.id,
        'Reversal of payout ' || v_payout.id || ': ' || p_reason,
        p_idempotency_key,
        p_actor_id,
        NOW()
    );

    -- Insert Balanced Journal Entries
    -- Entry 1: Debit Cash/Bank (Money returned to dairy)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_payout.center_id, 'CASH_BANK', 'DEBIT', v_payout.amount
    );

    -- Entry 2: Credit Customer Payable (Liability reinstated)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', v_payout.amount
    );

    -- Insert payment adjustment record
    INSERT INTO payment_adjustments (
        organization_id,
        center_id,
        customer_id,
        payout_id,
        adjustment_type,
        amount,
        reason,
        approved_by,
        ledger_transaction_id
    ) VALUES (
        v_payout.organization_id,
        v_payout.center_id,
        v_payout.customer_id,
        v_payout.id,
        'REVERSAL_CREDIT',
        v_payout.amount,
        p_reason,
        p_actor_id,
        v_ledger_txn_id
    );

    -- Mark payout REVERSED
    UPDATE customer_payouts
    SET status = 'REVERSED',
        updated_at = NOW()
    WHERE id = p_payout_id;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'REVERSED',
        'reversalReason', p_reason,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerBalanceAfter', v_new_balance,
        'reversedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.7 Create Customer Receipt (Farmer Pays Dairy)
CREATE OR REPLACE FUNCTION public.create_customer_receipt(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method VARCHAR(30),
    p_reference_number VARCHAR(100),
    p_source_transaction_type VARCHAR(50),
    p_source_transaction_id UUID,
    p_idempotency_key VARCHAR(128),
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_customer RECORD;
    v_receipt_id UUID;
    v_receipt_number VARCHAR(60);
    v_existing_receipt RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_existing_receipt 
    FROM customer_receipts 
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_receipt.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'receiptId', v_existing_receipt.id,
            'receiptNumber', v_existing_receipt.receipt_number,
            'customerId', v_existing_receipt.customer_id,
            'amount', v_existing_receipt.amount,
            'status', v_existing_receipt.status,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    SELECT * INTO v_customer 
    FROM customers 
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    v_receipt_id := gen_random_uuid();
    v_receipt_number := 'RCP-REC-' || UPPER(SUBSTRING(v_receipt_id::text, 1, 8));

    INSERT INTO customer_receipts (
        id,
        organization_id,
        center_id,
        customer_id,
        direction,
        amount,
        currency,
        payment_method,
        status,
        reference_number,
        receipt_number,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_receipt_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        'CUSTOMER_PAYS_DAIRY',
        p_amount,
        'INR',
        p_payment_method,
        'DRAFT',
        p_reference_number,
        v_receipt_number,
        COALESCE(p_source_transaction_type, 'DEBT_REPAYMENT'),
        p_source_transaction_id,
        p_idempotency_key,
        p_notes,
        p_created_by,
        NOW(),
        NOW()
    );

    SELECT jsonb_build_object(
        'receiptId', v_receipt_id,
        'receiptNumber', v_receipt_number,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'amount', p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'DRAFT',
        'referenceNumber', p_reference_number,
        'isIdempotentReplay', FALSE,
        'createdAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 9.8 Settle Customer Receipt (Atomic Subledger Credit & Balanced Double Entry)
CREATE OR REPLACE FUNCTION public.settle_customer_receipt(
    p_receipt_id UUID,
    p_settled_by UUID,
    p_reference_number VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_receipt RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_receipt 
    FROM customer_receipts 
    WHERE id = p_receipt_id 
    FOR UPDATE;

    IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Receipt % does not exist', p_receipt_id USING ERRCODE = 'P0002';
    END IF;

    IF v_receipt.status = 'SETTLED' THEN
        SELECT current_balance INTO v_new_balance 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_receipt.customer_id;

        SELECT jsonb_build_object(
            'receiptId', v_receipt.id,
            'receiptNumber', v_receipt.receipt_number,
            'status', 'SETTLED',
            'amount', v_receipt.amount,
            'customerBalanceAfter', v_new_balance,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    SELECT * INTO v_customer FROM customers WHERE id = v_receipt.customer_id;
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_receipt.center_id;

    -- Lock Ledger Account FOR UPDATE
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_receipt.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_receipt.customer_id, v_receipt.organization_id, 'INR', 0.00, NOW(), NOW()
        ) RETURNING * INTO v_ledger_account;
    END IF;

    v_prev_balance := v_ledger_account.current_balance;
    v_new_balance := v_prev_balance + v_receipt.amount; -- Credit reduces customer debt / increases customer balance

    UPDATE customer_ledger_accounts
    SET current_balance = v_new_balance,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ledger_account.id;

    -- Insert Append-Only Ledger Transaction Header
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id,
        organization_id,
        center_id,
        customer_id,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        reference_id,
        description,
        idempotency_key,
        created_by,
        created_at
    ) VALUES (
        v_ledger_txn_id,
        v_receipt.organization_id,
        v_receipt.center_id,
        v_receipt.customer_id,
        'CUSTOMER_RECEIPT_CREDIT',
        'CREDIT',
        v_receipt.amount,
        v_new_balance,
        'CUSTOMER_RECEIPT',
        v_receipt.id,
        'Customer Debt Repayment via ' || v_receipt.payment_method || ' Ref: ' || COALESCE(p_reference_number, v_receipt.reference_number),
        v_receipt.idempotency_key,
        p_settled_by,
        NOW()
    );

    -- Balanced Double-Entry Journal:
    -- Entry 1: Debit Cash/Bank (Money received by dairy)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_receipt.center_id, 'CASH_BANK', 'DEBIT', v_receipt.amount
    );

    -- Entry 2: Credit Customer Payable (Customer debt reduced / credit increased)
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_ledger_account.id, 'CUSTOMER_PAYABLE', 'CREDIT', v_receipt.amount
    );

    UPDATE customer_receipts
    SET status = 'SETTLED',
        reference_number = COALESCE(p_reference_number, reference_number),
        settled_at = NOW(),
        ledger_transaction_id = v_ledger_txn_id,
        updated_at = NOW()
    WHERE id = p_receipt_id;

    -- Insert Sync Event
    INSERT INTO sync_events (
        organization_id, center_id, entity_type, entity_id, action, payload
    ) VALUES (
        v_receipt.organization_id,
        v_receipt.center_id,
        'CUSTOMER_RECEIPT',
        v_receipt.id,
        'UPDATE',
        jsonb_build_object(
            'receiptId', v_receipt.id,
            'receiptNumber', v_receipt.receipt_number,
            'amount', v_receipt.amount,
            'customerBalanceAfter', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'receiptId', v_receipt.id,
        'receiptNumber', v_receipt.receipt_number,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'centerName', v_center.name,
        'amount', v_receipt.amount,
        'currency', v_receipt.currency,
        'paymentMethod', v_receipt.payment_method,
        'status', 'SETTLED',
        'referenceNumber', COALESCE(p_reference_number, v_receipt.reference_number),
        'settledAt', NOW(),
        'previousBalance', v_prev_balance,
        'customerBalanceAfter', v_new_balance,
        'ledgerTransactionId', v_ledger_txn_id,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES ON NEW TABLES
-- ==============================================================================

ALTER TABLE customer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_approvals ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access
DROP POLICY IF EXISTS service_role_payouts ON customer_payouts;
CREATE POLICY service_role_payouts ON customer_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_receipts ON customer_receipts;
CREATE POLICY service_role_receipts ON customer_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_batches ON payment_batches;
CREATE POLICY service_role_batches ON payment_batches FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_batch_items ON payment_batch_items;
CREATE POLICY service_role_batch_items ON payment_batch_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_reconcile ON payment_reconciliation_records;
CREATE POLICY service_role_reconcile ON payment_reconciliation_records FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_adjustments ON payment_adjustments;
CREATE POLICY service_role_adjustments ON payment_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_approvals ON payment_approvals;
CREATE POLICY service_role_approvals ON payment_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users: Tenant Isolation
DROP POLICY IF EXISTS tenant_isolation_payouts ON customer_payouts;
CREATE POLICY tenant_isolation_payouts ON customer_payouts
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN')
        OR (public.current_user_role() IN ('CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR') AND center_id = public.current_center_id())
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS tenant_isolation_receipts ON customer_receipts;
CREATE POLICY tenant_isolation_receipts ON customer_receipts
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN')
        OR (public.current_user_role() IN ('CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'COLLECTION_OPERATOR') AND center_id = public.current_center_id())
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS tenant_isolation_batches ON payment_batches;
CREATE POLICY tenant_isolation_batches ON payment_batches
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT')
);

DROP POLICY IF EXISTS tenant_isolation_batch_items ON payment_batch_items;
CREATE POLICY tenant_isolation_batch_items ON payment_batch_items
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM payment_batches pb WHERE pb.id = payment_batch_items.batch_id AND pb.organization_id = public.current_org_id())
);

DROP POLICY IF EXISTS tenant_isolation_recon ON payment_reconciliation_records;
CREATE POLICY tenant_isolation_recon ON payment_reconciliation_records
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'ACCOUNTANT')
);

-- Function execution grants
GRANT EXECUTE ON FUNCTION public.create_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_receipt TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_customer_receipt TO authenticated, service_role;
