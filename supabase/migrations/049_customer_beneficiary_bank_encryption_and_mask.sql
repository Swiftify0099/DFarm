-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 049: CUSTOMER BENEFICIARY BANK SCHEMA, ENCRYPTION CAPACITY & MASK
-- TARGET: TENANT_OPERATIONAL (RESTART-10.4 / DF-022 / DF-024)
-- ==============================================================================
-- Preserves all historical customer rows and bank values without truncation,
-- table drops, or exposing raw beneficiary account numbers.
-- ==============================================================================

-- 1. Widen customers.bank_account_number from VARCHAR(50) to TEXT so AES-256-GCM
--    envelope ciphertext (iv:authTag:ciphertext, ~76-94+ chars) fits without truncation.
ALTER TABLE public.customers
    ALTER COLUMN bank_account_number TYPE TEXT;

-- 2. Add customer-level masked bank account storage column.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS bank_account_mask VARCHAR(30);

-- 3. Backfill bank_account_mask ONLY for recognizable legacy numeric plaintext accounts
--    (strictly 9-18 ASCII digits, not all zeroes). Ciphertext (iv:authTag:ciphertext) and
--    malformed/ambiguous values are intentionally skipped and never tail-sliced.
UPDATE public.customers
SET bank_account_mask = 'XXXX-XXXX-' || RIGHT(BTRIM(bank_account_number), 4)
WHERE (bank_account_mask IS NULL OR BTRIM(bank_account_mask) = '')
  AND bank_account_number IS NOT NULL
  AND BTRIM(bank_account_number) ~ '^[0-9]{9,18}$'
  AND BTRIM(bank_account_number) !~ '^0+$';

-- 4. Update public.create_customer_payout(...) using the exact existing 12-arg signature.
--    Preserves all financial invariants and return contract fields from migrations 021/026,
--    deriving payout bank_account_mask solely from v_customer.bank_account_mask rather than
--    RIGHT(v_customer.bank_account_number, 4) (which is unsafe on AES ciphertext).
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
            'organizationId', v_existing_payout.organization_id,
            'centerId', v_existing_payout.center_id,
            'customerId', v_existing_payout.customer_id,
            'amount', v_existing_payout.amount,
            'currency', v_existing_payout.currency,
            'paymentMethod', v_existing_payout.payment_method,
            'status', v_existing_payout.status,
            'referenceNumber', v_existing_payout.reference_number,
            'bankAccountMask', v_existing_payout.bank_account_mask,
            'idempotencyKey', v_existing_payout.idempotency_key,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer (organization ownership + deletion protection)
    SELECT * INTO v_customer
    FROM customers
    WHERE id = p_customer_id AND organization_id = p_organization_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist in organization %', p_customer_id, p_organization_id USING ERRCODE = 'P0002';
    END IF;

    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is deleted and cannot receive payouts', p_customer_id USING ERRCODE = '22000';
    END IF;

    -- 3. Check Customer Ledger Balance with Row Locking for Concurrency Safety
    INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
    VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_ledger_account
    FROM customer_ledger_accounts
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00);

    -- 4. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance %',
            p_amount, v_eligible_balance USING ERRCODE = '22003';
    END IF;

    -- 5. Mask Bank Details: consume precomputed customer-level mask only (never slice ciphertext)
    v_mask := NULLIF(BTRIM(v_customer.bank_account_mask), '');

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

    -- 8. Return masked payout summary preserving both 021 and 026 contract fields
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
        'eligibleBalanceBefore', v_eligible_balance,
        'eligibleBalanceAfter', v_eligible_balance - p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'sourceTransactionType', COALESCE(p_source_transaction_type, 'MANUAL_PAYOUT'),
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

ALTER FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
