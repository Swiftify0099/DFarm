# DFarm Admin Web Dashboard — Developer Guide

## 1. Overview
The **DFarm Admin Web Dashboard** (`apps/admin-web`) is the unified administrative, financial, operational, and business management console for the DFarm Smart Dairy Operating Platform. It connects dairy owners, branch center managers, accountants, supervisors, and inventory clerks with authoritative PostgreSQL and Express backend services.

---

## 2. Architecture & Technologies
- **Framework**: React 18 with TypeScript 5.7+ (`JSX: react-jsx`).
- **Styling**: Tailwind CSS design tokens with responsive desktop and tablet layouts.
- **State & Communication**:
  - `AuthProvider`: Manages user credentials, JWT session token, active center selection, shift window (Morning/Evening), operational business date, and role permissions (`hasRole`, `isAdmin`, `isAccountant`, etc.).
  - `ToastProvider`: Global feedback alerts (success, error, warning, info).
  - `apiClient`: Strongly typed fetch wrapper handling Bearer tokens, correlation IDs (`X-Request-Id`), and 401 unauthenticated redirects.
- **Package Workspace**: `@dfarm/admin-web` in npm workspaces.

---

## 3. Directory Structure
```
apps/admin-web/
├── index.html                    # Single Page Application HTML shell
├── package.json                  # Workspace definition and dependencies
├── tsconfig.json                 # TypeScript compiler configuration (NodeNext)
├── src/
│   ├── main.tsx                  # Application DOM entry point
│   ├── App.tsx                   # Master app routing and layout shell
│   ├── index.ts                  # Library exports for all modules and types
│   ├── api/                      # Strongly typed REST client services
│   │   ├── client.ts             # Base apiClient with automatic 401 handling
│   │   ├── authApi.ts            # Staff authentication & /auth/me
│   │   ├── dashboardApi.ts       # 15 operational metric aggregations
│   │   ├── customerApi.ts        # Customer KYC, RFID, privacy shield & ledger
│   │   ├── collectionApi.ts      # Milk intake registers & thermal slip
│   │   ├── rateApi.ts            # FAT x SNF rate matrices & versioning
│   │   ├── billingApi.ts         # Periodic billing cycles & PDF statements
│   │   ├── paymentApi.ts         # Direct payouts, batches & bank reconciliation
│   │   ├── feedApi.ts            # Cattle feed inventory & POS store (P14)
│   │   ├── employeeApi.ts        # Staff directory, attendance & payroll (P16)
│   │   ├── deviceApi.ts          # Hardware terminal fleet & offline sync
│   │   └── reportsApi.ts         # Authoritative business reports
│   ├── components/               # Atomic reusable UI components
│   │   ├── Badge.tsx             # StatusBadge and CategoryBadge
│   │   ├── StatCard.tsx          # Reusable operational KPI cards
│   │   ├── Modal.tsx             # Accessible dialogs with ESC & backdrop
│   │   ├── Pagination.tsx        # Server-side pagination controls
│   │   ├── SearchBar.tsx         # Debounced search bar with clear button
│   │   ├── Sidebar.tsx           # Multi-section responsive navigation with RBAC
│   │   ├── Header.tsx            # Center selector, shift toggle, date picker
│   │   └── DashboardLayout.tsx   # Core application layout shell
│   ├── context/
│   │   ├── AuthContext.tsx       # Auth session & multi-center state
│   │   └── ToastContext.tsx      # Global alert notifications
│   └── features/                 # Modular functional screens
│       ├── auth/LoginPage.tsx
│       ├── dashboard/OperationalDashboard.tsx
│       ├── customers/CustomerManagement.tsx
│       ├── collections/MilkCollectionModule.tsx
│       ├── rates/RateManagementModule.tsx
│       ├── accounting/AccountingBillingModule.tsx
│       ├── feed/FeedManagementModule.tsx (P14 Preserved)
│       ├── employees/EmployeeManagementModule.tsx (P16 Preserved)
│       ├── devices/DeviceSyncModule.tsx
│       ├── reports/ReportsAnalyticsModule.tsx
│       └── settings/SettingsModule.tsx
└── tests/
    └── admin-web.test.js         # Frontend unit & component test suite
```

---

## 4. Development & Build Commands

### Compiling TypeScript:
```bash
npm run build --workspace=@dfarm/admin-web
```

### Running Frontend Tests:
```bash
npm test --workspace=@dfarm/admin-web
```

### Running Complete Backend Integration Tests:
```bash
npm test --workspace=@dfarm/backend
```

---

## 5. Security & Privacy Invariants
1. **Biometric Privacy Shield**: Raw face biometric embedding vectors (e.g. 192-d or 512-d float arrays) are never exposed to browser bundles or DOM state. Only metadata (`isEnrolled`, `modelCode`, `qualityScorePassed`) is surfaced.
2. **Authoritative Backend Pricing**: All rates and milk amounts are calculated and validated strictly server-side. The frontend simulator calls `/api/v1/rates/calculate` and never duplicates pricing algorithms locally.
3. **Double-Entry Financial Immutability**: Historical finalized bills, settled payouts, and published rate versions cannot be edited in the browser. Corrections require supervisor adjustment endpoints with mandatory audit reasons.
