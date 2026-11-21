# MANUAL MILK ENTRY REQUEST DATA LINEAGE & LAYER TRACE

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** `POST /api/v1/collections/transactions`  
**Execution Context:** End-to-end request tracing across UI, API, Domain, and Database layers

---

## 1. Complete Request Data Lineage Diagram

```
[ Collection App UI: Single-Screen Kiosk Counter ]
      │
      ├─ 1. Operator opens Collection App (Port 5175)
      ├─ 2. AuthContext provides authenticated operator JWT & dairy context
      ├─ 3. HardwareContext initializes: polls GET /collections/sessions/active
      ├─ 4. Operator selects farmer via CustomerIdentityPanel (Direct Code or Manual Search F2)
      ├─ 5. MeasurementPanel updates weightLiters, fat, snf, clrDensity
      ├─ 6. TransactionSummaryPanel calculates price via ratesApi (Client Mirror)
      ├─ 7. Operator clicks "Save Transaction" (or presses Ctrl+Enter)
      │
      ▼
[ Frontend Submit Handler & API Client ]
      │ File: apps/dfarm-collection-app/src/components/workspace/TransactionSummaryPanel.tsx
      │ File: apps/dfarm-collection-app/src/api/client.ts
      │ Generates: idempotencyKey = "TXN-" + crypto.randomUUID()
      │ Assembles Payload: { sessionId, sessionCode, customerId, milkCategory, weightLiters, fatPercentage, ... }
      │ HTTP POST http://localhost:5175/api/v1/collections/transactions
      │
      ▼
[ Vite Dev Server Reverse Proxy ]
      │ File: apps/dfarm-collection-app/vite.config.ts
      │ Match: '/api' -> target: 'http://localhost:4000', changeOrigin: true
      │ Forwarded to Node.js Backend API on Port 4000
      │
      ▼
[ Express Router & Authentication ]
      │ Route: POST /api/v1/collections/transactions
      │ Middleware: authenticate (extracts operator token, validates HMAC signature, sets req.user)
      │ Resolves: req.user = { userId, organizationId, centerId, role }
      │
      ▼
[ Collection Controller: handleIntakeTransaction ]
      │ File: services/backend/src/presentation/routes/collections.routes.ts
      │ Validates customer exists via customerRepo.findById(body.customerId, orgId)
      │ Enforces cross-dairy collection isolation: customer.organizationId === req.user.organizationId
      │ Dispatches to ProcessMilkIntakeUseCase.execute(dto)
      │
      ▼
[ Application Layer: ProcessMilkIntakeUseCase ]
      │ File: services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts
      │ 1. Idempotency Check: transactionRepo.findByIdempotencyKey(key)
      │ 2. Domain Value Object Validation: MilkWeight, FatPercentage, SnfPercentage
      │ 3. Customer Delivery Eligibility: customer.validateCanDeliver(category)
      │ 4. Active Session Verification:
      │    - sessionRepo.findByCode(dto.sessionCode, orgId)
      │    - sessionRepo.findActiveSession(customer.centerId, deviceId, orgId)
      │    - If (!session || !session.isOpen) => THROW SessionClosedError (HTTP 409)
      │ 5. Authoritative Pricing: financialPolicyResolutionService.calculateAuthoritativePrice()
      │ 6. Instantiate MilkCollectionTransaction Entity
      │ 7. Atomic Repository Persistence: transactionRepo.save(transaction)
      │ 8. Update Session Cumulative Totals: sessionRepo.save(session)
      │ 9. Post Double-Entry Ledger Credit: ledgerRepo.save(ledger, ledgerEntry)
      │
      ▼
[ Tenant Database Persistence: PostgresCollectionTransactionRepository ]
      │ File: services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts
      │ Target: dfarm_tenant_<code_hash> (Isolated PostgreSQL Tenant Database)
      │ Atomic Transaction:
      │   a. Upsert collection_shifts (center_id, shift_type)
      │   b. Insert collection_sessions (individual intake session with operator_id, device_id)
      │   c. Insert milk_collections (transaction record with unique idempotency_key)
      │   d. Update kiosk_shift_sessions (cumulative total_liters, cow_liters, buffalo_liters, total_amount)
      │
      ▼
[ Response & Kiosk App UI Update ]
      │ Returns: HTTP 201 Created { success: true, data: txn, receiptNumber, customerBalanceAfter }
      │ Frontend catches success: resets intake cycle, triggers voice announcer, prints thermal receipt, refreshes journal
```

---

## 2. Lineage Integrity Findings

1. **Frontend Disconnect in Identification Method:**
   - In `CollectionWorkspace.tsx`, the operator's manual selection was correctly determined as `effectiveMethod = 'MANUAL_ENTRY'` or `'DIRECT_CODE_ENTRY'`.
   - However, `effectiveMethod` was not passed down to `TransactionSummaryPanel.tsx`, which hardcoded `'FACE_YUNET_SFACE'`.
   - In the database repository, this caused manual entries to be recorded as `FACE` in `collection_sessions` rather than `SUPERVISOR_MANUAL`.

2. **Session Identification Gaps:**
   - In `TransactionSummaryPanel.tsx`, if `activeSession` was `null`, the component defaulted to `'session-current-001'`.
   - In `MilkIntakeUseCases.ts`, session verification looked up sessions by `sessionCode`, but if only `sessionId` was provided, it searched by `customer.centerId` rather than looking up the session by its primary key `id`.
   - If the customer was registered at Center B but delivered at Center A, `findActiveSession` by `customer.centerId` failed, throwing `SessionClosedError` (HTTP 409).
