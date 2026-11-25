-- ==============================================================================
-- DFARM - SMART DAIRY MULTI-TENANT ARCHITECTURE
-- MIGRATION 039: MILK COLLECTIONS ORGANIZATION IDEMPOTENCY & FINANCIAL ATOMICITY
-- ==============================================================================

-- 1. Add organization_id column to milk_collections if not present
ALTER TABLE milk_collections
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

-- 2. Backfill organization_id from dairy_centers
UPDATE milk_collections mc
SET organization_id = dc.organization_id
FROM dairy_centers dc
WHERE mc.center_id = dc.id AND mc.organization_id IS NULL;

-- 3. Backfill any remaining null organization_id from customers
UPDATE milk_collections mc
SET organization_id = c.organization_id
FROM customers c
WHERE mc.customer_id = c.id AND mc.organization_id IS NULL;

-- 4. Fail-closed safety check: ensure zero unresolved NULL organization IDs remain
DO $$
DECLARE
    unresolved_count INT;
BEGIN
    SELECT COUNT(*) INTO unresolved_count
    FROM milk_collections
    WHERE organization_id IS NULL;

    IF unresolved_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION 039 HALTED: % milk_collections records have unresolved organization_id. Manual audit required before enforcing NOT NULL.', unresolved_count;
    END IF;
END $$;

-- 5. Safe constraint enforcement: enforce NOT NULL on organization_id and idempotency_key
ALTER TABLE milk_collections 
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE milk_collections 
ALTER COLUMN idempotency_key SET NOT NULL;

-- 6. Drop previous obsolete global unique constraint on idempotency_key if present
ALTER TABLE milk_collections DROP CONSTRAINT IF EXISTS milk_collections_idempotency_key_key;

-- 7. Create composite unique index on (organization_id, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_milk_collections_org_idempotency
ON milk_collections (organization_id, idempotency_key);

-- 8. Add index on organization_id for fast tenant-partitioned queries
CREATE INDEX IF NOT EXISTS idx_milk_collections_org_id
ON milk_collections (organization_id);
