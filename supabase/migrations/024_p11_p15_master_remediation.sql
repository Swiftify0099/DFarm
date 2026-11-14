-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 023: MASTER REMEDIATION (PHASES P11 TO P15)
-- Concurrency-Safe Billing Period Exclusion, Overpayment Protection,
-- Durable Financial Reconciliation & Constraint Hardening
-- ==============================================================================

-- 1. Enable btree_gist extension for PostgreSQL exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add concurrency-safe GiST exclusion constraint on billing_periods
-- Ensures no two non-cancelled billing periods for the same center can have overlapping date ranges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ex_billing_periods_no_overlap'
    ) THEN
        ALTER TABLE billing_periods
        ADD CONSTRAINT ex_billing_periods_no_overlap
        EXCLUDE USING gist (
            center_id WITH =,
            daterange(start_date, end_date, '[]') WITH &&
        )
        WHERE (status <> 'CANCELLED');
    END IF;
END $$;

-- 3. Create index for fast payout status and beneficiary lookups
CREATE INDEX IF NOT EXISTS idx_customer_payouts_cust_status ON customer_payouts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_payouts_center_date ON customer_payouts(center_id, created_at);

-- 4. Harden create_customer_payout with Pending Reserved Balance Protection
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
    v_pending_reserved NUMERIC(12,2) := 0.00;
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

    -- 3. Check Customer Ledger Balance with Row Locking for Concurrency Safety
    INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
    VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = p_customer_id 
    FOR UPDATE;

    -- 4. Calculate Pending Reserved Payouts (Active payouts not yet settled or failed)
    SELECT COALESCE(SUM(amount), 0.00) INTO v_pending_reserved
    FROM customer_payouts
    WHERE customer_id = p_customer_id
      AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');

    -- Eligible Payable = Verified Liability - Pending Reserved Payouts
    v_eligible_balance := COALESCE(v_ledger_account.current_balance, 0.00) - v_pending_reserved;

    -- 5. Overpayment Protection
    IF p_allow_overpayment_advance = FALSE AND p_amount > v_eligible_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_PERMITTED: Payout amount % exceeds eligible payable balance % (Gross balance: %, Pending reserved: %)',
            p_amount, v_eligible_balance, v_ledger_account.current_balance, v_pending_reserved USING ERRCODE = '22003';
    END IF;

    -- 6. Mask Bank Details
    IF v_customer.bank_account_number IS NOT NULL AND LENGTH(v_customer.bank_account_number) >= 4 THEN
        v_mask := 'XXXX-XXXX-' || RIGHT(v_customer.bank_account_number, 4);
    ELSE
        v_mask := NULL;
    END IF;

    v_payout_id := gen_random_uuid();

    -- 7. Insert Payout in PENDING_APPROVAL status
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

    SELECT jsonb_build_object(
        'payoutId', v_payout_id,
        'customerId', p_customer_id,
        'amount', p_amount,
        'currency', 'INR',
        'paymentMethod', p_payment_method,
        'status', 'PENDING_APPROVAL',
        'referenceNumber', p_reference_number,
        'idempotencyKey', p_idempotency_key,
        'eligibleBalanceBefore', v_eligible_balance,
        'eligibleBalanceAfter', v_eligible_balance - p_amount,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 5. Set function ownership and permissions
ALTER FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_customer_payout(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
