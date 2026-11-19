# DFarm Ecosystem — Route and API Mount Audit Report

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY  
**Verification Method:** Express Router Introspection & Path Mapping

---

## 1. Route Mount Hierarchy

The DFarm backend mounts all versioned endpoints under `/api/v1` with isolated sub-routers:

```
/api/v1
  ├── /health             -> healthRouter (Central Pool & Tenant Status)
  ├── /auth               -> authRoutes (Operator, Customer, Admin OTP & JWT)
  ├── /customers          -> customerRoutes (KYC, Memberships, Face, RFID)
  ├── /sessions           -> sessionRoutes (Shift Session Open, Close, Summary)
  ├── /collections        -> collectionRoutes (Milk Intake, Live Stream, Quality)
  ├── /rate-charts        -> rateChartRoutes (Grid Matrix, Formula, Slabs)
  ├── /ledger             -> ledgerRoutes (Double-Entry Subledger, Passbook)
  ├── /billing            -> billingRoutes (10-Day Cycles, Payout Batches)
  ├── /sync               -> syncRoutes (Offline Push/Pull, Devices, Status)
  └── /super-admin        -> superAdminRoutes (Dairies, Hardware, AMC, Audit)
```

---

## 2. Route Shadowing & Duplicate Registration Audit

| Potential Collision | Inspect Path | Result | Status |
|---|---|---|---|
| `POST /api/v1/sync/push` vs `POST /api/v1/sync/transactions` | `services/backend/src/presentation/routes/sync.routes.ts` | Both paths mapped to `handleSyncBatch` | RESOLVED |
| `POST /api/v1/auth/logout` | `services/backend/src/presentation/routes/auth.routes.ts` | Missing route previously returning 404 | ADDED & VERIFIED |
| `POST /api/v1/customers/register` | `customer.routes.ts` | Single canonical registration controller | VERIFIED |
| `GET /api/v1/health` vs `GET /health` | Express root vs API root | Both mounted for orchestrator load balancers | VERIFIED |

---

## 3. Middleware Pipeline Verification

Every incoming HTTP request traverses the hardened pipeline in strict order:
1. `helmet`: Security headers & content security policy.
2. `cors`: Validated origin and allowed custom headers (`X-Dairy-Id`, `X-Client-App`, etc.).
3. `express.json({ limit: '10mb' })`: Payload parsing with size guardrails.
4. `pino-http`: Structured JSON access logging with correlation ID (`X-Request-Id`).
5. `rateLimit`: IP-level brute force protection for OTP endpoints.
6. `authenticate`: HMAC-SHA256 JWT signature verification and tenant resolution.
7. `authorize`: Role-Based Access Control (RBAC) permission check.
8. Controller Execution: Domain use case invocation within PostgreSQL transaction boundary.
9. Global Error Middleware: Standardized error formatting without exposing stack traces.
