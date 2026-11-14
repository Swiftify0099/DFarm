-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 007: MILK RATE CHARTS AND PRICING ENGINE
-- ==============================================================================

-- 1. Rate Charts Master
CREATE TABLE IF NOT EXISTS rate_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    milk_category VARCHAR(20) NOT NULL,
    pricing_type VARCHAR(30) NOT NULL DEFAULT 'GRID',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rate_chart_category CHECK (milk_category IN ('COW', 'BUFFALO')),
    CONSTRAINT chk_rate_chart_pricing_type CHECK (pricing_type IN ('GRID', 'TOTAL_SOLIDS_FORMULA', 'TWO_AXIS_FORMULA'))
);

CREATE INDEX IF NOT EXISTS idx_rate_charts_org ON rate_charts(organization_id);
CREATE INDEX IF NOT EXISTS idx_rate_charts_center ON rate_charts(center_id);

-- 2. Rate Chart Versions (Historical Immutability)
CREATE TABLE IF NOT EXISTS rate_chart_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_id UUID NOT NULL REFERENCES rate_charts(id) ON DELETE RESTRICT,
    version_number INT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    formula_definition JSONB,
    base_fat NUMERIC(3,1),
    base_snf NUMERIC(3,1),
    base_rate NUMERIC(6,2),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rate_chart_version UNIQUE (rate_chart_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rate_chart_versions_dates 
ON rate_chart_versions (rate_chart_id, effective_from, effective_to);

-- 3. Rate Chart Cells (Grid Matrix for Fat x SNF)
CREATE TABLE IF NOT EXISTS rate_chart_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_version_id UUID NOT NULL REFERENCES rate_chart_versions(id) ON DELETE CASCADE,
    fat_percentage NUMERIC(3,1) NOT NULL,
    snf_percentage NUMERIC(3,1) NOT NULL,
    rate_per_unit NUMERIC(6,2) NOT NULL,
    CONSTRAINT uq_rate_chart_cell UNIQUE (rate_chart_version_id, fat_percentage, snf_percentage),
    CONSTRAINT chk_positive_rate CHECK (rate_per_unit >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_rate_cells_lookup 
ON rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage);

-- 4. Rate Applicability Rules (Center Priority Matching)
CREATE TABLE IF NOT EXISTS rate_applicability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_chart_id UUID NOT NULL REFERENCES rate_charts(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    priority INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

