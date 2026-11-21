-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 035: CUSTOMER LIFECYCLE & REGISTRATION STATUS HARDENING (ADDITIVE MIGRATION)
-- ==============================================================================
-- Target: SHARED
-- Purpose: Ensures pre-existing databases and tenant databases safely support
-- 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED' for registration_status and 'INACTIVE'
-- for customer status without destructive schema changes or modifying historical 004.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'customers'
    ) THEN
        -- 1. Safely widen registration_status column to VARCHAR(50) if currently smaller
        ALTER TABLE customers ALTER COLUMN registration_status TYPE VARCHAR(50);

        -- 2. Drop existing registration status constraint if present and re-add hardened constraint
        ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_registration_status;
        ALTER TABLE customers ADD CONSTRAINT chk_customer_registration_status 
            CHECK (registration_status IN (
                'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'UNREGISTERED'
            ));

        -- 3. Drop existing customer status constraint if present and re-add with INACTIVE
        ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_status;
        ALTER TABLE customers ADD CONSTRAINT chk_customer_status 
            CHECK (status IN (
                'DRAFT', 'PENDING_FACE_ENROLLMENT', 'PENDING_RFID_ASSIGNMENT',
                'PENDING_SYNC', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED', 'INACTIVE'
            ));
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Notice: Error during customer lifecycle migration: %', SQLERRM;
END $$;
