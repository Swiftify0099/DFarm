-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 032: CENTRAL SUPER ADMIN PRODUCTION READINESS & PLATFORM MANAGEMENT
-- TARGET: CONTROL_PLANE (dfarm_central)
-- ==============================================================================

-- 1. Platform Audit Logs (Central Immutable Activity Ledger)
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    actor_name VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity ON platform_audit_logs (entity_type, entity_id);

-- 2. Central Hardware Inventory
CREATE TABLE IF NOT EXISTS central_hardware_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    device_category VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    assigned_dairy_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    warranty_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_hardware_category CHECK (
        device_category IN ('RFID_READER', 'ANALYZER', 'WEIGHING_SCALE', 'COLLECTION_KIOSK', 'CAMERA', 'PRINTER')
    ),
    CONSTRAINT chk_hardware_status CHECK (
        status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'FAULTY', 'RETIRED')
    )
);

CREATE INDEX IF NOT EXISTS idx_hardware_serial ON central_hardware_inventory (serial_number);
CREATE INDEX IF NOT EXISTS idx_hardware_status ON central_hardware_inventory (status);
CREATE INDEX IF NOT EXISTS idx_hardware_assigned_dairy ON central_hardware_inventory (assigned_dairy_id);

-- 3. Hardware Assignment History
CREATE TABLE IF NOT EXISTS hardware_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES central_hardware_inventory(id) ON DELETE CASCADE,
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_assignment_action CHECK (action IN ('ASSIGNED', 'UNASSIGNED', 'MAINTENANCE_RETURN', 'STATUS_CHANGE'))
);

CREATE INDEX IF NOT EXISTS idx_hw_history_device ON hardware_assignment_history (device_id);
CREATE INDEX IF NOT EXISTS idx_hw_history_dairy ON hardware_assignment_history (dairy_id);

-- 4. Central AMC Plans Catalog
CREATE TABLE IF NOT EXISTS amc_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    duration_months INTEGER NOT NULL CHECK (duration_months > 0),
    price_inr NUMERIC(12, 2) NOT NULL CHECK (price_inr >= 0),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default standard AMC plans if not exists
INSERT INTO amc_plans (id, name, duration_months, price_inr, description)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Standard Annual AMC', 12, 49999.00, 'Comprehensive annual maintenance, cloud backups & priority support'),
    ('00000000-0000-0000-0000-000000000002', 'Semi-Annual AMC', 6, 27999.00, '6-month software and hardware maintenance plan'),
    ('00000000-0000-0000-0000-000000000003', 'Enterprise 2-Year AMC', 24, 89999.00, 'Multi-year enterprise maintenance with dedicated support manager')
ON CONFLICT (name) DO NOTHING;

-- 5. Dairy AMC Subscriptions
CREATE TABLE IF NOT EXISTS amc_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES amc_plans(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    amount_paid NUMERIC(12, 2),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_amc_status CHECK (
        status IN ('PENDING_PAYMENT', 'ACTIVE', 'RENEWAL_DUE', 'EXPIRED', 'REACTIVATED', 'CANCELLED')
    ),
    CONSTRAINT chk_amc_payment_status CHECK (
        payment_status IN ('UNPAID', 'PAID', 'REFUNDED')
    )
);

CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_dairy ON amc_subscriptions (dairy_id);
CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_expiry ON amc_subscriptions (expiry_date);
CREATE INDEX IF NOT EXISTS idx_amc_subscriptions_status ON amc_subscriptions (status);

-- 6. Platform Alerts (System Health & Tenant Monitoring)
CREATE TABLE IF NOT EXISTS platform_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(30) NOT NULL DEFAULT 'INFO',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    source VARCHAR(100) NOT NULL,
    dairy_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_alert_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    CONSTRAINT chk_alert_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_platform_alerts_status ON platform_alerts (status);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_severity ON platform_alerts (severity);

-- 7. Dairy Bank Beneficiary Details (Encrypted for Farmer Payout Readiness)
CREATE TABLE IF NOT EXISTS dairy_bank_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    bank_name VARCHAR(150) NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    account_number_masked VARCHAR(30) NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    account_holder_name VARCHAR(150) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dairy_bank_org ON dairy_bank_details (organization_id);
