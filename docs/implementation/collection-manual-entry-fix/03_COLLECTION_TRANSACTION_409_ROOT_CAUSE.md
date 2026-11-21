# COLLECTION TRANSACTION HTTP 409 CONFLICT ROOT CAUSE ANALYSIS

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** `POST /api/v1/collections/transactions` returning `409 Conflict`  
**Execution Context:** Root cause determination across frontend kiosk app and backend repositories

---

## 1. Executive Identification of Root Cause

The `HTTP 409 Conflict` error encountered when saving manual milk collection transactions is triggered by a combination of two root defects:

1. **Primary Defect (Tenant Database Shift Session Foreign Key Failure):**
   When `GetActiveShiftSessionUseCase` auto-opened a session for the counter kiosk, `PostgresShiftSessionRepository.save` attempted to persist the session into the tenant's isolated database. The insert into `kiosk_shift_sessions` failed with a Foreign Key Violation (`kiosk_shift_sessions_organization_id_fk`, `center_id`, and `users`), because the tenant database did not contain the prerequisite organization, center, and user records.
   In `PostgresShiftSessionRepository.ts` line 181, the save method silently caught and swallowed the error in non-production:
   ```ts
   } catch (err: any) {
     if (process.env['NODE_ENV'] === 'production') throw err;
   }
   ```
   Because the record was never written to `kiosk_shift_sessions`, subsequent queries by `findByCode` or `findActiveSession` returned `null`. `ProcessMilkIntakeUseCase.execute` checked `if (!session || !session.isOpen)` and threw `SessionClosedError`, which `cleanErrorHandler` mapped to **HTTP 409 Conflict**.

2. **Secondary Defect (Frontend Premature Submission Gate):**
   In `apps/dfarm-collection-app/src/components/workspace/TransactionSummaryPanel.tsx`, the submission lock check was:
   ```tsx
   if (activeSession && activeSession.status === 'CLOSED') {
     canSubmit = false
     lockReason = 'Current shift session is CLOSED. Open an active session to accept milk intake.'
   }
   ```
   If `activeSession` was `null` (uninitialized or failed to fetch), `canSubmit` remained `true`! The operator was permitted to click "Save Transaction".
   The submit handler then defaulted to a dummy fallback:
   ```tsx
   sessionId: activeSession?.id || 'session-current-001',
   sessionCode: activeSession?.sessionCode,
   ```
   The backend received `sessionId: 'session-current-001'` (and `sessionCode: undefined`). When searching the database for an active session, no session matching `session-current-001` or `customer.centerId` existed, throwing `SessionClosedError('session-current-001')` -> **HTTP 409 Conflict**.

3. **Tertiary Defect (Missing `findById` in Shift Session Repository):**
   In `ProcessMilkIntakeUseCase.execute`:
   ```ts
   let session = dto.sessionCode ? await this.sessionRepo.findByCode(dto.sessionCode, orgId) : null;
   if (!session && dto.sessionId) {
     session = await this.sessionRepo.findActiveSession(customer.centerId, dto.deviceId || 'KIOSK_MAIN', orgId);
   }
   ```
   When `dto.sessionId` was provided as a UUID, the use case never performed a primary key lookup (`sessionRepo.findById(dto.sessionId, orgId)`). Instead, it queried by `customer.centerId`. If the customer was registered under a different center than the active kiosk session center, the query returned `null` and threw `SessionClosedError` (HTTP 409).

---

## 2. Evidence from Reproduction

When executing the insert query directly against the tenant database:
```
ERROR ON TENANT DB:
QueryError: insert or update on table "organizations" violates foreign key constraint on table "kiosk_shift_sessions_organization_id_fk"
* Failed SQL statement:
  INSERT INTO kiosk_shift_sessions (id, session_code, organization_id, center_id, ...)
```

When ensuring the organization, center, and user existed in the tenant database prior to insert, the query succeeded:
```
Testing query on tenant DB with prerequisites guaranteed...
SUCCESS on tenant DB!
Verified from repo by code: SH-TEST-001
Intake transaction SUCCESS:
- Txn ID: 7f610279-ab93-4294-ac87-659fee3116fe
- Total Amount: 516.13
- Rate/L: 41.29
- Receipt: RCP-7F610279
- Balance after: 516.13
```

---

## 3. Required Remediation Architecture

1. **Frontend Gate Hardening:**
   - In `TransactionSummaryPanel.tsx`, disallow submission if `!activeSession` or `activeSession.status === 'CLOSED'`.
   - Pass `effectiveMethod` from `CollectionWorkspace.tsx` to `TransactionSummaryPanel.tsx` and map manual collection as `SUPERVISOR_MANUAL` (or `MANUAL_ENTRY`).
   - In `apps/dfarm-collection-app/src/api/client.ts`, fix error parsing to extract `errJson.error?.message || errJson.message || errJson.error`.

2. **Backend Repository Self-Healing & Invariants:**
   - In `PostgresShiftSessionRepository.save`, guarantee that `organizations`, `dairy_centers`, and `users` (operator) exist in the tenant database before executing the upsert, preventing FK violations.
   - Implement `findById(sessionId: string, organizationId?: string)` on `IShiftSessionRepository` and `PostgresShiftSessionRepository`.
   - In `MilkIntakeUseCases.ts`, if `dto.sessionId` is provided and `sessionCode` lookup does not resolve, check `sessionRepo.findById(dto.sessionId, orgId)`.
   - In `PostgresCollectionTransactionRepository.save`, ensure operator user exists in `users` before inserting into `collection_sessions`.
   - In `PostgresLedgerRepository.findByCustomer`, accept `organizationId` and pass `customer.organizationId` from `MilkIntakeUseCases.ts`.
