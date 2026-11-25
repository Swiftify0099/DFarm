-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 010: DEVICES, OFFLINE REPLICATION, AUDIT AND RLS FOUNDATION
-- ==============================================================================

-- 1. Devices Master (Registered Edge Counter Terminals and Tablets)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    device_identifier VARCHAR(100) NOT NULL UNIQUE,
    device_type VARCHAR(30) NOT NULL,
    public_key TEXT,
    device_token_hash TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_type CHECK (device_type IN ('REGISTRATION_TABLET', 'COUNTER_TERMINAL', 'MOBILE_COLLECTOR')),
    CONSTRAINT chk_device_status CHECK (status IN ('ACTIVE', 'BLOCKED', 'DECOMMISSIONED'))
);

CREATE INDEX IF NOT EXISTS idx_devices_center ON devices(center_id);

-- 2. Device Sync State (Cursor Tracking per Terminal)
CREATE TABLE IF NOT EXISTS device_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
    last_upstream_sync_at TIMESTAMPTZ,
    last_downstream_sync_at TIMESTAMPTZ,
    downstream_cursor BIGINT NOT NULL DEFAULT 0,
    client_app_version VARCHAR(30),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sync Events (Append-Only Downstream Event Stream)
CREATE TABLE IF NOT EXISTS sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sequence BIGSERIAL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sync_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE'))
);

CREATE INDEX IF NOT EXISTS idx_sync_events_sequence ON sync_events (event_sequence ASC);

-- 4. Sync Tombstones (Downstream Invalidation for Soft-Deletes & Revocations)
CREATE TABLE IF NOT EXISTS sync_tombstones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tombstone_sequence BIGSERIAL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    reason TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tombstone_entity CHECK (entity_type IN ('CUSTOMER', 'FACE_ENROLLMENT', 'RFID_CARD', 'RATE_CHART'))
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_sequence ON sync_tombstones (tombstone_sequence ASC);

-- 5. Sync Conflict Records
CREATE TABLE IF NOT EXISTS sync_conflict_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    conflict_reason VARCHAR(100) NOT NULL,
    client_payload JSONB NOT NULL,
    server_state JSONB,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_device ON sync_conflict_records(device_id);

-- 6. Audit Logs Master (Immutable System-Wide Activity Log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- 7. Approval Records
CREATE TABLE IF NOT EXISTS approval_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    approval_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_approval_status CHECK (status IN ('APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_approval_records_entity ON approval_records(entity_id);

-- ==============================================================================
-- 8. COMPREHENSIVE ROW LEVEL SECURITY (RLS) & GRANTS ON ALL 43 TABLES
-- ==============================================================================

-- 8.1 Enable RLS on every public relational table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dairy_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_center_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_milk_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_registration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_retention_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfid_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfid_card_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_chart_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_chart_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_applicability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_quality_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_weight_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflict_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;

-- 8.2 Baseline Access Privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 8.3 Domain 1: Organizations & Dairy Centers
CREATE POLICY rls_org_select ON organizations
    FOR SELECT TO authenticated
    USING (id = public.current_org_id() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_org_admin_modify ON organizations
    FOR UPDATE TO authenticated
    USING (public.current_user_role() = 'SUPER_ADMIN' OR (id = public.current_org_id() AND public.current_user_role() = 'DAIRY_OWNER'))
    WITH CHECK (public.current_user_role() = 'SUPER_ADMIN' OR (id = public.current_org_id() AND public.current_user_role() = 'DAIRY_OWNER'));

CREATE POLICY rls_centers_select ON dairy_centers
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_centers_modify ON dairy_centers
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'));

CREATE POLICY rls_center_settings_select ON center_settings
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_center_settings_modify ON center_settings
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_shifts_select ON collection_shifts
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_shifts_modify ON collection_shifts
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

-- 8.4 Domain 2: Users & Staff Assignments
CREATE POLICY rls_users_select ON users
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() OR id = auth.uid() OR public.current_user_role() = 'SUPER_ADMIN');

CREATE POLICY rls_users_admin_modify ON users
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_user_center_assign_select ON user_center_assignments
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_user_center_assign_modify ON user_center_assignments
    FOR ALL TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

-- 8.5 Domain 3: Customer Identity, Categories, Addresses & Consent
CREATE POLICY rls_customers_select ON customers
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND id = public.current_customer_id())
    );

CREATE POLICY rls_customers_insert ON customers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_customers_update ON customers
    FOR UPDATE TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_categories_select ON customer_milk_categories
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_categories_modify ON customer_milk_categories
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_addresses_select ON customer_addresses
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_addresses_modify ON customer_addresses
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_reg_records_select ON customer_registration_records
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_reg_records_insert ON customer_registration_records
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_status_history_select ON customer_status_history
    FOR SELECT TO authenticated
    USING (customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_status_history_insert ON customer_status_history
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_cust_consent_records_select ON customer_consent_records
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_cust_consent_records_insert ON customer_consent_records
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

-- 8.6 Domain 4 & 5: Biometrics & RFID Management (Strictly Protected)
CREATE POLICY rls_face_models_select ON face_model_versions
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER', 'COLLECTION_OPERATOR'));

CREATE POLICY rls_face_enrollments_select ON face_enrollments
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
        OR (public.current_user_role() = 'REGISTRATION_OFFICER' AND enrolled_by = auth.uid())
    );

CREATE POLICY rls_face_enrollments_insert ON face_enrollments
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_face_enrollments_update ON face_enrollments
    FOR UPDATE TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    );

CREATE POLICY rls_biometric_retention_all ON biometric_retention_records
    FOR ALL TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    );

CREATE POLICY rls_rfid_cards_select ON rfid_cards
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_rfid_cards_modify ON rfid_cards
    FOR ALL TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

CREATE POLICY rls_rfid_assign_select ON rfid_card_assignments
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_rfid_assign_modify ON rfid_card_assignments
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'REGISTRATION_OFFICER')
    );

-- 8.7 Domain 6: Identification Telemetry & Supervisor Overrides
CREATE POLICY rls_id_audit_select ON identification_audit_logs
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_id_audit_insert ON identification_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_sup_verif_select ON supervisor_verification_records
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER');

CREATE POLICY rls_sup_verif_insert ON supervisor_verification_records
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

-- 8.8 Domain 7: Rate Charts & Pricing Engine
CREATE POLICY rls_rate_charts_select ON rate_charts
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_rate_charts_modify ON rate_charts
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_rate_versions_select ON rate_chart_versions
    FOR SELECT TO authenticated
    USING (rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_rate_versions_modify ON rate_chart_versions
    FOR ALL TO authenticated
    USING (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

CREATE POLICY rls_rate_cells_select ON rate_chart_cells
    FOR SELECT TO authenticated
    USING (rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_rate_cells_modify ON rate_chart_cells
    FOR ALL TO authenticated
    USING (
        rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_version_id IN (SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

CREATE POLICY rls_rate_rules_select ON rate_applicability_rules
    FOR SELECT TO authenticated
    USING (rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_rate_rules_modify ON rate_applicability_rules
    FOR ALL TO authenticated
    USING (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    )
    WITH CHECK (
        rate_chart_id IN (SELECT id FROM rate_charts WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER')
    );

-- 8.9 Domain 8: Milk Intake, Weighing, Quality & Final Collections
CREATE POLICY rls_sessions_select ON collection_sessions
    FOR SELECT TO authenticated
    USING (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_sessions_insert ON collection_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_sessions_update ON collection_sessions
    FOR UPDATE TO authenticated
    USING (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    )
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_quality_readings_select ON collection_quality_readings
    FOR SELECT TO authenticated
    USING (session_id IN (SELECT id FROM collection_sessions WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_quality_readings_insert ON collection_quality_readings
    FOR INSERT TO authenticated
    WITH CHECK (
        session_id IN (SELECT id FROM collection_sessions WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_weight_readings_select ON collection_weight_readings
    FOR SELECT TO authenticated
    USING (session_id IN (SELECT id FROM collection_sessions WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_weight_readings_insert ON collection_weight_readings
    FOR INSERT TO authenticated
    WITH CHECK (
        session_id IN (SELECT id FROM collection_sessions WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_collections_select ON milk_collections
    FOR SELECT TO authenticated
    USING (
        (center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_collections_insert ON milk_collections
    FOR INSERT TO authenticated
    WITH CHECK (
        center_id = public.current_center_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_receipts_select ON collection_receipts
    FOR SELECT TO authenticated
    USING (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()) AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND collection_id IN (SELECT id FROM milk_collections WHERE customer_id = public.current_customer_id()))
    );

CREATE POLICY rls_receipts_insert ON collection_receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id = public.current_center_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_adj_reversals_select ON collection_adjustments
    FOR SELECT TO authenticated
    USING (collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_adj_reversals_insert ON collection_adjustments
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

CREATE POLICY rls_reversals_select ON collection_reversals
    FOR SELECT TO authenticated
    USING (collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())));

CREATE POLICY rls_reversals_insert ON collection_reversals
    FOR INSERT TO authenticated
    WITH CHECK (
        collection_id IN (SELECT id FROM milk_collections WHERE center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id()))
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR')
    );

-- 8.10 Domain 9: Farmer Financial Subledger (Append-Only & Immutable)
CREATE POLICY rls_ledger_accounts_select ON customer_ledger_accounts
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_ledger_accounts_modify ON customer_ledger_accounts
    FOR ALL TO authenticated
    USING (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'COLLECTION_OPERATOR')
    )
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_ledger_txns_select ON ledger_transactions
    FOR SELECT TO authenticated
    USING (
        (organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_ledger_txns_insert ON ledger_transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = public.current_org_id()
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR', 'COLLECTION_OPERATOR')
    );

CREATE POLICY rls_ledger_entries_select ON ledger_entries
    FOR SELECT TO authenticated
    USING (transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_ledger_entries_insert ON ledger_entries
    FOR INSERT TO authenticated
    WITH CHECK (transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_advances_select ON customer_advances
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_advances_modify ON customer_advances
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER')
    );

CREATE POLICY rls_deductions_select ON customer_deductions
    FOR SELECT TO authenticated
    USING (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id() AND public.current_user_role() != 'FARMER_CUSTOMER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    );

CREATE POLICY rls_deductions_modify ON customer_deductions
    FOR ALL TO authenticated
    USING (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR')
    )
    WITH CHECK (
        center_id IN (SELECT id FROM dairy_centers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT', 'CENTER_MANAGER', 'SUPERVISOR')
    );

CREATE POLICY rls_cust_adj_select ON customer_adjustments
    FOR SELECT TO authenticated
    USING (customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_cust_adj_insert ON customer_adjustments
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_id IN (SELECT id FROM customers WHERE organization_id = public.current_org_id())
        AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT')
    );

-- 8.11 Domain 10: Devices, Offline Sync & System Audit
CREATE POLICY rls_devices_all ON devices
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER'));

CREATE POLICY rls_device_sync_state_all ON device_sync_state
    FOR ALL TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()))
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_sync_events_select ON sync_events
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_sync_events_insert ON sync_events
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_sync_tombstones_select ON sync_tombstones
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_sync_tombstones_insert ON sync_tombstones
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_sync_conflicts_all ON sync_conflict_records
    FOR ALL TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()))
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE organization_id = public.current_org_id()));

CREATE POLICY rls_audit_logs_select ON audit_logs
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER'));

CREATE POLICY rls_audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY rls_approval_records_select ON approval_records
    FOR SELECT TO authenticated
    USING (organization_id = public.current_org_id());

CREATE POLICY rls_approval_records_modify ON approval_records
    FOR ALL TO authenticated
    USING (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR'))
    WITH CHECK (organization_id = public.current_org_id() AND public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR'));
