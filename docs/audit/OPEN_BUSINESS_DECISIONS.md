# DFarm Open Business Decisions & Architectural Trade-offs

## 1. Executive Summary

This document catalogs critical business, operational, and architectural decisions that require executive sign-off from the DFarm business owners. Each decision includes technical trade-offs, operational consequences, cost models, and architectural recommendations.

---

## 2. Decision Matrix Summary

| # | Strategic Decision | Options Under Consideration | Architectural Recommendation | Impact Area |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Tenant Database Topology** | A. Physical Standalone DB per Tenant<br>B. Dedicated Schema per Tenant<br>C. Shared DB with Row-Level Security | **Option B (Dedicated Schema)** initially, migrating to **Option A** for large enterprise federations | High (Infrastructure Cost, Isolation, Migration) |
| **2** | **Bank Payout Mechanism** | A. Direct Bank API (RazorpayX / Cashfree)<br>B. Offline SBI CMP Batch File Upload<br>C. Hybrid (Batch for bulk, API for ad-hoc) | **Option B (Offline SBI Batch)** for v1, roadmap to **Option C** | High (Banking compliance, API costs, Float) |
| **3** | **Biometric Fallback Policy** | A. Supervisor PIN Override<br>B. Operator Manual Selection + Audit Log<br>C. 2FA SMS OTP to Farmer | **Option A + B (PIN Override + Photo Snapshot Audit)** | High (Intake throughput, Fraud prevention) |
| **4** | **Hardware Serial Interface** | A. Browser Web Serial API<br>B. Local Go/Rust Kiosk Daemon Bridge | **Option A (Web Serial API)** for modern Chrome/Edge kiosks | Medium (Deployment complexity, Driver setup) |
| **5** | **Milk Rate Calculation Model**| A. Two-Axis FAT/SNF Matrix<br>B. Total Solids (TS) Formula<br>C. Base Rate +/- Slab Deductions | **Option A (Two-Axis Matrix)** with support for **Option B** | High (Farmer trust, Pricing transparency) |
| **6** | **AMC Expiry & Suspension Policy** | A. Hard Immediate Lockout<br>B. 14-Day Grace Period (Intake continues)<br>C. Read-Only Kiosk Lock | **Option B (14-Day Grace Period with Daily Banner)** | High (Business continuity, Farmer relations) |
| **7** | **Farmer Mobile Identity Scope** | A. Globally Unique Phone across Platform<br>B. Phone Unique Per Dairy Tenant | **Option A (Global Identity, Multi-Tenant Link)** | High (Farmer App UX, Central Auth) |
| **8** | **Biometric Template Portability**| A. Isolated Per Dairy (No Sharing)<br>B. Global Central Biometric Pool | **Option A (Strictly Isolated Per Dairy)** | High (DPDP Act 2023 Compliance, Privacy) |

---

## 3. Deep-Dive Decision Analysis

### Decision 1: Tenant Database Topology

#### Options:
- **Option A: Physical Independent PostgreSQL Database per Dairy (`dfarm_tenant_<uuid>`)**
  - *Pros*: Maximum security isolation, independent backup/restore, independent geographic hosting, regulatory compliance for large cooperatives.
  - *Cons*: High idle resource consumption; connection pooling complexity in Node.js; higher cloud hosting costs for hundreds of small village centers.
- **Option B: Dedicated Schema per Dairy (`tenant_<uuid>.*`) inside Shared Cluster**
  - *Pros*: Strong logical namespace isolation, lower memory overhead, single shared connection pool, simple cross-tenant aggregation for Super Admin reports.
  - *Cons*: No physical disk isolation; a runaway query from one tenant can consume cluster CPU.
- **Option C: Shared Tables with Row-Level Security (`dairy_id` column on all tables)**
  - *Pros*: Easiest to maintain and scale; lowest hosting cost.
  - *Cons*: High risk of developer error causing cross-tenant data leaks; difficult to hand over raw database dumps to cooperative boards.

#### Recommendation:
Adopt **Option B (Dedicated Schema per Tenant)** for standard village cooperatives (under 1,000 farmers) while preserving the `dairy_database_mappings` router capability to route enterprise cooperatives to **Option A (Physical Standalone DB)** when contractually required.

---

### Decision 2: Farmer Milk Payment Settlement Mechanism

#### Options:
- **Option A: Direct Automated Banking API (RazorpayX, Cashfree, ICICI CIB)**
  - *Pros*: Real-time 24/7 instant IMPS/NEFT; instant UTR callback; zero manual file handling.
  - *Cons*: Requires the Dairy to maintain an escrow/pre-funded current account with the fintech partner; per-transaction fees (₹3 to ₹5 per payout) which village cooperatives resist paying.
- **Option B: Offline Corporate Banking Batch File (SBI CMP / PNB Corporate)**
  - *Pros*: Free or low-cost corporate banking arrangement; uses the Dairy's existing cooperative current account; familiar to village accountants.
  - *Cons*: Manual download and re-upload process; settlement feedback requires importing bank statement CSVs.

#### Recommendation:
Implement **Option B (SBI CMP CSV Batch File Export & Reconciliation)** as the primary baseline. Provide a roadmap toggle for **Option A** for digitally mature dairy federations willing to fund API-integrated escrow accounts.

---

### Decision 3: Biometric / RFID Fallback & Fraud Mitigation

#### Context:
Rural collection kiosks experience conditions where a farmer's face cannot be recognized (poor lighting, mud/dirt on face, facial injuries, lens smudges) or their RFID card is lost or forgotten.

#### Options:
- **Option A: Operator Manual Search with Supervisor PIN Override**
  - *Workflow*: Operator selects farmer name from directory; prompt asks for Shift Supervisor PIN; kiosk captures a silent web-camera photo snapshot stored in `customer_identification_logs`.
  - *Trade-off*: Fast (under 5 seconds); provides an audit trail; prevents shift bottlenecks.
- **Option B: SMS OTP Verification to Farmer's Phone**
  - *Workflow*: System sends 4-digit OTP to farmer's mobile; farmer speaks OTP to operator.
  - *Trade-off*: High latency (rural cell reception is poor; SMS delays can exceed 2 minutes); disrupts morning shift speed (which requires 10–15 seconds per farmer).

#### Recommendation:
Adopt **Option A (Manual Lookup with Supervisor PIN + Mandatory Photo Snapshot)**. Rural collection shifts cannot tolerate SMS latency. The snapshot provides non-repudiation during weekly audit reconciliations.

---

### Decision 4: Hardware Serial Interface Architecture

#### Context:
Milk analyzers (Essae, Ekomilk, Lactoscan) and digital weighing scales communicate over RS232 serial ports at 9600/2400 baud.

#### Options:
- **Option A: Native Browser Web Serial API**
  - *Pros*: Zero external installation; runs directly inside Chrome/Edge; direct JavaScript event stream.
  - *Cons*: Requires HTTPS; user must grant serial port permission once per browser session.
- **Option B: Local Native Background Daemon (Go / Python / Rust Bridge)**
  - *Pros*: Automatic device discovery; can run headless.
  - *Cons*: Requires packaging, distributing, installing, and updating native OS binaries on diverse kiosk hardware (Windows 7/10/11, Ubuntu).

#### Recommendation:
Adopt **Option A (Web Serial API)** for DFarm Collection App. It eliminates local software maintenance and works out-of-the-box on modern Chromium browsers.

---

### Decision 5: Milk Rate Pricing Calculation Model

#### Options:
- **Option A: Two-Axis FAT / SNF Rate Matrix**
  - Standard in Maharashtra, Gujarat, and Karnataka. Rates are defined in a 2D lookup table: Row = FAT (3.0% to 10.0%), Column = SNF (7.0% to 10.5%).
- **Option B: Total Solids (TS) / Formula-Based Pricing**
  - Rate calculated as: $\text{Rate} = (\text{FAT} \times K_1) + (\text{SNF} \times K_2)$. Common in northern states (Punjab, Haryana).

#### Recommendation:
Support **Option A (Two-Axis Matrix)** as default, with an organization-level configuration toggle to enable **Option B (TS Formula)** for specific cooperative federations.

---

### Decision 6: Platform AMC Expiry & Service Suspension Policy

#### Policy Invariant:
If an operational dairy fails to pay its annual AMC, how should the platform enforce payment without causing milk spoilage or farmer unrest?

#### Recommended Policy:
1. **Day -30 to Day 0 (Notice Window)**: Prominent renewal banner in Dairy Admin; email and SMS alerts to Primary Admin.
2. **Day +1 to Day +14 (Active Grace Period)**: Kiosk milk collection continues unaffected. Dairy Admin sees a persistent warning.
3. **Day +15 (Soft Lock / Restricted Operations)**: Kiosk milk collection continues locally, but monthly bill generation and bulk payouts in Dairy Admin are blocked.
4. **Day +30 (Hard Suspension)**: Kiosk sync is suspended; login restricted to Super Admin diagnostic view. Reactivation occurs only upon verified Razorpay payment or Super Admin override.

---

### Decision 7: Farmer Mobile Identity Scope

#### Dilemma:
Can a farmer supply milk to Dairy A in the morning and Dairy B in the evening with the same mobile number?

#### Recommendation:
**Global User Identity, Tenant-Scoped Membership**:
- The customer's mobile number is registered globally in the central control plane (`central.users`).
- The customer can have multiple active memberships in `tenant.customers`.
- When the farmer opens the Customer App, they can select which dairy account to view or view a unified dashboard.

---

### Decision 8: Biometric Face Template Privacy & Sharing

#### Legal Context:
India's Digital Personal Data Protection (DPDP) Act 2023 mandates purpose limitation for biometric data.

#### Recommendation:
**Strict Tenant Isolation of Biometric Templates**:
- Biometric vectors enrolled for Dairy A must NEVER be shared with Dairy B without fresh explicit consent.
- Biometric embeddings must reside strictly in that Dairy's operational database (`dfarm_tenant_<id>.customer_face_embeddings`).
- Prevents cross-dairy surveillance and ensures strict legal compliance.
