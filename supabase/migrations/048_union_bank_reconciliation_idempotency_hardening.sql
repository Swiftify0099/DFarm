-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 048: UNION BANK RECONCILIATION IDEMPOTENCY & TENANT RLS HARDENING
-- (DF-022 / RESTART-10)
-- ==============================================================================

-- 1. Allow 'REVERSED' status on payment_batch_items for Reverse MIS compensations
ALTER TABLE payment_batch_items DROP CONSTRAINT IF EXISTS chk_batch_item_status;
ALTER TABLE payment_batch_items ADD CONSTRAINT chk_batch_item_status CHECK (status IN (
    'PENDING', 'CALCULATED', 'APPROVED', 'SUBMITTED', 'SUBMITTED_TO_BANK',
    'PROCESSING', 'SETTLED', 'PAID', 'FAILED', 'REVERSED', 'UNKNOWN', 'CANCELLED', 'RECONCILED'
));

-- 2. Durable idempotency key on payment_adjustments for exact replay vs conflict checks
ALTER TABLE payment_adjustments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_adjustments_org_idempotency
    ON payment_adjustments(organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 2b. Durable idempotency key on bank_submissions & tenant webhook event uniqueness (DF-022)
ALTER TABLE bank_submissions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_submissions_org_idempotency
    ON bank_submissions(organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_org_external_event
    ON payment_reconciliation_records(organization_id, external_event_id)
    WHERE external_event_id IS NOT NULL;

-- 2c. Per-dairy optional authorized corporate debit account metadata (DF-024 fail-closed support)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_debit_account_encrypted TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_debit_account_mask VARCHAR(30);

-- 3. Prevent duplicate MATCHED reconciliation records for the same payout, action & bank ref
--    (Preserves DUPLICATE_REFERENCE audit rows where matched_payout_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_org_payout_action_ref_matched
    ON payment_reconciliation_records(
        organization_id,
        matched_payout_id,
        resolution_action,
        external_reference
    )
    WHERE reconciliation_status = 'MATCHED'
      AND matched_payout_id IS NOT NULL
      AND resolution_action IS NOT NULL
      AND external_reference IS NOT NULL;

-- 4. Harden fail_customer_payout for idempotency and reversal safety
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

    IF v_payout.status = 'REVERSED' THEN
        RAISE EXCEPTION 'CANNOT_FAIL_REVERSED_PAYOUT: Payout is already reversed' USING ERRCODE = '22000';
    END IF;

    -- Idempotent replay: do not increment batch failure aggregates a second time
    IF v_payout.status = 'FAILED' THEN
        SELECT jsonb_build_object(
            'payoutId', p_payout_id,
            'status', 'FAILED',
            'failureReason', COALESCE(v_payout.failure_reason, p_failure_reason),
            'failedAt', v_payout.failed_at,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
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
        'failedAt', NOW(),
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- 5. Harden reverse_customer_payout for replay idempotency, conflict detection & batch item update
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
    v_existing_txn RECORD;
    v_existing_adj RECORD;
    v_stored_key VARCHAR(128);
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

    -- Handle already-REVERSED payouts BEFORE checking <> 'SETTLED'
    IF v_payout.status = 'REVERSED' THEN
        SELECT id, idempotency_key, balance_after, created_at
        INTO v_existing_txn
        FROM ledger_transactions
        WHERE reference_entity = 'CUSTOMER_PAYMENT'
          AND reference_id = v_payout.id
          AND transaction_type = 'PAYOUT_REVERSAL_CREDIT'
        ORDER BY created_at DESC
        LIMIT 1;

        SELECT id, idempotency_key, reason, created_at
        INTO v_existing_adj
        FROM payment_adjustments
        WHERE payout_id = v_payout.id
          AND adjustment_type = 'REVERSAL_CREDIT'
        ORDER BY created_at DESC
        LIMIT 1;

        v_stored_key := COALESCE(v_existing_adj.idempotency_key, v_existing_txn.idempotency_key);

        IF p_idempotency_key IS NOT NULL
           AND v_stored_key IS NOT NULL
           AND v_stored_key <> p_idempotency_key THEN
            RAISE EXCEPTION 'CONFLICTING_REVERSAL_REFERENCE: Payout % is already reversed under key %',
                p_payout_id, v_stored_key USING ERRCODE = '22000';
        END IF;

        SELECT current_balance INTO v_new_balance
        FROM customer_ledger_accounts
        WHERE customer_id = v_payout.customer_id;

        SELECT jsonb_build_object(
            'payoutId', p_payout_id,
            'status', 'REVERSED',
            'reversalReason', COALESCE(v_existing_adj.reason, p_reason),
            'ledgerTransactionId', v_existing_txn.id,
            'customerBalanceAfter', COALESCE(v_new_balance, v_existing_txn.balance_after, 0.00),
            'reversedAt', COALESCE(v_existing_txn.created_at, v_payout.updated_at),
            'isIdempotentReplay', TRUE
        ) INTO v_result;

        RETURN v_result;
    END IF;

    IF v_payout.status <> 'SETTLED' THEN
        RAISE EXCEPTION 'Only SETTLED payouts can be reversed (current: %)', v_payout.status USING ERRCODE = '22000';
    END IF;

    -- Fetch customer ledger account FOR UPDATE
    SELECT * INTO v_ledger_account
    FROM customer_ledger_accounts
    WHERE customer_id = v_payout.customer_id
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        RAISE EXCEPTION 'LEDGER_ACCOUNT_NOT_FOUND: Customer ledger account missing for customer %',
            v_payout.customer_id USING ERRCODE = 'P0002';
    END IF;

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
    INSERT INTO ledger_entries (
        transaction_id, account_id, account_type, entry_type, amount
    ) VALUES (
        v_ledger_txn_id, v_payout.center_id, 'CASH_BANK', 'DEBIT', v_payout.amount
    );

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
        idempotency_key,
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
        p_idempotency_key,
        p_actor_id,
        v_ledger_txn_id
    );

    -- Mark payout REVERSED
    UPDATE customer_payouts
    SET status = 'REVERSED',
        failure_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- Keep batch item synchronized if attached to a payment batch
    IF v_payout.batch_id IS NOT NULL THEN
        UPDATE payment_batch_items
        SET status = 'REVERSED',
            failure_reason = p_reason,
            updated_at = NOW()
        WHERE batch_id = v_payout.batch_id AND payout_id = p_payout_id;
    END IF;

    SELECT jsonb_build_object(
        'payoutId', p_payout_id,
        'status', 'REVERSED',
        'reversalReason', p_reason,
        'ledgerTransactionId', v_ledger_txn_id,
        'customerBalanceAfter', v_new_balance,
        'reversedAt', NOW(),
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

GRANT EXECUTE ON FUNCTION public.fail_customer_payout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_customer_payout TO authenticated, service_role;

-- 6. Tenant database transaction-local session RLS helper & policies
--    Only applies when Supabase request.jwt.claims is absent (direct TenantDatabaseManager connections).
CREATE OR REPLACE FUNCTION public.current_app_org_id()
RETURNS UUID AS $$
DECLARE
    v_jwt TEXT;
    v_org TEXT;
BEGIN
    v_jwt := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF v_jwt IS NOT NULL THEN
        RETURN NULL;
    END IF;

    v_org := NULLIF(pg_catalog.current_setting('app.current_organization_id', true), '');
    IF v_org IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_org ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN v_org::UUID;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public;

GRANT EXECUTE ON FUNCTION public.current_app_org_id() TO PUBLIC;

ALTER TABLE beneficiary_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settlement_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_beneficiary_audit_logs ON beneficiary_audit_logs;
CREATE POLICY service_role_beneficiary_audit_logs ON beneficiary_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_bank_submissions ON bank_submissions;
CREATE POLICY service_role_bank_submissions ON bank_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_payment_settlement_snapshots ON payment_settlement_snapshots;
CREATE POLICY service_role_payment_settlement_snapshots ON payment_settlement_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_session_organizations ON organizations;
CREATE POLICY tenant_session_organizations ON organizations
    FOR ALL TO PUBLIC
    USING (id = public.current_app_org_id())
    WITH CHECK (id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_dairy_centers ON dairy_centers;
CREATE POLICY tenant_session_dairy_centers ON dairy_centers
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_customers ON customers;
CREATE POLICY tenant_session_customers ON customers
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_customer_ledger_accounts ON customer_ledger_accounts;
CREATE POLICY tenant_session_customer_ledger_accounts ON customer_ledger_accounts
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_ledger_transactions ON ledger_transactions;
CREATE POLICY tenant_session_ledger_transactions ON ledger_transactions
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_ledger_entries ON ledger_entries;
CREATE POLICY tenant_session_ledger_entries ON ledger_entries
    FOR ALL TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.id = ledger_entries.transaction_id
              AND lt.organization_id = public.current_app_org_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.id = ledger_entries.transaction_id
              AND lt.organization_id = public.current_app_org_id()
        )
    );

DROP POLICY IF EXISTS tenant_session_customer_payouts ON customer_payouts;
CREATE POLICY tenant_session_customer_payouts ON customer_payouts
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_customer_receipts ON customer_receipts;
CREATE POLICY tenant_session_customer_receipts ON customer_receipts
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_milk_collections ON milk_collections;
CREATE POLICY tenant_session_milk_collections ON milk_collections
    FOR ALL TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM dairy_centers dc
            WHERE dc.id = milk_collections.center_id
              AND dc.organization_id = public.current_app_org_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM dairy_centers dc
            WHERE dc.id = milk_collections.center_id
              AND dc.organization_id = public.current_app_org_id()
        )
    );

DROP POLICY IF EXISTS tenant_session_payment_batches ON payment_batches;
CREATE POLICY tenant_session_payment_batches ON payment_batches
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_payment_batch_items ON payment_batch_items;
CREATE POLICY tenant_session_payment_batch_items ON payment_batch_items
    FOR ALL TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM payment_batches pb
            WHERE pb.id = payment_batch_items.batch_id
              AND pb.organization_id = public.current_app_org_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM payment_batches pb
            WHERE pb.id = payment_batch_items.batch_id
              AND pb.organization_id = public.current_app_org_id()
        )
    );

DROP POLICY IF EXISTS tenant_session_payment_recon_records ON payment_reconciliation_records;
CREATE POLICY tenant_session_payment_recon_records ON payment_reconciliation_records
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_payment_adjustments ON payment_adjustments;
CREATE POLICY tenant_session_payment_adjustments ON payment_adjustments
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_payment_approvals ON payment_approvals;
CREATE POLICY tenant_session_payment_approvals ON payment_approvals
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_bank_submissions ON bank_submissions;
CREATE POLICY tenant_session_bank_submissions ON bank_submissions
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_payment_settlement_snapshots ON payment_settlement_snapshots;
CREATE POLICY tenant_session_payment_settlement_snapshots ON payment_settlement_snapshots
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_beneficiary_audit_logs ON beneficiary_audit_logs;
CREATE POLICY tenant_session_beneficiary_audit_logs ON beneficiary_audit_logs
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_sync_events ON sync_events;
CREATE POLICY tenant_session_sync_events ON sync_events
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());

DROP POLICY IF EXISTS tenant_session_audit_logs ON audit_logs;
CREATE POLICY tenant_session_audit_logs ON audit_logs
    FOR ALL TO PUBLIC
    USING (organization_id = public.current_app_org_id())
    WITH CHECK (organization_id = public.current_app_org_id());
