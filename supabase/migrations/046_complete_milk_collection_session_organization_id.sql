-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 046: ALIGN complete_milk_collection_session WITH 039 organization_id NOT NULL
-- ==============================================================================
-- Target: TENANT_OPERATIONAL
-- Purpose:
--   Migration 039 added NOT NULL on milk_collections.organization_id and replaced
--   global idempotency uniqueness with (organization_id, idempotency_key).
--   Update public.complete_milk_collection_session to populate organization_id
--   from the verified center and scope idempotency lookups by organization_id.

CREATE OR REPLACE FUNCTION public.complete_milk_collection_session(
    p_session_id UUID,
    p_operator_id UUID,
    p_device_id VARCHAR(100),
    p_net_weight NUMERIC(6,2),
    p_fat_percentage NUMERIC(3,1),
    p_snf_percentage NUMERIC(3,1),
    p_measurement_unit VARCHAR(10) DEFAULT 'KG',
    p_reading_source VARCHAR(30) DEFAULT 'MANUAL_ENTRY',
    p_client_intake_uuid UUID DEFAULT NULL,
    p_idempotency_key VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_session RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_center_settings RECORD;
    v_rate_chart_version_id UUID;
    v_version_number INT;
    v_rate_per_unit NUMERIC(6,2);
    v_total_amount NUMERIC(10,2);
    v_existing_collection RECORD;
    v_collection_id UUID;
    v_ledger_account RECORD;
    v_customer_ledger_account_id UUID;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_receipt_number VARCHAR(60);
    v_intake_uuid UUID;
    v_idempotency_key VARCHAR(128);
    v_fat_min NUMERIC(3,1);
    v_fat_max NUMERIC(3,1);
    v_snf_min NUMERIC(3,1);
    v_snf_max NUMERIC(3,1);
    v_cat_auth BOOLEAN;
    v_result JSONB;
BEGIN
    v_intake_uuid := COALESCE(p_client_intake_uuid, gen_random_uuid());
    v_idempotency_key := COALESCE(p_idempotency_key, 'IDEM-' || p_session_id::text || '-' || v_intake_uuid::text);

    -- 1. Fetch session FOR UPDATE
    SELECT * INTO v_session FROM collection_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Collection session % does not exist', p_session_id USING ERRCODE = 'P0002';
    END IF;

    -- 2. Verify Center & Organization early for tenant-scoped idempotency
    SELECT * INTO v_center FROM dairy_centers WHERE id = v_session.center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', v_session.center_id USING ERRCODE = '22000';
    END IF;

    -- 3. Idempotency Check: Return already committed collection if identical (organization_id, idempotency_key)
    SELECT mc.*, lt.balance_after, lt.id AS ledger_txn_id
    INTO v_existing_collection
    FROM milk_collections mc
    JOIN ledger_transactions lt ON lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION'
    WHERE mc.organization_id = v_center.organization_id
      AND mc.idempotency_key = v_idempotency_key;

    IF v_existing_collection.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'collectionId', v_existing_collection.id,
            'sessionId', v_existing_collection.session_id,
            'centerId', v_existing_collection.center_id,
            'customerId', v_existing_collection.customer_id,
            'businessDate', v_existing_collection.business_date,
            'shiftType', v_existing_collection.shift_type,
            'milkCategory', v_existing_collection.milk_category,
            'netWeight', v_existing_collection.net_weight,
            'measurementUnit', v_existing_collection.measurement_unit,
            'fatPercentage', v_existing_collection.fat_percentage,
            'snfPercentage', v_existing_collection.snf_percentage,
            'appliedRatePerUnit', v_existing_collection.applied_rate_per_unit,
            'totalAmount', v_existing_collection.total_amount,
            'transactionStatus', v_existing_collection.transaction_status,
            'clientIntakeUuid', v_existing_collection.client_intake_uuid,
            'idempotencyKey', v_existing_collection.idempotency_key,
            'ledgerTransactionId', v_existing_collection.ledger_txn_id,
            'customerBalanceAfter', v_existing_collection.balance_after,
            'receiptNumber', 'RCP-' || UPPER(SUBSTRING(v_existing_collection.id::text, 1, 8)),
            'isIdempotentReplay', TRUE,
            'completedAt', v_existing_collection.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    IF v_session.session_state = 'COMPLETED' THEN
        RAISE EXCEPTION 'Collection session % has already been completed', p_session_id USING ERRCODE = '22000';
    END IF;

    IF v_session.session_state = 'CANCELLED' THEN
        RAISE EXCEPTION 'Collection session % has been cancelled', p_session_id USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Customer
    SELECT * INTO v_customer FROM customers WHERE id = v_session.customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or is deleted', v_session.customer_id USING ERRCODE = '22000';
    END IF;

    -- 5. Verify Milk Category permission
    SELECT EXISTS (
        SELECT 1 FROM customer_milk_categories
        WHERE customer_id = v_session.customer_id
          AND milk_category = v_session.selected_milk_category
          AND is_authorized = TRUE
    ) INTO v_cat_auth;

    IF NOT v_cat_auth THEN
        RAISE EXCEPTION 'Customer % is not authorized for category %', v_session.customer_id, v_session.selected_milk_category USING ERRCODE = '22023';
    END IF;

    -- 6. Validate measurements against center_settings
    SELECT * INTO v_center_settings FROM center_settings WHERE center_id = v_session.center_id;

    IF v_session.selected_milk_category = 'COW' THEN
        v_fat_min := COALESCE(v_center_settings.cow_fat_min, 2.8);
        v_fat_max := COALESCE(v_center_settings.cow_fat_max, 6.0);
        v_snf_min := COALESCE(v_center_settings.cow_snf_min, 7.8);
        v_snf_max := COALESCE(v_center_settings.cow_snf_max, 10.2);
    ELSE
        v_fat_min := COALESCE(v_center_settings.buffalo_fat_min, 5.0);
        v_fat_max := COALESCE(v_center_settings.buffalo_fat_max, 12.0);
        v_snf_min := COALESCE(v_center_settings.buffalo_snf_min, 8.2);
        v_snf_max := COALESCE(v_center_settings.buffalo_snf_max, 11.5);
    END IF;

    IF p_net_weight <= 0.00 OR p_net_weight > 500.00 THEN
        RAISE EXCEPTION 'Invalid net weight %: must be between 0.01 and 500.00 kg', p_net_weight USING ERRCODE = '22003';
    END IF;

    IF p_fat_percentage < v_fat_min OR p_fat_percentage > v_fat_max THEN
        RAISE EXCEPTION 'Invalid % Fat %: allowed bounds are % to %', v_session.selected_milk_category, p_fat_percentage, v_fat_min, v_fat_max USING ERRCODE = '22003';
    END IF;

    IF p_snf_percentage < v_snf_min OR p_snf_percentage > v_snf_max THEN
        RAISE EXCEPTION 'Invalid % SNF %: allowed bounds are % to %', v_session.selected_milk_category, p_snf_percentage, v_snf_min, v_snf_max USING ERRCODE = '22003';
    END IF;

    -- 7. Insert Quality & Weight Readings into session audit tables
    INSERT INTO collection_quality_readings (
        session_id, fat_percentage, snf_percentage, validation_status, reading_source, recorded_at
    ) VALUES (
        p_session_id, p_fat_percentage, p_snf_percentage, 'VALID', p_reading_source, NOW()
    );

    INSERT INTO collection_weight_readings (
        session_id, measured_weight, measurement_unit, tare_weight, net_weight, validation_status, reading_source, recorded_at
    ) VALUES (
        p_session_id, p_net_weight, p_measurement_unit, 0.00, p_net_weight, 'VALID', p_reading_source, NOW()
    );

    -- 8. Rate Resolution
    SELECT rcv.id, rcv.version_number
    INTO v_rate_chart_version_id, v_version_number
    FROM rate_applicability_rules rar
    JOIN rate_charts rc ON rc.id = rar.rate_chart_id
    JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
    WHERE rar.center_id = v_session.center_id
      AND rar.is_active = TRUE
      AND rc.milk_category = v_session.selected_milk_category
      AND rc.is_active = TRUE
      AND rcv.is_approved = TRUE
      AND rcv.effective_from <= NOW()
      AND (rcv.effective_to IS NULL OR rcv.effective_to >= NOW())
    ORDER BY rar.priority ASC, rcv.effective_from DESC, rcv.version_number DESC
    LIMIT 1;

    IF v_rate_chart_version_id IS NULL THEN
        SELECT rcv.id, rcv.version_number
        INTO v_rate_chart_version_id, v_version_number
        FROM rate_charts rc
        JOIN rate_chart_versions rcv ON rcv.rate_chart_id = rc.id
        WHERE (rc.center_id = v_session.center_id OR (rc.center_id IS NULL AND rc.organization_id = v_center.organization_id))
          AND rc.milk_category = v_session.selected_milk_category
          AND rc.is_active = TRUE
          AND rcv.is_approved = TRUE
          AND rcv.effective_from <= NOW()
          AND (rcv.effective_to IS NULL OR rcv.effective_to >= NOW())
        ORDER BY (rc.center_id IS NOT NULL) DESC, rcv.effective_from DESC, rcv.version_number DESC
        LIMIT 1;
    END IF;

    IF v_rate_chart_version_id IS NULL THEN
        RAISE EXCEPTION 'No active approved rate chart found for center % and category %', v_session.center_id, v_session.selected_milk_category USING ERRCODE = 'P0002';
    END IF;

    SELECT rate_per_unit INTO v_rate_per_unit
    FROM rate_chart_cells
    WHERE rate_chart_version_id = v_rate_chart_version_id
      AND fat_percentage = p_fat_percentage
      AND snf_percentage = p_snf_percentage;

    IF v_rate_per_unit IS NULL THEN
        RAISE EXCEPTION 'RATE_CELL_NOT_FOUND: No approved rate cell found for version % at Fat: %, SNF: %', v_rate_chart_version_id, p_fat_percentage, p_snf_percentage USING ERRCODE = '22000';
    END IF;

    v_total_amount := ROUND(p_net_weight * v_rate_per_unit, 2);

    -- 9. Insert into milk_collections including organization_id (required by migration 039)
    v_collection_id := gen_random_uuid();
    INSERT INTO milk_collections (
        id,
        session_id,
        organization_id,
        center_id,
        customer_id,
        business_date,
        shift_type,
        milk_category,
        net_weight,
        measurement_unit,
        fat_percentage,
        snf_percentage,
        rate_chart_version_id,
        applied_rate_per_unit,
        total_amount,
        transaction_status,
        client_intake_uuid,
        idempotency_key,
        created_at,
        synced_at
    ) VALUES (
        v_collection_id,
        p_session_id,
        v_center.organization_id,
        v_session.center_id,
        v_session.customer_id,
        v_session.business_date,
        v_session.shift_type,
        v_session.selected_milk_category,
        p_net_weight,
        p_measurement_unit,
        p_fat_percentage,
        p_snf_percentage,
        v_rate_chart_version_id,
        v_rate_per_unit,
        v_total_amount,
        'COMPLETED',
        v_intake_uuid,
        v_idempotency_key,
        NOW(),
        NOW()
    );

    -- 10. Customer Ledger Account: Atomic balance update with row lock
    SELECT * INTO v_ledger_account
    FROM customer_ledger_accounts
    WHERE customer_id = v_session.customer_id
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
        ) VALUES (
            v_session.customer_id, v_center.organization_id, 'INR', v_total_amount, NOW(), NOW()
        ) RETURNING id, current_balance INTO v_customer_ledger_account_id, v_new_balance;
        v_prev_balance := 0.00;
    ELSE
        v_customer_ledger_account_id := v_ledger_account.id;
        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance + v_total_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_customer_ledger_account_id;
    END IF;

    -- 11. Insert Ledger Transaction (Credit)
    v_ledger_txn_id := gen_random_uuid();
    INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id, transaction_type,
        direction, amount, balance_after, reference_entity, reference_id,
        description, idempotency_key, created_by, created_at
    ) VALUES (
        v_ledger_txn_id, v_center.organization_id, v_session.center_id, v_session.customer_id, 'MILK_COLLECTION_CREDIT',
        'CREDIT', v_total_amount, v_new_balance, 'MILK_COLLECTION', v_collection_id,
        'Milk Collection ' || v_session.selected_milk_category || ': ' || p_net_weight || ' ' || p_measurement_unit || ' @ Rs ' || v_rate_per_unit,
        v_idempotency_key, p_operator_id, NOW()
    );

    -- 12. Insert Balanced Double-Entry Journal Entries
    INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
    VALUES (v_ledger_txn_id, v_session.center_id, 'MILK_PURCHASE_EXPENSE', 'DEBIT', v_total_amount);

    INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
    VALUES (v_ledger_txn_id, v_customer_ledger_account_id, 'CUSTOMER_PAYABLE', 'CREDIT', v_total_amount);

    -- 13. Update Collection Session state to COMPLETED
    UPDATE collection_sessions
    SET session_state = 'COMPLETED',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- 14. Create Sync Event & Audit Log
    v_receipt_number := 'RCP-' || UPPER(SUBSTRING(v_collection_id::text, 1, 8));

    INSERT INTO sync_events (organization_id, center_id, entity_type, entity_id, action, payload)
    VALUES (
        v_center.organization_id,
        v_session.center_id,
        'MILK_COLLECTION',
        v_collection_id,
        'INSERT',
        jsonb_build_object(
            'collectionId', v_collection_id,
            'sessionId', p_session_id,
            'customerId', v_session.customer_id,
            'totalAmount', v_total_amount,
            'receiptNumber', v_receipt_number,
            'idempotencyKey', v_idempotency_key
        )
    );

    INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, new_values)
    VALUES (
        v_center.organization_id,
        v_session.center_id,
        p_operator_id,
        'MILK_COLLECTION_COMPLETED',
        'MILK_COLLECTION',
        v_collection_id,
        jsonb_build_object(
            'netWeight', p_net_weight,
            'fatPercentage', p_fat_percentage,
            'snfPercentage', p_snf_percentage,
            'rate', v_rate_per_unit,
            'amount', v_total_amount,
            'balanceAfter', v_new_balance
        )
    );

    SELECT jsonb_build_object(
        'collectionId', v_collection_id,
        'sessionId', p_session_id,
        'centerId', v_session.center_id,
        'centerName', v_center.name,
        'centerCode', v_center.code,
        'customerId', v_session.customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'businessDate', v_session.business_date,
        'shiftType', v_session.shift_type,
        'milkCategory', v_session.selected_milk_category,
        'netWeight', p_net_weight,
        'measurementUnit', p_measurement_unit,
        'fatPercentage', p_fat_percentage,
        'snfPercentage', p_snf_percentage,
        'rateChartVersionId', v_rate_chart_version_id,
        'appliedRatePerUnit', v_rate_per_unit,
        'totalAmount', v_total_amount,
        'previousBalance', v_prev_balance,
        'newBalance', v_new_balance,
        'transactionStatus', 'COMPLETED',
        'clientIntakeUuid', v_intake_uuid,
        'idempotencyKey', v_idempotency_key,
        'ledgerTransactionId', v_ledger_txn_id,
        'receiptNumber', v_receipt_number,
        'isIdempotentReplay', FALSE,
        'completedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.complete_milk_collection_session(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR, UUID, VARCHAR) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_milk_collection_session(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR, UUID, VARCHAR) TO authenticated, service_role;
