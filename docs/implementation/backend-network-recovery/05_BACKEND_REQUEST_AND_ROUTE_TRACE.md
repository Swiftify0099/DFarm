# DFarm — Priority 0: Backend Request and Route Trace

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `05_BACKEND_REQUEST_AND_ROUTE_TRACE.md`  
**Timestamp:** 2026-11-19T13:32:30+05:30  
**Trace Status:** VERIFIED END-TO-END  

---

## 1. Complete Request Flow Diagram

```
[ Frontend Component ]
         │
         ▼
[ API Client (api-client.ts) ] ── (Injects Bearer Token & X-Dairy-Id)
         │
         ▼
[ HTTP / Network Layer ]
         │
         ▼ (OPTIONS Preflight: 204 No Content with X-Dairy-Id permitted)
         │
         ▼
[ Express Server Entry (server.ts / app.ts) ]
         │
         ├─► Helmet (crossOriginResourcePolicy)
         ├─► CORS Middleware (corsOptions validated)
         ├─► Express JSON Body Parser (10MB limit)
         ├─► Request Context Middleware (X-Request-Id generated / attached)
         ├─► Rate Limiter (/api/v1 routes)
         │
         ▼
[ Clean Architecture Primary Router (cleanApiRouter) ]
         │
         ├─► /api/v1/auth (auth.routes.ts)
         ├─► /api/v1/dashboard (dashboard.routes.ts)
         ├─► /api/v1/customers (customers.routes.ts)
         ├─► /api/v1/collections (collections.routes.ts)
         ├─► /api/v1/dairies (dairies.routes.ts)
         ├─► /api/v1/super-admin (super-admin.routes.ts)
         │
         ▼
[ Middleware Pipeline ]
         │
         ├─► authenticate (HMAC-SHA256 JWT Token Verification)
         ├─► requireTenantContext (Tenant database resolution & mapping)
         │
         ▼
[ Controller / Use Case (Application Layer) ]
         │
         ▼
[ Repository / Database (Infrastructure Layer) ]
         │
         ▼
[ HTTP 200 / 201 Response ]
```

---

## 2. Route Registration Audit

| Endpoint | Method | Middleware Stack | Use Case / Handler | Application Client |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/auth/admin/otp/request` | `POST` | `otpRequestLimiter` | `RequestAdminOtpUseCase` | Dairy Admin, Super Admin |
| `/api/v1/auth/admin/otp/verify` | `POST` | `otpVerifyLimiter` | `VerifyAdminOtpUseCase` | Dairy Admin, Super Admin |
| `/api/v1/auth/request-otp` | `POST` | `otpRequestLimiter` | `RequestCustomerOtpUseCase` | Customer App |
| `/api/v1/auth/verify-otp` | `POST` | `otpVerifyLimiter` | `VerifyCustomerOtpUseCase` | Customer App |
| `/api/v1/auth/operator/otp/request` | `POST` | `otpRequestLimiter` | `RequestOperatorOtpUseCase` | Collection Terminal |
| `/api/v1/auth/operator/otp/verify` | `POST` | `otpVerifyLimiter` | `VerifyOperatorOtpUseCase` | Collection Terminal |
| `/api/v1/dashboard/summary` | `GET` | `authenticate`, `requireTenantContext` | `GetDashboardSummaryUseCase` | Dairy Admin |
| `/api/v1/dairies/nearby` | `GET` | None (Public) | `GetNearbyDairiesUseCase` | Customer App |
| `/api/v1/customers/memberships` | `GET` | `optionalAuthenticate` | `GetCustomerMembershipsUseCase` | Customer App |
| `/api/v1/super-admin/dashboard/metrics` | `GET` | `authenticate`, `requireSuperAdmin` | `GetSuperAdminMetricsUseCase` | Super Admin |

All endpoints were traced from caller client files to Express router mounts. No route shadowing or misnamed paths were found.
