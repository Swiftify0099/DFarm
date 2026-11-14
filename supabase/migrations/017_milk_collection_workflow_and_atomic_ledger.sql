-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 012: MILK COLLECTION WORKFLOW & ATOMIC LEDGER ENGINE
-- ==============================================================================

-- 1. Extend collection_sessions.session_state CHECK constraint to support granular state machine
ALTER TABLE collection_sessions DROP CONSTRAINT IF EXISTS chk_session_state;
ALTER TABLE collection_sessions ADD CONSTRAINT chk_session_state CHECK (
    session_state IN (
        'OPEN', 'IN_PROGRESS', 'WAITING_FOR_MEASUREMENTS',
        'MEASUREMENTS_RECEIVED', 'VALIDATING', 'READY_FOR_REVIEW',
        'COMMITTING', 'COMPLETED', 'INCOMPLETE', 'FAILED', 'CANCELLED'
    )
);

-- 2. Stored Procedure: Create Milk Collection Session
CREATE OR REPLACE FUNCTION public.create_milk_collection_session(
    p_center_id UUID,
    p_customer_id UUID,
    p_operator_id UUID,
    p_device_id VARCHAR(100),
    p_shift_type VARCHAR(10),
    p_selected_milk_category VARCHAR(20),
    p_identification_method VARCHAR(30),
    p_intake_sequence_uuid UUID DEFAULT NULL,
    p_business_date DATE DEFAULT NULL,
    p_identification_log_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_session_id UUID;
    v_customer RECORD;
    v_center RECORD;
    v_shift RECORD;
    v_cat_auth BOOLEAN;
    v_active_session_count INT;
    v_intake_uuid UUID;
    v_business_date DATE;
    v_result JSONB;
BEGIN
    -- 1. Verify Center exists and is ACTIVE
    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL THEN
        RAISE EXCEPTION 'Dairy Center % does not exist', p_center_id USING ERRCODE = 'P0002';
    END IF;
    IF v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Dairy Center % is not ACTIVE (status: %)', p_center_id, v_center.status USING ERRCODE = '22000';
    END IF;

    -- 2. Verify Customer exists, not deleted, and is ACTIVE
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;
    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is soft-deleted and cannot supply milk', p_customer_id USING ERRCODE = '22000';
    END IF;
    IF v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not ACTIVE (status: %)', p_customer_id, v_customer.status USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Customer belongs to the Organization of the Center
    IF v_customer.organization_id <> v_center.organization_id THEN
        RAISE EXCEPTION 'Customer organization mismatch with Center organization' USING ERRCODE = '22000';
    END IF;

    -- 3b. Verify Customer is assigned to this Center
    IF v_customer.primary_center_id <> p_center_id THEN
        RAISE EXCEPTION 'Customer primary center % does not match collection center %', v_customer.primary_center_id, p_center_id USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Milk Category Permission
    SELECT EXISTS (
        SELECT 1 FROM customer_milk_categories 
        WHERE customer_id = p_customer_id 
          AND milk_category = p_selected_milk_category 
          AND is_authorized = TRUE
    ) INTO v_cat_auth;

    IF NOT v_cat_auth THEN
        RAISE EXCEPTION 'Customer % is not authorized to deliver % milk', p_customer_id, p_selected_milk_category USING ERRCODE = '22023';
    END IF;

    -- 5. Prevent concurrent active unfinished sessions for this customer
    SELECT COUNT(*) INTO v_active_session_count 
    FROM collection_sessions 
    WHERE customer_id = p_customer_id 
      AND session_state IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_MEASUREMENTS', 'MEASUREMENTS_RECEIVED', 'VALIDATING', 'READY_FOR_REVIEW', 'COMMITTING');

    IF v_active_session_count > 0 THEN
        RAISE EXCEPTION 'Customer % already has an active incomplete collection session', p_customer_id USING ERRCODE = '23505';
    END IF;

    -- 6. Resolve shift
    SELECT * INTO v_shift FROM collection_shifts WHERE center_id = p_center_id AND shift_type = p_shift_type;
    IF v_shift.id IS NULL THEN
        -- Auto-seed default shift if not present
        INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
        VALUES (
            p_center_id, 
            p_shift_type, 
            CASE WHEN p_shift_type = 'MORNING' THEN '05:00:00'::TIME ELSE '16:00:00'::TIME END,
            CASE WHEN p_shift_type = 'MORNING' THEN '11:00:00'::TIME ELSE '21:00:00'::TIME END,
            30,
            TRUE
        )
        RETURNING * INTO v_shift;
    END IF;

    v_session_id := gen_random_uuid();
    v_intake_uuid := COALESCE(p_intake_sequence_uuid, gen_random_uuid());
    v_business_date := COALESCE(p_business_date, CURRENT_DATE);

    -- 7. Insert Collection Session
    INSERT INTO collection_sessions (
        id,
        center_id,
        customer_id,
        business_date,
        shift_id,
        shift_type,
        selected_milk_category,
        identification_method,
        identification_log_id,
        session_state,
        intake_sequence_uuid,
        started_at,
        operator_id,
        device_id
    ) VALUES (
        v_session_id,
        p_center_id,
        p_customer_id,
        v_business_date,
        v_shift.id,
        p_shift_type,
        p_selected_milk_category,
        p_identification_method,
        p_identification_log_id,
        'OPEN',
        v_intake_uuid,
        NOW(),
        p_operator_id,
        p_device_id
    );

    -- 8. Return JSON
    SELECT jsonb_build_object(
        'sessionId', v_session_id,
        'centerId', p_center_id,
        'customerId', p_customer_id,
        'customerName', v_customer.full_name,
        'farmerCode', v_customer.farmer_code,
        'businessDate', v_business_date,
        'shiftId', v_shift.id,
        'shiftType', p_shift_type,
        'selectedMilkCategory', p_selected_milk_category,
        'identificationMethod', p_identification_method,
        'sessionState', 'OPEN',
        'intakeSequenceUuid', v_intake_uuid,
        'startedAt', NOW(),
        'operatorId', p_operator_id,
        'deviceId', p_device_id
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_milk_collection_session(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, DATE, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_milk_collection_session(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, DATE, UUID) TO authenticated, service_role;


-- 3. Stored Procedure: Cancel Milk Collection Session
CREATE OR REPLACE FUNCTION public.cancel_milk_collection_session(
    p_session_id UUID,
    p_operator_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_session RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_session FROM collection_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Collection session % does not exist', p_session_id USING ERRCODE = 'P0002';
    END IF;

    IF v_session.session_state = 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot cancel an already completed collection session' USING ERRCODE = '22000';
    END IF;

    UPDATE collection_sessions
    SET session_state = 'CANCELLED',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- Record audit log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        (SELECT organization_id FROM dairy_centers WHERE id = v_session.center_id),
        v_session.center_id,
        p_operator_id,
        'COLLECTION_SESSION_CANCELLED',
        'COLLECTION_SESSION',
        p_session_id,
        jsonb_build_object('session_state', v_session.session_state),
        jsonb_build_object('session_state', 'CANCELLED', 'reason', p_reason)
    );

    SELECT jsonb_build_object(
        'sessionId', p_session_id,
        'sessionState', 'CANCELLED',
        'cancellationReason', p_reason,
        'cancelledAt', NOW(),
        'cancelledBy', p_operator_id
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.cancel_milk_collection_session(UUID, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_milk_collection_session(UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. Stored Procedure: Complete Milk Collection Session & Atomic Ledger Posting
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

    -- 1. Idempotency Check: Return already committed collection if identical idempotency key
    SELECT mc.*, lt.balance_after, lt.id AS ledger_txn_id 
    INTO v_existing_collection
    FROM milk_collections mc
    JOIN ledger_transactions lt ON lt.reference_id = mc.id AND lt.reference_entity = 'MILK_COLLECTION'
    WHERE mc.idempotency_key = v_idempotency_key;

    IF v_existing_collection.id IS NOT NULL THEN
        -- Return already committed record idempotently
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

    -- 2. Fetch session FOR UPDATE
    SELECT * INTO v_session FROM collection_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Collection session % does not exist', p_session_id USING ERRCODE = 'P0002';
    END IF;

    IF v_session.session_state = 'COMPLETED' THEN
        RAISE EXCEPTION 'Collection session % has already been completed', p_session_id USING ERRCODE = '22000';
    END IF;

    IF v_session.session_state = 'CANCELLED' THEN
        RAISE EXCEPTION 'Collection session % has been cancelled', p_session_id USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Customer & Center
    SELECT * INTO v_customer FROM customers WHERE id = v_session.customer_id;
    IF v_customer.id IS NULL OR v_customer.is_deleted = TRUE OR v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not active or is deleted', v_session.customer_id USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = v_session.center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active', v_session.center_id USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Milk Category permission
    SELECT EXISTS (
        SELECT 1 FROM customer_milk_categories 
        WHERE customer_id = v_session.customer_id 
          AND milk_category = v_session.selected_milk_category 
          AND is_authorized = TRUE
    ) INTO v_cat_auth;

    IF NOT v_cat_auth THEN
        RAISE EXCEPTION 'Customer % is not authorized for category %', v_session.customer_id, v_session.selected_milk_category USING ERRCODE = '22023';
    END IF;

    -- 5. Validate measurements against center_settings
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

    -- 6. Insert Quality & Weight Readings into session audit tables
    INSERT INTO collection_quality_readings (
        session_id,
        fat_percentage,
        snf_percentage,
        validation_status,
        reading_source,
        recorded_at
    ) VALUES (
        p_session_id,
        p_fat_percentage,
        p_snf_percentage,
        'VALID',
        p_reading_source,
        NOW()
    );

    INSERT INTO collection_weight_readings (
        session_id,
        measured_weight,
        measurement_unit,
        tare_weight,
        net_weight,
        validation_status,
        reading_source,
        recorded_at
    ) VALUES (
        p_session_id,
        p_net_weight,
        p_measurement_unit,
        0.00,
        p_net_weight,
        'VALID',
        p_reading_source,
        NOW()
    );

    -- 7. Rate Resolution: Query rate_chart_versions & rate_chart_cells
    -- Priority 1: Center applicability rule
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

    -- Priority 2: Fallback to Center-assigned or Org-default rate chart
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

    -- Query Rate Cell
    SELECT rate_per_unit INTO v_rate_per_unit
    FROM rate_chart_cells
    WHERE rate_chart_version_id = v_rate_chart_version_id
      AND fat_percentage = p_fat_percentage
      AND snf_percentage = p_snf_percentage;

    IF v_rate_per_unit IS NULL THEN
        RAISE EXCEPTION 'RATE_CELL_NOT_FOUND: No approved rate cell found for version % at Fat: %, SNF: %', v_rate_chart_version_id, p_fat_percentage, p_snf_percentage USING ERRCODE = '22000';
    END IF;

    -- Calculate Gross Total Amount
    v_total_amount := ROUND(p_net_weight * v_rate_per_unit, 2);

    -- 8. Insert into milk_collections
    v_collection_id := gen_random_uuid();
    INSERT INTO milk_collections (
        id,
        session_id,
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

    -- 9. Customer Ledger Account: Atomic balance update with row lock
    SELECT * INTO v_ledger_account 
    FROM customer_ledger_accounts 
    WHERE customer_id = v_session.customer_id 
    FOR UPDATE;

    IF v_ledger_account.id IS NULL THEN
        INSERT INTO customer_ledger_accounts (
            customer_id,
            organization_id,
            currency,
            current_balance,
            last_transaction_at,
            updated_at
        ) VALUES (
            v_session.customer_id,
            v_center.organization_id,
            'INR',
            v_total_amount,
            NOW(),
            NOW()
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

    -- 10. Insert Ledger Transaction (Credit)
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
        v_center.organization_id,
        v_session.center_id,
        v_session.customer_id,
        'MILK_COLLECTION_CREDIT',
        'CREDIT',
        v_total_amount,
        v_new_balance,
        'MILK_COLLECTION',
        v_collection_id,
        'Milk Collection ' || v_session.selected_milk_category || ': ' || p_net_weight || ' ' || p_measurement_unit || ' @ Rs ' || v_rate_per_unit,
        v_idempotency_key,
        p_operator_id,
        NOW()
    );

    -- 11. Insert Balanced Double-Entry Journal Entries
    -- Entry 1: Debit Milk Purchase Expense
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        account_type,
        entry_type,
        amount
    ) VALUES (
        v_ledger_txn_id,
        v_session.center_id,
        'MILK_PURCHASE_EXPENSE',
        'DEBIT',
        v_total_amount
    );

    -- Entry 2: Credit Customer Payable
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        account_type,
        entry_type,
        amount
    ) VALUES (
        v_ledger_txn_id,
        v_customer_ledger_account_id,
        'CUSTOMER_PAYABLE',
        'CREDIT',
        v_total_amount
    );

    -- 12. Update Collection Session state to COMPLETED
    UPDATE collection_sessions
    SET session_state = 'COMPLETED',
        completed_at = NOW()
    WHERE id = p_session_id;

    -- 13. Create Sync Event for Downstream Replication
    v_receipt_number := 'RCP-' || UPPER(SUBSTRING(v_collection_id::text, 1, 8));

    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
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

    -- 14. Create Audit Log
    INSERT INTO audit_logs (
        organization_id,
        center_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
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

    -- 15. Return comprehensive receipt & transaction result
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


-- 5. Stored Procedure: Authorized Supervisor Adjustment / Reversal
CREATE OR REPLACE FUNCTION public.adjust_milk_collection(
    p_collection_id UUID,
    p_supervisor_id UUID,
    p_reason TEXT,
    p_adjustment_type VARCHAR(20),
    p_adjusted_net_weight NUMERIC(6,2) DEFAULT NULL,
    p_adjusted_fat_percentage NUMERIC(3,1) DEFAULT NULL,
    p_adjusted_snf_percentage NUMERIC(3,1) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_collection RECORD;
    v_supervisor RECORD;
    v_center RECORD;
    v_ledger_account RECORD;
    v_prev_balance NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Fetch collection FOR UPDATE
    SELECT * INTO v_collection FROM milk_collections WHERE id = p_collection_id FOR UPDATE;
    IF v_collection.id IS NULL THEN
        RAISE EXCEPTION 'Milk collection % does not exist', p_collection_id USING ERRCODE = 'P0002';
    END IF;

    IF v_collection.transaction_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Milk collection % is already % and cannot be adjusted', p_collection_id, v_collection.transaction_status USING ERRCODE = '22000';
    END IF;

    -- 2. Verify Supervisor
    SELECT * INTO v_supervisor FROM users WHERE id = p_supervisor_id;
    IF v_supervisor.id IS NULL THEN
        RAISE EXCEPTION 'Supervisor % does not exist', p_supervisor_id USING ERRCODE = 'P0002';
    END IF;
    IF v_supervisor.role NOT IN ('SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'User % is not authorized as supervisor or manager', p_supervisor_id USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Reason
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Mandatory supervisor reason (minimum 5 chars) is required for collection adjustment' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_center FROM dairy_centers WHERE id = v_collection.center_id;

    -- 4. Execute Full Reversal
    IF p_adjustment_type = 'FULL_REVERSAL' THEN
        -- Mark collection as REVERSED
        UPDATE milk_collections
        SET transaction_status = 'REVERSED'
        WHERE id = p_collection_id;

        -- Customer Ledger Account: Deduct previous credit
        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_collection.customer_id 
        FOR UPDATE;

        v_prev_balance := v_ledger_account.current_balance;
        v_new_balance := v_prev_balance - v_collection.total_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_new_balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ledger_account.id;

        -- Insert Ledger Transaction (Debit Reversal)
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
            v_center.organization_id,
            v_collection.center_id,
            v_collection.customer_id,
            'COLLECTION_REVERSAL_DEBIT',
            'DEBIT',
            v_collection.total_amount,
            v_new_balance,
            'MILK_COLLECTION',
            p_collection_id,
            'Reversal of collection ' || p_collection_id || ': ' || p_reason,
            'REV-' || p_collection_id::text,
            p_supervisor_id,
            NOW()
        );

        -- Double Entry Journal for Reversal
        -- Debit Customer Payable (Liability decreases)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_ledger_account.id,
            'CUSTOMER_PAYABLE',
            'DEBIT',
            v_collection.total_amount
        );

        -- Credit Milk Purchase Expense (Expense decreases)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_collection.center_id,
            'MILK_PURCHASE_EXPENSE',
            'CREDIT',
            v_collection.total_amount
        );

        -- Audit Log
        INSERT INTO audit_logs (
            organization_id,
            center_id,
            user_id,
            action,
            entity_type,
            entity_id,
            old_values,
            new_values
        ) VALUES (
            v_center.organization_id,
            v_collection.center_id,
            p_supervisor_id,
            'MILK_COLLECTION_REVERSED',
            'MILK_COLLECTION',
            p_collection_id,
            jsonb_build_object('status', 'COMPLETED', 'amount', v_collection.total_amount),
            jsonb_build_object('status', 'REVERSED', 'reason', p_reason, 'reversedBy', p_supervisor_id)
        );

        SELECT jsonb_build_object(
            'collectionId', p_collection_id,
            'status', 'REVERSED',
            'reversedAmount', v_collection.total_amount,
            'previousBalance', v_prev_balance,
            'newBalance', v_new_balance,
            'supervisorId', p_supervisor_id,
            'reason', p_reason,
            'adjustedAt', NOW()
        ) INTO v_result;

        RETURN v_result;
    ELSE
        RAISE EXCEPTION 'Unsupported adjustment type %', p_adjustment_type USING ERRCODE = '22023';
    END IF;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

ALTER FUNCTION public.adjust_milk_collection(UUID, UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, NUMERIC) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.adjust_milk_collection(UUID, UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;

