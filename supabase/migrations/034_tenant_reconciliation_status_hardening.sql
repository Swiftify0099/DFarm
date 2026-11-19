-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 034: TENANT RECONCILIATION STATUS HARDENING (ADDITIVE MIGRATION)
-- ==============================================================================
-- Target: TENANT_OPERATIONAL
-- Purpose: Ensures both pre-existing provisioned tenant databases and fresh tenant
-- databases safely support 'RECONCILIATION_REQUIRED' status on milk_collections
-- without destructive schema changes or editing historical migration 008.

DO $$
BEGIN
    -- 1. Safely widen transaction_status column to VARCHAR(50) if currently smaller
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'milk_collections' AND column_name = 'transaction_status'
    ) THEN
        ALTER TABLE milk_collections ALTER COLUMN transaction_status TYPE VARCHAR(50);
    END IF;

    -- 2. Drop existing constraint if present and re-add with RECONCILIATION_REQUIRED
    ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS chk_collection_status;
    ALTER TABLE milk_collections ADD CONSTRAINT chk_collection_status 
        CHECK (transaction_status IN ('COMPLETED', 'REVERSED', 'ADJUSTED', 'RECONCILIATION_REQUIRED'));

EXCEPTION
    WHEN undefined_table THEN
        -- If running in control plane or table does not exist, ignore gracefully
        NULL;
END $$;
