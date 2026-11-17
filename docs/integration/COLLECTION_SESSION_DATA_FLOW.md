# DFARM — COLLECTION SESSION & MILK INTAKE TRANSACTION DATA FLOW

**Authoritative Technical Document**  
**Component Scope**: Kiosk Shift Session → Biometric / RFID Intake → Milk Quality Analysis → Rate Engine → Atomic Ledger Credit → Shift Closure  
**Invariant**: Every milk intake record and financial posting is atomic, idempotent, rate-audited, and persisted strictly into the tenant's isolated database.

---

## 1. End-to-End Collection Workflow Diagram

```
[Collection Kiosk Operator]
         │
         ▼ 1. Open Shift Session
[POST /api/v1/collections/sessions/open]
         │  Payload: { centerId, shiftType: 'MORNING'|'EVENING', operatorId }
         ▼
[Isolated Dairy Database (Tenant DB)]
         │  - Validates active shift rules (collection_shifts)
         │  - Inserts row into kiosk_shift_sessions (status: 'OPEN')
         ▼
[2. Farmer Identification Event]
         │  - Option A: Live Face Match (YuNet + SFace Cosine Sim >= 0.363)
         │  - Option B: 13.56 MHz RFID Tag Tap
         │  - Option C: Manual Farmer Code entry (e.g., GOK-108)
         ▼
[3. Milk Measurement & Quality Analysis]
         │  - Digital Weighing Scale: Gross - Tare = Net Liters (e.g., 18.5 L)
         │  - Ultrasonic Milk Analyzer: Fat % (4.4%), SNF % (8.7%), Temp, CLR
         ▼
[4. Rate Calculation Engine]
         │  - Retrieves tenant's active rate chart from rate_charts
         │  - Grid lookup (Fat x SNF matrix) with formula fallback
         │  - Applied Rate = ₹42.48 / L; Total = 18.5 * 42.48 = ₹785.88
         ▼
[POST /api/v1/collections/transactions (Milk Intake)]
         │  Header: X-Dairy-Id: {organizationId}
         │  Header: X-Idempotency-Key: {kiosk_uuid}:{session_code}:{seq}
         ▼
[Tenant DB: Atomic Multi-Table Transaction]
         │
         ├──► INSERT INTO collection_transactions (Liters, Fat, SNF, Rate, Amount, Receipt#)
         ├──► UPDATE kiosk_shift_sessions (Increment total_liters, total_amount, milk-type count)
         ├──► INSERT INTO ledger_transactions (TransactionType: 'MILK_COLLECTION_PAYABLE', Amount)
         └──► UPDATE customer_ledger_accounts (current_balance += ₹785.88, total_credits += ₹785.88)
         │
         ▼ Commit Transaction
[Instant Receipt Generation & Notification]
         ├──► Kiosk Thermal Printout (Receipt # RCP-F8D3D66E)
         └──► Customer App Real-Time Push Notification & Subledger Refresh
```

---

## 2. Shift Session Management Lifecycle

Shift sessions govern the operational collection window at each Village Collection Center (VCC).

### Schema: `kiosk_shift_sessions`
```sql
CREATE TABLE IF NOT EXISTS kiosk_shift_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES dairy_centers(id),
    shift_code VARCHAR(50) NOT NULL UNIQUE,
    shift_type VARCHAR(10) NOT NULL, -- 'MORNING' or 'EVENING'
    shift_date DATE NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED', 'AUDITED'
    total_liters NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_farmers INTEGER NOT NULL DEFAULT 0,
    cow_liters NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    buffalo_liters NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    opened_by UUID REFERENCES users(id),
    closed_by UUID REFERENCES users(id)
);
```

### Lifecycle States:
1. **OPEN**: Accepts incoming milk deliveries; accumulates totals.
2. **CLOSED**: No further milk entries permitted. Final summary reconciled with dispatch can totals.
3. **AUDITED**: Verified by dairy supervisor and approved for billing disbursement.

---

## 3. Rate Calculation Engine

DFarm implements a dual-mode calculation engine:

1. **Matrix Grid Rate**:
   - Queries `rate_charts` where `organization_id = $1` and `is_active = TRUE`.
   - Maps exact `(Fat, SNF)` intersections in standard 0.1% resolution.
   - Example: For Cow Milk with Fat $4.4\%$ and SNF $8.7\%$, the grid yields **₹42.48 / L**.

2. **Total Solids (TS) Formula Fallback**:
   $$\text{Rate} = (\text{Fat} \times R_{\text{fat}}) + (\text{SNF} \times R_{\text{snf}})$$
   Used if an exact grid cell is undefined or when specific cooperatives mandate TS-based payment.

---

## 4. Double-Entry Accounting & Ledger Integrity

Financial transactions must be immutable, traceable, and double-entry compliant.

### Atomic Database Transaction Operations:
When a milk intake request is posted:
```sql
BEGIN TRANSACTION;

-- 1. Insert transaction record
INSERT INTO collection_transactions (
    id, session_id, customer_id, center_id, milk_type,
    quantity_liters, fat_percentage, snf_percentage,
    rate_per_liter, total_amount, receipt_number, idempotency_key
) VALUES (
    $1, $2, $3, $4, 'COW', 18.5, 4.4, 8.7, 42.48, 785.88, $5, $6
);

-- 2. Increment session accumulators
UPDATE kiosk_shift_sessions 
SET 
    total_liters = total_liters + 18.5,
    total_amount = total_amount + 785.88,
    total_farmers = total_farmers + 1,
    cow_liters = cow_liters + 18.5
WHERE id = $2;

-- 3. Post to double-entry ledger
INSERT INTO ledger_transactions (
    id, account_id, transaction_type, debit_amount, credit_amount,
    reference_id, reference_type, description
) VALUES (
    gen_random_uuid(), $customer_account_id, 'MILK_CREDIT', 0.00, 785.88,
    $1, 'COLLECTION_TRANSACTION', 'Milk Delivery: 18.5 L Cow Milk @ ₹42.48'
);

-- 4. Update customer ledger account running balance
UPDATE customer_ledger_accounts
SET 
    current_balance = current_balance + 785.88,
    total_credits = total_credits + 785.88,
    updated_at = NOW()
WHERE id = $customer_account_id;

COMMIT;
```

---

## 5. Idempotency & Replay Attack Defense

Network fluctuations between rural collection centers and cloud backends frequently cause retried HTTP requests.

### Idempotency Strategy:
1. The Kiosk generates an idempotency key before dispatching the request:
   `IDEMP-{KioskUUID}-{SessionCode}-{SequenceNumber}`
2. The backend repository checks:
   `SELECT * FROM collection_transactions WHERE idempotency_key = $1`
3. If a match is found:
   - The transaction is **not re-executed**.
   - No ledger balance is duplicated.
   - The original receipt (`receipt_number`) and recorded amounts are returned with `200 OK`.
4. Automated verification in Phase 6 proved that replaying the exact same transaction payload returned the identical receipt (`RCP-F8D3D66E`) and preserved the customer ledger balance at exactly **₹785.88** rather than doubling to ₹1,571.76.
