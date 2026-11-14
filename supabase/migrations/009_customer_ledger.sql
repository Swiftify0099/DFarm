-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 009: CUSTOMER FINANCIAL LEDGER AND ACCOUNTING
-- ==============================================================================

-- 1. Customer Ledger Accounts (Account Header with Running Balance)
CREATE TABLE IF NOT EXISTS customer_ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    last_transaction_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_customer_ledger_accounts_updated_at
BEFORE UPDATE ON customer_ledger_accounts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org ON customer_ledger_accounts(organization_id);

-- 2. Ledger Transactions (Append-Only Financial Journal)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(40) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reference_entity VARCHAR(30) NOT NULL,
    reference_id UUID NOT NULL,
    description TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ledger_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_ledger_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_ledger_txn_type CHECK (transaction_type IN (
        'MILK_COLLECTION_CREDIT', 'FEED_PURCHASE_DEBIT', 'ADVANCE_DEBIT',
        'DEDUCTION_DEBIT', 'PAYMENT_PAYOUT_DEBIT', 'LEDGER_ADJUSTMENT_CREDIT',
        'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT'
    )),
    CONSTRAINT chk_ledger_ref_entity CHECK (reference_entity IN (
        'MILK_COLLECTION', 'FEED_SALE', 'CUSTOMER_ADVANCE',
        'CUSTOMER_DEDUCTION', 'CUSTOMER_PAYMENT', 'MANUAL_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_customer 
ON ledger_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_center 
ON ledger_transactions (center_id, created_at DESC);

-- 3. Ledger Entries (Double-Entry Balanced Journal Entries)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    CONSTRAINT chk_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_entry_positive_amount CHECK (amount > 0.00),
    CONSTRAINT chk_entry_account_type CHECK (account_type IN (
        'CUSTOMER_PAYABLE', 'MILK_PURCHASE_EXPENSE', 'FEED_INVENTORY',
        'CASH_BANK', 'ADVANCE_RECEIVABLE'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_txn ON ledger_entries(transaction_id);

-- 4. Customer Advances (Emergency Loan Disbursements)
CREATE TABLE IF NOT EXISTS customer_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    advance_date DATE NOT NULL,
    principal_amount NUMERIC(10,2) NOT NULL,
    recovery_type VARCHAR(30) NOT NULL DEFAULT 'MONTHLY_BILL_DEDUCTION',
    total_recovered_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    outstanding_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_advance_principal CHECK (principal_amount > 0.00),
    CONSTRAINT chk_advance_recovery_bounds CHECK (total_recovered_amount >= 0.00 AND total_recovered_amount <= principal_amount),
    CONSTRAINT chk_advance_status CHECK (status IN ('ACTIVE', 'FULLY_RECOVERED', 'WRITTEN_OFF')),
    CONSTRAINT chk_advance_recovery_type CHECK (recovery_type IN ('MONTHLY_BILL_DEDUCTION', 'INSTALLMENTS', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_customer_advances_cust ON customer_advances(customer_id);

-- 5. Customer Deductions (Veterinary, AI Breeding, and Cooperative Fees)
CREATE TABLE IF NOT EXISTS customer_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    deduction_category VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    is_applied_to_bill BOOLEAN NOT NULL DEFAULT FALSE,
    applied_bill_id UUID,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_deduction_positive CHECK (amount > 0.00),
    CONSTRAINT chk_deduction_category CHECK (deduction_category IN (
        'VETERINARY_MEDICINE', 'AI_BREEDING_CHARGE', 'CATTLE_INSURANCE',
        'MEMBERSHIP_FEE', 'OTHER'
    ))
);

CREATE INDEX IF NOT EXISTS idx_customer_deductions_cust ON customer_deductions(customer_id);

-- 6. Customer Ledger Adjustments (Audited Manual Ledger Adjustments)
CREATE TABLE IF NOT EXISTS customer_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(10) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_adjustment_type CHECK (adjustment_type IN ('CREDIT', 'DEBIT')),
    CONSTRAINT chk_adjustment_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_customer_adj_cust ON customer_adjustments(customer_id);

