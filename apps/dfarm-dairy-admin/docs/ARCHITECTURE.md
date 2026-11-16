# DFarm Dairy Admin Web — Architecture Documentation

## 1. Architectural Philosophy & Isolation

The DFarm Dairy Admin platform is engineered from the ground up as a **100% greenfield, single-tenant isolated management application** for an individual registered dairy enterprise. 

### Core Architectural Principles
1. **Single-Tenant Scoping by Design**:
   - The Dairy Admin only has visibility and authority over records belonging to the specific dairy tenant (`CURRENT_DAIRY_ID`).
   - Every request is automatically injected with the `X-Dairy-Tenant-ID` scoping header.
   - The backend authoritative server validates tenant boundaries on every read/write operation. Cross-tenant access is rejected with HTTP 403 Forbidden.

2. **Mobile OTP Authentication & Zero Trust Session Management**:
   - Authentication is strictly anchored to the primary Dairy Admin's provisioned mobile number (e.g., `+91 9876543210`).
   - No hardcoded OTPs, mock tokens, or fake bypasses are accepted.
   - The backend validates the OTP via a timed state machine (5-minute expiration, 3-attempt lockout threshold), issues an ephemeral JWT session token, and resolves the tenant dairy profile.

3. **Server-Authoritative Financial Integrity**:
   - Financial balances (customer milk credits, feed deductions, adjustments) are never directly editable by frontend inputs.
   - Double-entry ledgers maintain continuous chronological running balances.
   - Non-destructive adjustments require authorized reasons, preserving original values and creating compensating ledger entries.

4. **Biometric Privacy & Zero-Knowledge Admin Architecture**:
   - Administrative lifecycle control for OpenCV YuNet ONNX & OpenCV SFace INT8 ONNX biometric pipelines.
   - The Admin Web UI **never exposes raw customer facial photos or mathematical facial embeddings**.
   - Admins inspect cryptographically signed quality scores, consent timestamps, template versions, and capture device fingerprints.

---

## 2. Technology Stack & Modern Web Standards

| Layer | Component | Version | Role |
|---|---|---|---|
| **Core Framework** | React + TypeScript | React 19.3 / TS 7.0 | Component architecture & strict type safety |
| **Build & Bundler** | Vite | Vite 8.3 / Rolldown | Sub-second HMR & optimized production bundling |
| **Routing** | React Router | React Router DOM v7 | Declarative route protection & code-split layouts |
| **Server State** | TanStack Query | TanStack Query v5 | Auto-caching, optimistic mutations & background polling |
| **Form & Validation** | React Hook Form + Zod | v7 / v4 | Declarative schemas & strict validation |
| **Styling & Depth** | Tailwind CSS v4 + Claymorphism | Tailwind v4.3 | Multi-layered 3D depth, specular highlights & DFarm palette |
| **Charts & Data Viz** | Recharts | Recharts v3.10 | Responsive volume, Fat/SNF, and financial trend visualizers |
| **Test Framework** | Vitest + Testing Library | Vitest v5.1 | High-speed unit & integration test runner |

---

## 3. Directory Layout

```
dfarm-dairy-admin/
├── src/
│   ├── api/                     # Typed API client, tenant scoping, & authoritative backend
│   │   ├── client.ts            # Axios/Fetch HTTP client with tenant headers
│   │   ├── index.ts             # High-level domain service methods
│   │   └── mock-server.ts       # Authoritative in-memory state engine & seed datasets
│   ├── assets/                  # Original DFarm SVG graphical assets & brand illustrations
│   │   └── illustrations.tsx    # Logo, Cow, Buffalo, Milk Can, YuNet Biometric, RFID, IoT
│   ├── components/              # Modular UI components
│   │   ├── layout/              # Header, Sidebar, and AdminLayout
│   │   └── ui/                  # Reusable Claymorphism UI kit (Card, Button, Badge, Modal, Table...)
│   ├── context/                 # Application contexts (Auth, Tenant, Permissions)
│   ├── pages/                   # Feature domain modules
│   │   ├── auth/                # Mobile OTP Sign-in
│   │   ├── dashboard/           # Operational Dairy Dashboard
│   │   ├── customers/           # Pending Approvals, Customer Directory & 10-Tab Dossier
│   │   ├── biometrics/          # YuNet & SFace ONNX Biometric Template Lifecycle
│   │   ├── rfid/                # Smart Contactless RFID Card Registry
│   │   ├── collection/          # Shift Sessions & Granular Milk Collection Register
│   │   ├── quality/             # Fat, SNF & CLR Lactometer Quality Analytics
│   │   ├── rate-charts/         # Versioned Milk Pricing Tables (Cow & Buffalo)
│   │   ├── ledger/              # Server-Authoritative Customer Ledgers
│   │   ├── billing/             # Fortnightly Settlement & Non-Duplicate Bill Generation
│   │   ├── feed/                # Feed Catalog, Restock Movements & Farmer Sales
│   │   ├── payments/            # Payout Disbursements & Banking Reconciliation
│   │   ├── devices/             # Smart Analyzer Kiosks & Offline Sync Queue Monitor
│   │   ├── staff/               # Operator Permission Matrix (Least Privilege)
│   │   ├── audit/               # Immutable Audit Log Explorer
│   │   ├── reports/             # Hub for all 17 Authoritative Business Reports
│   │   └── profile/             # Dairy Cooperative Profile & Operating Shift Windows
│   ├── test/                    # Automated Vitest test suites
│   ├── types/                   # Strict TypeScript domain interfaces
│   ├── App.tsx                  # Root routing & query provider tree
│   ├── main.tsx                 # DOM Entrypoint
│   └── index.css                # DFarm Design System & Claymorphism CSS engine
├── docs/                        # Complete technical documentation deliverables
├── package.json
├── tsconfig.json
└── vite.config.ts
```
