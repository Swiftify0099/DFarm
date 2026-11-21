# COLLECTION APP REGRESSION TEST REPORT

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** Regression Testing Across Full Verification Suites  
**Execution Context:** Automated test runners across backend and frontend workspaces

---

## 1. Backend Production Verification Suite

**Command:** `node --test services/backend/tests/collection-kiosk-production.test.js`  
**Duration:** 11.7s  
**Results:** **24 passed, 0 failed, 0 skipped**

| Test Group | Scenarios | Status |
| :--- | :--- | :--- |
| **GROUP A: Shift Session Integration** | 1. Open shift session via POST `/api/v1/collections/sessions/open`<br>2. Retrieve active session via GET `/api/v1/collections/sessions/active`<br>3. Prevent concurrent open sessions on same counter kiosk | **PASS** |
| **GROUP B: Farmer Identification** | 4. Face recognition matching with OpenCV SFace cosine similarity<br>5. Hardware RFID reader lookup<br>6. Manual patron directory search | **PASS** |
| **GROUP C: Quality & Telemetry** | 7. Real-time rate calculation<br>8. Reject invalid biological Fat/SNF limits<br>9. Reject zero or negative weight | **PASS** |
| **GROUP D: Milk Intake Transactions** | 10. Atomic online intake transaction<br>11. Deduplication on identical idempotency key replay<br>12. Multi-dairy customer isolation enforcement<br>13. Offline transaction batch sync | **PASS** |
| **GROUP E: Session Closure & Conflict** | 14. Kiosk reconciles and closes session via POST `/sessions/:id/close`<br>15. Intake against closed session is rejected with **409 Conflict** | **PASS** |
| **GROUP F: Ledger & Accounting** | 16. Double-entry subledger contains both online and offline MILK_CREDIT entries<br>17. Verified zero Razorpay interactions in milk collection | **PASS** |

---

## 2. Frontend Vitest Verification Suite

**Command:** `npm run test --workspace=apps/dfarm-collection-app`  
**Duration:** 25.6s  
**Results:** **9 test files passed (100%), 48 tests passed, 0 failed**

| Test File | Tests Passed | Status |
| :--- | :--- | :--- |
| `src/test/voice-announcer.test.ts` | 4 / 4 | **PASS** |
| `src/test/rate-calculation.test.ts` | 3 / 3 | **PASS** |
| `src/test/collection-transaction.test.ts` | 5 / 5 | **PASS** |
| `src/test/offline-queue.test.ts` | 3 / 3 | **PASS** |
| `src/test/multi-dairy-isolation.test.ts` | 3 / 3 | **PASS** |
| `src/test/single-screen-kiosk.test.ts` | 8 / 8 | **PASS** |
| `src/test/auth.test.ts` | 4 / 4 | **PASS** |
| `src/test/dairy-face-matcher.test.ts` | 8 / 8 | **PASS** |
| `src/test/hardware-drivers.test.ts` | 10 / 10 | **PASS** |

---

## 3. Regression Verdict

Zero regressions detected across all test suites. All existing functionality—including RFID lookups, OpenCV face recognition, offline queue synchronization, thermal receipt printing, voice announcements, and rate calculations—remains 100% operational.
