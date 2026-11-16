# DFarm Dairy Admin Web Platform

**Application:** DFarm Dairy Admin Web Platform  
**Approach:** 100% Greenfield Development  
**Platform:** Modern Web Browser (React 19 + TypeScript + Vite)  
**UI Direction:** Premium DFarm Claymorphism  
**Tenancy:** Isolated Individual Dairy Business Management  

---

## 🐄 Overview

DFarm Dairy Admin is the dedicated management platform for an individual registered dairy enterprise. Built strictly from zero following the Greenfield Development Master Specification, it provides end-to-end governance over farmer onboarding, facial biometrics (OpenCV YuNet + SFace ONNX), RFID smart cards, milk intake collection, quality lactometer telemetry, versioned rate charts, server-authoritative double-entry ledgers, fortnightly billing, cattle feed inventory, payout reconciliations, and 17 authoritative business reports.

---

## 🎨 DFarm Premium Claymorphic Design System

The application strictly implements the approved DFarm palette and layered 3D claymorphic depth:

| Color Role | Hex Code | Purpose |
|---|---|---|
| **Primary Cream** | `#FFF5EE` | Ambient page canvas |
| **Primary Orange** | `#FF6A00` | High-impact action buttons & primary highlights |
| **Secondary Orange** | `#F58A38` | Button gradients & subtle badges |
| **Peach** | `#FFE9DC` | Card container fills & icon backdrops |
| **Primary Text** | `#211B18` | High-contrast espresso typography |
| **Secondary Text** | `#817A75` | Captions, subtitles, and secondary labels |
| **Border** | `#F1E7E0` | Subtle, warm architectural borders |

---

## 🚀 Key Modules & Capabilities

1. **Authentication:** Genuine Mobile OTP flow state machine with 6-digit code dispatch, 5-minute expiration, 3-attempt lockout, and backend dairy tenant resolution.
2. **Operational Dashboard:** Real-time metrics for today's intake, cow vs buffalo breakdown, pending approvals banner, weekly volume bar chart, and Fat/SNF trend line charts.
3. **Customer Approval Workflow:** Mandatory verification for self-onboarded farmers from the Customer App. Review OpenCV YuNet + SFace ONNX biometric template quality, consent evidence, and approve or reject with mandatory reason.
4. **Customer Directory & Dossier:** Comprehensive directory with search, filter, soft delete, restore, and 10-section customer dossiers.
5. **Face Biometrics Management:** YuNet ONNX & SFace INT8 ONNX administrative lifecycle control (Approved, Re-enrollment requested, Revoked). Raw face photos/embeddings are never exposed.
6. **RFID Smart Card Registry:** Physical tag issuance, duplication prevention, and marking misplaced cards as LOST.
7. **Collection Sessions & Milk Register:** Shift session monitoring and intake register with non-destructive, auditable adjustments.
8. **Milk Quality Analytics:** Lactometer and analyzer telemetry for Fat %, SNF %, density, temperature, and adulteration flags.
9. **Rate Chart Versioning:** Two-axis Cow/Buffalo rate chart versioning with step increments and historical version preservation.
10. **Customer Ledgers & Billing:** Server-authoritative double-entry ledger calculation and fortnightly billing with duplicate bill prevention.
11. **Feed Inventory & Sales:** Product stock tracking, restock logs, and farmer sales with automated milk ledger debit.
12. **Payments & Receipts:** Bank transfer/cash settlement vouchers with UTR tracking and thermal print support.
13. **Hardware & Sync Monitoring:** Real-time health telemetry for smart collection kiosks and offline sync queue monitor.
14. **Staff & Least Privilege:** Configurable permission matrix for supervisors and operators.
15. **Audit Logs:** Immutable audit history identifying operator, action, entity, timestamp, and diff.
16. **17 Authoritative Reports:** Dedicated hub generating Daily Collection, Monthly Collection, Cow, Buffalo, Fat, SNF, Amount, Ledger, Bills, Pending Balance, Payments, Feed Sales, Stock, Session, Device Health, and Sync Reports.

---

## 🛠️ Getting Started

### 1. Installation
```bash
cd dfarm-dairy-admin
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

**Demo Primary Admin Login:**
- **Mobile Number:** `9876543210`
- **OTP Code:** Dispatched automatically upon clicking "Send Authentication OTP" and previewed on screen.

### 3. Automated Test Suite
```bash
npm run test
```

### 4. Production Build
```bash
npm run build
npm run preview
```

---

## 📚 Technical Documentation Deliverables

Detailed engineering specifications are located in [`docs/`](./docs/):
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Technical architecture & isolation principles
- [`docs/NAVIGATION.md`](./docs/NAVIGATION.md) — Screen & navigation flow diagram
- [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) — DFarm palette & Claymorphism CSS mechanics
- [`docs/API_CONTRACTS.md`](./docs/API_CONTRACTS.md) — Typed API endpoints & request/response schemas
- [`docs/BACKEND_DEPENDENCIES.md`](./docs/BACKEND_DEPENDENCIES.md) — Complete relational SQL database schema
- [`docs/TENANT_SECURITY.md`](./docs/TENANT_SECURITY.md) — Multi-tenant threat model & security boundaries
- [`docs/PERMISSION_MATRIX.md`](./docs/PERMISSION_MATRIX.md) — Least privilege operational role access matrix
- [`docs/CUSTOMER_APPROVAL_WORKFLOW.md`](./docs/CUSTOMER_APPROVAL_WORKFLOW.md) — End-to-end customer approval lifecycle
- [`docs/FACE_ENROLLMENT_ADMIN.md`](./docs/FACE_ENROLLMENT_ADMIN.md) — OpenCV YuNet & SFace ONNX template governance
- [`docs/RATE_CHART_VERSIONING.md`](./docs/RATE_CHART_VERSIONING.md) — Rate chart versioning & historical preservation
- [`docs/BILLING_LEDGER.md`](./docs/BILLING_LEDGER.md) — Server-authoritative double-entry ledger & billing rules
- [`docs/INVENTORY.md`](./docs/INVENTORY.md) — Cattle feed stock tracking & customer debit synchronization
- [`docs/TEST_REPORT.md`](./docs/TEST_REPORT.md) — Automated quality assurance test execution report (100% pass)
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Production build, NGINX configuration, & hosting
- [`docs/LIMITATIONS_AND_DECISIONS.md`](./docs/LIMITATIONS_AND_DECISIONS.md) — Unresolved governance decisions & roadmap
