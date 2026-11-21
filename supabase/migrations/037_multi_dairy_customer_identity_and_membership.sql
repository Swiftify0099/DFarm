-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 037: GLOBAL CUSTOMER IDENTITY AND MULTI-DAIRY MEMBERSHIP DIRECTORY
-- ==============================================================================
-- Target: SHARED
-- Execution Reference: DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP
--
-- Architectural Guarantees:
-- 1. One canonical Global Customer Identity per verified E.164 phone number.
-- 2. Central membership discovery directory enabling rapid routing without scatter-gather.
-- 3. Strict per-dairy uniqueness: One customer identity can have exactly one registration per dairy.
-- 4. Multi-dairy registration: The same global identity can independently register in Dairy A, B, C.
-- 5. Full data isolation: Operational records (collections, passbook, bills) remain physically partitioned.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: CENTRAL CONTROL PLANE DIRECTORY (Executed in dfarm_central)
-- ------------------------------------------------------------------------------

-- 1. Global Customer Identities Master (dfarm_central)
CREATE TABLE IF NOT EXISTS global_customer_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_mobile_number VARCHAR(20) NOT NULL UNIQUE,
    phone_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_cust_phone 
ON global_customer_identities (normalized_mobile_number);

-- 2. Central Multi-Dairy Membership Routing Index (dfarm_central)
-- Only created if organizations table exists (control plane or shared instance)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'organizations'
    ) THEN
        CREATE TABLE IF NOT EXISTS customer_dairy_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            global_customer_id UUID NOT NULL REFERENCES global_customer_identities(id) ON DELETE CASCADE,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
            tenant_customer_id UUID NOT NULL,
            farmer_code VARCHAR(30),
            membership_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
            dairy_name VARCHAR(150),
            dairy_code VARCHAR(30),
            dairy_address TEXT,
            center_id UUID,
            center_name VARCHAR(150),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_customer_dairy_membership UNIQUE (organization_id, global_customer_id),
            CONSTRAINT chk_customer_membership_status CHECK (membership_status IN (
                'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'UNREGISTERED'
            ))
        );

        CREATE INDEX IF NOT EXISTS idx_memberships_global_cust 
        ON customer_dairy_memberships(global_customer_id);

        CREATE INDEX IF NOT EXISTS idx_memberships_org_status 
        ON customer_dairy_memberships(organization_id, membership_status);

        CREATE INDEX IF NOT EXISTS idx_memberships_tenant_cust 
        ON customer_dairy_memberships(organization_id, tenant_customer_id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PART 2: TENANT OPERATIONAL DATABASE EXTENSIONS (Executed in each tenant DB)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) THEN
        -- Add global_customer_id to link tenant customer record to global identity
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS global_customer_id UUID;

        -- Enforce uniqueness of global customer identity per dairy tenant
        CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_global_identity_per_org
        ON customers (organization_id, global_customer_id)
        WHERE global_customer_id IS NOT NULL AND is_deleted = FALSE;

        CREATE INDEX IF NOT EXISTS idx_customers_global_id
        ON customers(global_customer_id)
        WHERE global_customer_id IS NOT NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PART 3: RECONCILIATION & DATA BACKFILL FOR PRE-EXISTING CUSTOMERS
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1. Backfill from legacy customer_tenant_lookup if present in central DB
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_tenant_lookup'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_dairy_memberships'
    ) THEN
        -- Seed global customer identities from lookup
        INSERT INTO global_customer_identities (normalized_mobile_number)
        SELECT DISTINCT normalized_mobile_number
        FROM customer_tenant_lookup
        WHERE normalized_mobile_number IS NOT NULL AND normalized_mobile_number <> ''
        ON CONFLICT (normalized_mobile_number) DO NOTHING;

        -- Seed memberships from lookup
        INSERT INTO customer_dairy_memberships (
            global_customer_id, organization_id, tenant_customer_id, membership_status, created_at, updated_at
        )
        SELECT 
            gci.id,
            ctl.organization_id,
            ctl.customer_id,
            'APPROVED',
            ctl.registered_at,
            NOW()
        FROM customer_tenant_lookup ctl
        JOIN global_customer_identities gci ON gci.normalized_mobile_number = ctl.normalized_mobile_number
        ON CONFLICT (organization_id, global_customer_id) DO NOTHING;
    END IF;

    -- 2. Backfill from existing customers table if present in same DB
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customer_dairy_memberships'
    ) THEN
        -- Seed global identities
        INSERT INTO global_customer_identities (normalized_mobile_number)
        SELECT DISTINCT normalized_mobile_number
        FROM customers
        WHERE normalized_mobile_number IS NOT NULL AND normalized_mobile_number <> ''
        ON CONFLICT (normalized_mobile_number) DO NOTHING;

        -- Seed memberships
        INSERT INTO customer_dairy_memberships (
            global_customer_id, organization_id, tenant_customer_id, farmer_code,
            membership_status, dairy_name, center_id, created_at, updated_at
        )
        SELECT 
            gci.id,
            c.organization_id,
            c.id,
            c.farmer_code,
            CASE 
                WHEN c.registration_status = 'APPROVED' THEN 'APPROVED'
                WHEN c.registration_status = 'REJECTED' THEN 'REJECTED'
                WHEN c.status = 'SUSPENDED' THEN 'SUSPENDED'
                ELSE 'PENDING_APPROVAL'
            END,
            COALESCE(o.name, 'Registered Cooperative Dairy'),
            c.primary_center_id,
            c.created_at,
            c.updated_at
        FROM customers c
        JOIN global_customer_identities gci ON gci.normalized_mobile_number = c.normalized_mobile_number
        LEFT JOIN organizations o ON o.id = c.organization_id
        ON CONFLICT (organization_id, global_customer_id) DO UPDATE SET
            tenant_customer_id = EXCLUDED.tenant_customer_id,
            farmer_code = EXCLUDED.farmer_code,
            membership_status = EXCLUDED.membership_status,
            updated_at = NOW();

        -- Update tenant customers with global_customer_id
        UPDATE customers c
        SET global_customer_id = gci.id
        FROM global_customer_identities gci
        WHERE c.normalized_mobile_number = gci.normalized_mobile_number
          AND c.global_customer_id IS NULL;
    END IF;
END $$;
