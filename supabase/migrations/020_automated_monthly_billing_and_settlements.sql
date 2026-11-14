-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: AUTOMATIC MONTHLY BILLING, SETTLEMENT & STATEMENT ENGINE
-- ==============================================================================

-- 1. Billing Periods Table
CREATE TABLE IF NOT EXISTS billing_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    period_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    cycle_type VARCHAR(30) NOT NULL DEFAULT 'CALENDAR_MONTH',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_farmers_billed INT NOT NULL DEFAULT 0,
    total_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_gross_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    generated_at TIMESTAMPTZ,
    generated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_billing_period_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_billing_cycle_type CHECK (cycle_type IN ('CALENDAR_MONTH', 'TEN_DAY', 'FIFTEEN_DAY', 'CUSTOM_PERIOD')),
    CONSTRAINT chk_billing_period_status CHECK (status IN (
        'DRAFT', 'GENERATING', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'CORRECTION_REQUIRED', 'CANCELLED'
    )),
    CONSTRAINT uq_center_billing_period UNIQUE (center_id, start_date, end_date)
);

DROP TRIGGER IF EXISTS set_billing_periods_updated_at ON billing_periods;
CREATE TRIGGER set_billing_periods_updated_at
BEFORE UPDATE ON billing_periods
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_billing_periods_center_dates ON billing_periods(center_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_billing_periods_org ON billing_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON billing_periods(status);

-- Function to prevent overlapping billing periods for the same center (excluding CANCELLED)
CREATE OR REPLACE FUNCTION check_billing_period_overlap()
RETURNS TRIGGER AS $$
DECLARE
    v_overlap_count INT;
BEGIN
    IF NEW.status = 'CANCELLED' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_overlap_count
    FROM billing_periods
    WHERE center_id = NEW.center_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status <> 'CANCELLED'
      AND (
          (NEW.start_date BETWEEN start_date AND end_date)
          OR (NEW.end_date BETWEEN start_date AND end_date)
          OR (start_date BETWEEN NEW.start_date AND NEW.end_date)
      );

    IF v_overlap_count > 0 THEN
        RAISE EXCEPTION 'Billing period dates [%, %] overlap with an existing period for center %',
            NEW.start_date, NEW.end_date, NEW.center_id
            USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_billing_period_overlap ON billing_periods;
CREATE TRIGGER trg_check_billing_period_overlap
BEFORE INSERT OR UPDATE OF center_id, start_date, end_date, status ON billing_periods
FOR EACH ROW EXECUTE FUNCTION check_billing_period_overlap();

-- 2. Monthly Bills Table (Customer Settlement Sheets)
CREATE TABLE IF NOT EXISTS monthly_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_period_id UUID NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    bill_number VARCHAR(60) NOT NULL UNIQUE,
    bill_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_cow_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cow_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    cow_collections_count INT NOT NULL DEFAULT 0,
    total_buffalo_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_buffalo_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    buffalo_collections_count INT NOT NULL DEFAULT 0,
    total_milk_collections_count INT NOT NULL DEFAULT 0,
    total_milk_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    gross_milk_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_credits_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_credits NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    feed_purchases_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advances_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    deductions_debit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_debits_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_debits NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    settled_payouts_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    is_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
    pdf_storage_path VARCHAR(255),
    pdf_sha256_hash VARCHAR(64),
    generated_at TIMESTAMPTZ,
    generated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_bill_per_period UNIQUE (customer_id, billing_period_id),
    CONSTRAINT chk_monthly_bill_status CHECK (bill_status IN (
        'DRAFT', 'GENERATING', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'CORRECTION_REQUIRED', 'CANCELLED'
    ))
);

DROP TRIGGER IF EXISTS set_monthly_bills_updated_at ON monthly_bills;
CREATE TRIGGER set_monthly_bills_updated_at
BEFORE UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_monthly_bills_period ON monthly_bills(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_customer ON monthly_bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_center ON monthly_bills(center_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_status ON monthly_bills(bill_status);

-- 3. Monthly Bill Items Table (Itemized Statements)
CREATE TABLE IF NOT EXISTS monthly_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES monthly_bills(id) ON DELETE CASCADE,
    item_type VARCHAR(40) NOT NULL,
    reference_id UUID,
    item_date DATE NOT NULL,
    shift_type VARCHAR(10),
    milk_category VARCHAR(20),
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    measurement_unit VARCHAR(10) NOT NULL DEFAULT 'KG',
    fat_percentage NUMERIC(4,2),
    snf_percentage NUMERIC(4,2),
    rate_per_unit NUMERIC(8,2),
    amount NUMERIC(12,2) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'CREDIT',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bill_item_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_bill_item_unit CHECK (measurement_unit IN ('KG', 'LITERS', 'UNIT', 'COUNT')),
    CONSTRAINT chk_bill_item_type CHECK (item_type IN (
        'MILK_COLLECTION', 'FEED_PURCHASE', 'ADVANCE_RECOVERY', 'DEDUCTION',
        'SETTLED_PAYMENT', 'INCENTIVE_CREDIT', 'LEDGER_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_monthly_bill_items_bill ON monthly_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bill_items_ref ON monthly_bill_items(reference_id);

-- 4. Monthly Bill Adjustments Table (Versioned Corrections)
CREATE TABLE IF NOT EXISTS monthly_bill_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES monthly_bills(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(10) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bill_adj_type CHECK (adjustment_type IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_bill_adj_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_monthly_bill_adjustments_bill ON monthly_bill_adjustments(bill_id);

-- 5. Bill Finalization Records Table (Immutable Audit Snapshots)
CREATE TABLE IF NOT EXISTS bill_finalization_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_period_id UUID NOT NULL UNIQUE REFERENCES billing_periods(id) ON DELETE RESTRICT,
    total_farmers_billed INT NOT NULL,
    total_gross_milk_amount NUMERIC(12,2) NOT NULL,
    total_net_payout_amount NUMERIC(12,2) NOT NULL,
    total_feed_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_advances_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_settled_payouts NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    snapshot_checksum VARCHAR(64) NOT NULL,
    finalized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Customer Payments Table (Domain 11 Settlement References)
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    bill_id UUID REFERENCES monthly_bills(id) ON DELETE SET NULL,
    payment_number VARCHAR(50) NOT NULL UNIQUE,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'BANK_TRANSFER',
    amount NUMERIC(12,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    transaction_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_amount CHECK (amount > 0.00),
    CONSTRAINT chk_payment_mode CHECK (payment_mode IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')),
    CONSTRAINT chk_payment_status CHECK (payment_status IN ('PENDING', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'REVERSED', 'RECONCILED'))
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_cust ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_center ON customer_payments(center_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_bill ON customer_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_status ON customer_payments(payment_status);

-- 7. Billing Scheduler Execution Logs Table
CREATE TABLE IF NOT EXISTS billing_scheduler_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    billing_period_id UUID REFERENCES billing_periods(id) ON DELETE SET NULL,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'CRON',
    status VARCHAR(20) NOT NULL,
    farmers_processed INT NOT NULL DEFAULT 0,
    execution_time_ms INT NOT NULL DEFAULT 0,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_scheduler_trigger CHECK (trigger_type IN ('CRON', 'MANUAL')),
    CONSTRAINT chk_scheduler_status CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_scheduler_logs_center ON billing_scheduler_execution_logs(center_id, executed_at DESC);

-- 8. Immutability Triggers for Finalized Bills and Periods
CREATE OR REPLACE FUNCTION enforce_finalized_bill_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- If bill is already finalized, prevent direct updates to financial totals
    IF OLD.bill_status = 'FINALIZED' THEN
        -- Allow setting pdf_storage_path or pdf_sha256_hash or version bump if adjustment was added
        IF NEW.bill_number <> OLD.bill_number 
           OR NEW.customer_id <> OLD.customer_id 
           OR NEW.billing_period_id <> OLD.billing_period_id
           OR (NEW.closing_balance <> OLD.closing_balance AND NEW.version = OLD.version) THEN
            RAISE EXCEPTION 'Cannot modify financial data on FINALIZED bill % without an authorized versioned adjustment',
                OLD.id USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_finalized_bill_immutability ON monthly_bills;
CREATE TRIGGER trg_enforce_finalized_bill_immutability
BEFORE UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION enforce_finalized_bill_immutability();

CREATE OR REPLACE FUNCTION enforce_finalized_period_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_period_status VARCHAR(30);
BEGIN
    SELECT status INTO v_period_status FROM billing_periods WHERE id = NEW.billing_period_id;
    IF v_period_status = 'FINALIZED' THEN
        -- Allow controlled versioned adjustments (where version increments)
        IF TG_OP = 'UPDATE' AND NEW.version > OLD.version THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.bill_status <> 'FINALIZED') THEN
            RAISE EXCEPTION 'Cannot insert or alter bills in a FINALIZED billing period %',
                NEW.billing_period_id USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_finalized_period_immutability ON monthly_bills;
CREATE TRIGGER trg_enforce_finalized_period_immutability
BEFORE INSERT OR UPDATE ON monthly_bills
FOR EACH ROW EXECUTE FUNCTION enforce_finalized_period_immutability();

-- 9. Row Level Security (RLS) Policies
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bill_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_finalization_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_scheduler_execution_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
DROP POLICY IF EXISTS service_role_billing_periods ON billing_periods;
CREATE POLICY service_role_billing_periods ON billing_periods FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bills ON monthly_bills;
CREATE POLICY service_role_monthly_bills ON monthly_bills FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bill_items ON monthly_bill_items;
CREATE POLICY service_role_monthly_bill_items ON monthly_bill_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_monthly_bill_adjustments ON monthly_bill_adjustments;
CREATE POLICY service_role_monthly_bill_adjustments ON monthly_bill_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bill_finalization_records ON bill_finalization_records;
CREATE POLICY service_role_bill_finalization_records ON bill_finalization_records FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_customer_payments ON customer_payments;
CREATE POLICY service_role_customer_payments ON customer_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_billing_scheduler_logs ON billing_scheduler_execution_logs;
CREATE POLICY service_role_billing_scheduler_logs ON billing_scheduler_execution_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users Policies
DROP POLICY IF EXISTS staff_select_billing_periods ON billing_periods;
CREATE POLICY staff_select_billing_periods ON billing_periods FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_center_assignments uca
        WHERE uca.user_id = auth.uid() AND uca.center_id = billing_periods.center_id
    )
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
);

DROP POLICY IF EXISTS customer_select_own_monthly_bills ON monthly_bills;
CREATE POLICY customer_select_own_monthly_bills ON monthly_bills FOR SELECT TO authenticated
USING (
    customer_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM user_center_assignments uca
        WHERE uca.user_id = auth.uid() AND uca.center_id = monthly_bills.center_id
    )
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
    )
);

DROP POLICY IF EXISTS customer_select_own_bill_items ON monthly_bill_items;
CREATE POLICY customer_select_own_bill_items ON monthly_bill_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM monthly_bills mb
        WHERE mb.id = monthly_bill_items.bill_id
          AND (
              mb.customer_id = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM user_center_assignments uca
                  WHERE uca.user_id = auth.uid() AND uca.center_id = mb.center_id
              )
              OR EXISTS (
                  SELECT 1 FROM users u
                  WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER')
              )
          )
    )
);

DROP POLICY IF EXISTS staff_manage_billing_records ON monthly_bills;
CREATE POLICY staff_manage_billing_records ON monthly_bills FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'ACCOUNTANT')
    )
);
