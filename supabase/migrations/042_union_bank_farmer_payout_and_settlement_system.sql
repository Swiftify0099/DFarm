-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 042: FARMER MILK PAYMENT, SETTLEMENT & UNION BANK PAYOUT SYSTEM
-- ==============================================================================

-- 1. Extend customers table with bank verification & beneficiary status
ALTER TABLE customers ADD COLUMN IF NOT EXISTS beneficiary_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bank_verification_status VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bank_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bank_verification_notes TEXT;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_beneficiary_status;
ALTER TABLE customers ADD CONSTRAINT chk_customer_beneficiary_status 
CHECK (beneficiary_status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE'));

ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_bank_verification_status;
ALTER TABLE customers ADD CONSTRAINT chk_customer_bank_verification_status 
CHECK (bank_verification_status IN ('VERIFIED', 'UNVERIFIED', 'PENDING_VERIFICATION', 'REJECTED'));

-- 2. Beneficiary Bank Details Audit Log Table
CREATE TABLE IF NOT EXISTS beneficiary_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    previous_bank_name VARCHAR(100),
    new_bank_name VARCHAR(100),
    previous_account_mask VARCHAR(30),
    new_account_mask VARCHAR(30),
    previous_ifsc VARCHAR(20),
    new_ifsc VARCHAR(20),
    previous_holder_name VARCHAR(150),
    new_holder_name VARCHAR(150),
    previous_verification_status VARCHAR(30),
    new_verification_status VARCHAR(30),
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_audit_cust ON beneficiary_audit_logs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beneficiary_audit_org ON beneficiary_audit_logs(organization_id);

-- 3. Extend payment_batches table with calculation snapshot & Union Bank metadata
ALTER TABLE payment_batches DROP CONSTRAINT IF EXISTS chk_batch_status;
ALTER TABLE payment_batches ADD CONSTRAINT chk_batch_status CHECK (status IN (
    'DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED', 
    'SUBMITTED_TO_BANK', 'PROCESSING', 'SETTLED', 'PAID', 
    'PARTIALLY_SETTLED', 'PARTIALLY_PAID', 'FAILED', 'UNKNOWN', 'CANCELLED', 'RECONCILED'
));

ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS calculation_snapshot_hash VARCHAR(128);
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS calculation_snapshot_json JSONB;
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS calculation_approved_at TIMESTAMPTZ;
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS calculation_approved_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) DEFAULT 'Union Bank of India';
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS bank_channel VARCHAR(50) DEFAULT 'UNION_BANK_BULK_NEFT';
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS bank_batch_reference VARCHAR(100);
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS bank_submission_id UUID;
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS last_status_inquiry_at TIMESTAMPTZ;

-- 4. Extend payment_batch_items table with granular bank status, UTR, and calculation traces
ALTER TABLE payment_batch_items DROP CONSTRAINT IF EXISTS chk_batch_item_status;
ALTER TABLE payment_batch_items ADD CONSTRAINT chk_batch_item_status CHECK (status IN (
    'PENDING', 'CALCULATED', 'APPROVED', 'SUBMITTED', 'SUBMITTED_TO_BANK', 
    'PROCESSING', 'SETTLED', 'PAID', 'FAILED', 'UNKNOWN', 'CANCELLED', 'RECONCILED'
));

ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS bank_utr VARCHAR(100);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS bank_reference_number VARCHAR(100);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS bank_status_code VARCHAR(50);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS bank_status_description TEXT;
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS settlement_period_start DATE;
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS settlement_period_end DATE;
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS gross_payable NUMERIC(12,2);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS total_deductions NUMERIC(12,2);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS net_payable NUMERIC(12,2);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(12,2);
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS calculation_details JSONB;
ALTER TABLE payment_batch_items ADD COLUMN IF NOT EXISTS last_inquiry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_batch_items_bank_utr ON payment_batch_items(bank_utr);
CREATE INDEX IF NOT EXISTS idx_batch_items_status ON payment_batch_items(status);

-- 5. Bank Submissions Master Table (Union Bank Transmission Log)
CREATE TABLE IF NOT EXISTS bank_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE RESTRICT,
    bank_name VARCHAR(100) NOT NULL DEFAULT 'Union Bank of India',
    submission_type VARCHAR(50) NOT NULL, -- 'BULK_FILE_EXPORT', 'HOST_TO_HOST_API', 'CAPS_PORTAL_EXPORT'
    file_format VARCHAR(50) NOT NULL,     -- 'UNION_BANK_BULK_NEFT_CSV', 'UNION_BANK_CAPS_TXT', 'UNION_BANK_API'
    file_name VARCHAR(200),
    file_hash_sha256 VARCHAR(128) NOT NULL,
    file_checksum VARCHAR(128),
    total_records INT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    submission_reference VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'GENERATED',
    bank_acknowledgement_ref VARCHAR(100),
    bank_response_payload JSONB,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_submission_status CHECK (status IN (
        'GENERATED', 'SUBMITTED_TO_BANK', 'ACKNOWLEDGED', 'PROCESSING', 
        'COMPLETED', 'FAILED', 'TIMEOUT_UNKNOWN'
    )),
    CONSTRAINT chk_submission_type CHECK (submission_type IN (
        'BULK_FILE_EXPORT', 'HOST_TO_HOST_API', 'CAPS_PORTAL_EXPORT'
    ))
);

DROP TRIGGER IF EXISTS set_bank_submissions_updated_at ON bank_submissions;
CREATE TRIGGER set_bank_submissions_updated_at
BEFORE UPDATE ON bank_submissions
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bank_sub_org ON bank_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_bank_sub_batch ON bank_submissions(batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_sub_ref ON bank_submissions(submission_reference);

-- 6. Payment Settlement Snapshots (Immutable Audit Traceability Table)
CREATE TABLE IF NOT EXISTS payment_settlement_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    batch_item_id UUID NOT NULL REFERENCES payment_batch_items(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    milk_collection_credit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    milk_quantity_liters NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    collection_count INT NOT NULL DEFAULT 0,
    deductions_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advances_recovered NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    adjustments_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    previous_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_payable NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    source_ledger_transaction_ids JSONB DEFAULT '[]'::jsonb,
    source_collection_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_batch ON payment_settlement_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_cust ON payment_settlement_snapshots(customer_id);
CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_item ON payment_settlement_snapshots(batch_item_id);

-- 7. Add foreign key linking payment_batches to bank_submissions
ALTER TABLE payment_batches DROP CONSTRAINT IF EXISTS fk_batch_submission;
ALTER TABLE payment_batches 
ADD CONSTRAINT fk_batch_submission 
FOREIGN KEY (bank_submission_id) REFERENCES bank_submissions(id) ON DELETE SET NULL;

-- 8. Add check constraint for Indian Bank IFSC format on customers if not already present
-- Union Bank IFSC prefix: UBIN, other valid banks: 4 letters + '0' + 6 letters/digits
-- (Allow null if unverified, but when present enforce format)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_bank_ifsc_format;
ALTER TABLE customers ADD CONSTRAINT chk_customer_bank_ifsc_format
CHECK (bank_ifsc_code IS NULL OR bank_ifsc_code ~* '^[A-Z]{4}0[A-Z0-9]{6}$');
