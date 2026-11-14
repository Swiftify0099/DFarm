-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 003: USER AND STAFF IDENTITY FOUNDATION
-- ==============================================================================

-- 1. Users Master (Mapped to Supabase auth.users or internal identities)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    username VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone_number VARCHAR(20) NOT NULL,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_role CHECK (role IN (
        'SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'SUPERVISOR',
        'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
    )),
    CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(organization_id);

-- 2. User Center Assignments (Multi-Center Access Mapping)
CREATE TABLE IF NOT EXISTS user_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_center_assignment UNIQUE (user_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_user_center_assignments_user ON user_center_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_center_assignments_center ON user_center_assignments(center_id);

