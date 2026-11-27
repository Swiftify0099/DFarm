-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 047: ADVANCE RESPONSE CONTRACT — ADD balanceAfter ALIAS
-- ==============================================================================
-- Target: TENANT_OPERATIONAL
-- Reason: post_customer_advance() returns 'newBalance' for new execution but
--         'balanceAfter' for idempotent replay. The test suite (and all API
--         consumers documented in RESTART-03.5) reads data.balanceAfter.
--         This additive patch makes the new-execution path also return
--         'balanceAfter' (alias of 'newBalance'), while keeping 'newBalance'
--         as a backwards-compatible field.
--         Migration 019 is already applied and must NOT be edited in place.
-- ==============================================================================

-- Re-create post_customer_advance with consistent balanceAfter field on both
-- new-execution and idempotent-replay paths.
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

    -- 1. Idempotency check: Return existing transaction if duplicate.
    --    Returns BOTH balanceAfter AND newBalance for consistency.
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
            'newBalance', v_existing_txn.balance_after,
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
    -- BOTH 'balanceAfter' and 'newBalance' are returned for a stable contract:
    --   • 'balanceAfter'  — authoritative field, always present (new execution + replay)
    --   • 'newBalance'    — backwards-compatible alias kept for existing consumers
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
        'balanceAfter', v_new_balance,
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
