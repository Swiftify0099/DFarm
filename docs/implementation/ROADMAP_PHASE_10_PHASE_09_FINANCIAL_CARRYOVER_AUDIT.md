# DFARM — ROADMAP PHASE 10: PHASE 09 FINANCIAL CARRYOVER AUDIT

**Document ID:** `ROADMAP-PHASE-10-DOC-003`  
**Execution Phase:** Roadmap Phase 10 — Cross-App Integration, End-to-End Business Workflows & Data Consistency  
**Target Path:** `docs/implementation/ROADMAP_PHASE_10_PHASE_09_FINANCIAL_CARRYOVER_AUDIT.md`  
**Date:** 2026-11-18  
**Classification:** Financial Correctness & Policy Carryover Audit  

---

## 1. Executive Summary

Roadmap Phase 09 implemented the financial calculation engine, double-entry subledger, billing cycles, maker-checker authorization, and bulk bank payouts. Before certifying cross-application integration in Phase 10, all carryover financial correctness gates, mathematical precision guarantees, regulatory definitions, and banking integration boundaries have been rigorously audited and reconciled.

This audit resolves historical documentation typos, enforces exact standard commercial `ROUND_HALF_UP` arithmetic, incorporates official Department of Animal Husbandry & Dairying (DAHD) pricing policy findings, and documents the operational boundaries of banking interfaces.

---

## 2. Financial Correctness Gates Audit

### 2.1 Arithmetic Precision & Half-Up Rounding Resolution
- **Mathematical Benchmark:**
  $$\text{Volume} = 12.345 \text{ Liters}$$
  $$\text{Unit Rate} = ₹45.67 \text{ per Liter}$$
  $$\text{Exact Product} = 12.345 \times 45.67 = 563.79615$$
- **Rounding Evaluation:**
  - Standard commercial rounding (`ROUND_HALF_UP`) rounds to 2 decimal places (paise precision).
  - The third decimal place is `6` ($6 \ge 5$), which strictly dictates rounding UP.
  - Correct paise result: **₹563.80**.
- **Historical Audit Finding:**
  - A typo in `ROADMAP_PHASE_09_RATE_CALCULATION_VERIFICATION.md` previously cited ₹563.79.
  - The authoritative backend engine `FinancialPolicyResolutionService.ts` has been verified and updated with the canonical `roundHalfUp(val, 2)` utility.
  - Boundary test verification across fractional values confirms exact half-up behavior without floating-point representation drift:
    - `roundHalfUp(12.345 * 45.67, 2)` $\to$ `563.80`
    - `roundHalfUp(1.005, 2)` $\to$ `1.01`
    - `roundHalfUp(1.004, 2)` $\to$ `1.00`
    - `roundHalfUp(2.555, 2)` $\to$ `2.56`

---

### 2.2 Statutory MSP Regulatory Audit & Terminology Reclassification
- **Official Regulatory Fact:**
  - In India, milk procurement prices are determined by market forces, cooperative dairy federations, and state cooperative unions.
  - The Department of Animal Husbandry & Dairying (DAHD), Ministry of Fisheries, Animal Husbandry and Dairying, Government of India, in official Press Information Bureau release **PIB 2287066 (21 July 2026)** explicitly confirmed:
    > "The Government of India does not regulate the procurement and sale price of milk. Milk procurement prices are decided by cooperative and private dairies based on market demand and supply. There is no proposal under consideration for statutory Minimum Support Price (MSP) for milk."
- **Platform Architecture Alignment:**
  - All occurrences claiming "government statutory MSP" have been audited.
  - The platform now represents pricing floors as **Authorized Dairy / Federation Procurement Price Floors**.
  - Canonical properties in `PricingCalculationSnapshot`:
    - `procurementFloorApplied: boolean`
    - `procurementFloorRate?: number`
  - Backward compatibility aliases `statutoryMinimumApplied` and `statutoryFloorRate` are preserved so existing database schemas and legacy callers remain functional.

---

### 2.3 Bank Beneficiary Validation Boundaries
- **Audited Capability:**
  - Bank Account Numbers are validated against length constraints (9 to 18 digits).
  - Bank IFSC Codes are validated against the standard RBI regex: `^[A-Z]{4}0[A-Z0-9]{6}$`.
- **Operational Reality Classification:**
  - This validation is **strictly syntactic**.
  - Syntactic validation does **not** verify account ownership, beneficiary name match, or active bank account status.
  - Live account verification (penny-drop via IMPS / NPCI) requires an active third-party corporate banking API provider, currently classified as `BLOCKED BY EXTERNAL PROVIDER`.

---

### 2.4 Finalized Bill Obligations as Payout Source
- **Settlement Rule:**
  - Payout batches cannot be generated against unfinalized or estimated milk intakes.
  - The authoritative source of payout eligibility is exclusively **FINALIZED** billing cycles (`status = 'FINALIZED'`).
  - Attempting to generate a payout batch for a draft or already-batched cycle returns HTTP 409 Conflict.

---

### 2.5 Generic NEFT CSV Export vs Direct Host-to-Host Gateways
- **Exported Format:** Standard corporate NEFT bulk upload CSV containing Beneficiary Name, Account Number, IFSC, Farmer Code, and Net Amount.
- **Security Headers:** File download enforces `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `Expires: 0`, and `X-Checksum-SHA256`.
- **Integration Boundary:** The generated CSV is designed for authorized manual upload to corporate banking portals (e.g. SBI Corporate, HDFC Corporate). It does not claim direct automated API execution with banks without official signed bank bilateral agreements.

---

### 2.6 State Bank of India (SBI CMP) Integration Status
- **Current Classification:** `BLOCKED BY EXTERNAL PROVIDER`.
- **Rationale:** SBI Cash Management Portal (CMP) requires client host certificate pairing, SFTP endpoint credentials, and signed bilateral bank mandates. In the absence of live bank credentials, attempting to export an unconfigured SBI CMP format throws an explicit, fail-safe diagnostic error.

---

### 2.7 Strict Zero Razorpay Policy in Farmer Milk Procurement
- **Audit Verification:**
  - Verified that zero consumer payment gateways (Razorpay, Paytm, Cashfree consumer SDKs) are invoked in milk collection, farmer subledger credits, or farmer payout disbursements.
  - All farmer payouts are processed via institutional corporate banking batch files or cash disbursements with full audit logging.

---

## 3. Summary of Status Classifications

| Component | Status Classification | Details |
|:---|:---|:---|
| Exact Half-Up Arithmetic (`roundHalfUp`) | **IMPLEMENTED AND TESTED** | Verified in `FinancialPolicyResolutionService.ts` and automated tests. |
| Dairy Procurement Floor Reclassification | **IMPLEMENTED AND TESTED** | DAHD PIB 2287066 aligned; backward-compatible aliases active. |
| Double-Entry Subledger Posting | **IMPLEMENTED AND TESTED** | Balanced debits and credits verified. |
| Finalized Bill Payout Batches | **IMPLEMENTED AND TESTED** | Segregation of duties enforced (Maker-Checker). |
| Standard NEFT CSV Export | **IMPLEMENTED AND TESTED** | Cryptographic SHA-256 header and no-cache enforced. |
| Bank Return CSV Reconciliation | **IMPLEMENTED AND TESTED** | Line item settlement and farmer passbook updates verified. |
| Live Bank Account Ownership Verification | **BLOCKED BY EXTERNAL PROVIDER** | Awaiting corporate banking penny-drop API credentials. |
| SBI CMP Automated SFTP Integration | **BLOCKED BY EXTERNAL PROVIDER** | Awaiting bank corporate SFTP and PKI credentials. |
