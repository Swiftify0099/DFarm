# DFarm Milk Collection & Accounting Testing Strategy

## 1. Overview
The testing architecture for DFarm Phase 10 ensures 100% verification of all functional requirements, security boundaries, biological sanity checks, exact rate lookups, subledger postings, and offline recovery flows.

---

## 2. Test Execution Architecture

### 2.1 Android Unit Test Suite (`apps/collection-app`)
Location: `apps/collection-app/app/src/test/java/com/dfarm/collection/`
- `CollectionStateMachineTest.kt`: Tests 16-state transitions, invalid state transition guards, single-category auto-selection (`COW`, `BUFFALO`), and safe session cancellation.
- `CustomerIdentificationTest.kt`: Verifies three-method cascade (Face $\rightarrow$ RFID $\rightarrow$ Manual PIN), canonical UUID resolution, and 72-hour offline authorization expiry.
- `MeasurementValidationTest.kt`: Validates biological ranges for fat %, SNF %, positive weight, and customer milk category consistency.
- `RateCalculationEngineTest.kt`: Validates exact cell matching against rate charts and throws controlled `RateCellNotFoundException` for missing cells.
- `ReceiptFormatterTest.kt`: Validates 40-column monospace slip format, privacy customer masking, and SHA-256 verification hash.
- `OfflineSyncQueueTest.kt`: Verifies offline queuing, max retry limits, and app restart session recovery.

**Execution Command:**
```powershell
cd apps/collection-app
./gradlew.bat test --no-daemon
```
**Result:** 24 actionable tasks executed, 100% unit tests passing.

---

### 2.2 Backend Integration Test Suite (`collection-workflow.test.js`)
Location: `services/backend/tests/collection-workflow.test.js`
Contains comprehensive integration tests covering all 36 required business scenarios:

| # | Test Scenario Description | Result |
| :--- | :--- | :--- |
| **0** | Setup Test Organization, Center, Settings, Users, Rates & Customers | **PASS** |
| **1** | Face identification resolves to canonical customer UUID | **PASS** |
| **2** | RFID identification resolves to canonical customer UUID | **PASS** |
| **3** | Supervisor manual identification resolves to canonical customer UUID | **PASS** |
| **4** | Inactive customer collection rejected | **PASS** |
| **5** | Suspended customer collection rejected | **PASS** |
| **6** | Customer center mismatch rejected | **PASS** |
| **7** | Unauthorized milk category rejected | **PASS** |
| **8** | Single category (Cow) auto-selection creates session | **PASS** |
| **9** | Single category (Buffalo) auto-selection creates session | **PASS** |
| **10** | Dual category authorization allows explicit category selection | **PASS** |
| **11** | Category change requires safe session cancellation | **PASS** |
| **12** | Valid weight reading accepted | **PASS** |
| **13** | Zero or negative weight rejected | **PASS** |
| **14** | Valid Fat/SNF quality measurements accepted | **PASS** |
| **15** | Fat out of biological bounds rejected | **PASS** |
| **16** | SNF out of biological bounds rejected | **PASS** |
| **17** | Rate chart calculation matches configured cell | **PASS** |
| **18** | Missing rate cell returns controlled pricing error | **PASS** |
| **19** | Historical rate version respected without retroactive recalculation | **PASS** |
| **20** | Duplicate session prevented for same customer while session open | **PASS** |
| **21** | Session timeout marks abandoned session as INCOMPLETE | **PASS** |
| **22** | Late arriving measurement rejected on completed session | **PASS** |
| **23** | Cross-session measurement association rejected | **PASS** |
| **24** | Atomic collection commit creates intake and updates ledger | **PASS** |
| **25** | Balanced double-entry journal created on completion | **PASS** |
| **26** | Idempotency prevents duplicate delivery submission | **PASS** |
| **27** | Multiple deliveries by same farmer in same shift receive distinct intakes | **PASS** |
| **28** | Receipt generated with valid SHA-256 hash | **PASS** |
| **29** | Shift summary matches aggregate intake numbers | **PASS** |
| **30** | Supervisor reversal posts debit to subledger with audit log | **PASS** |
| **31** | Local offline transaction persistence accepted through sync push | **PASS** |
| **32** | Network interruption during sync queues events and advances cursor | **PASS** |
| **33** | Duplicate sync event idempotency rejects re-pushing same event | **PASS** |
| **34** | Pending sync status visibility reports device sync health | **PASS** |
| **35** | Offline authorization expiry enforcement rejects sync when limit exceeded | **PASS** |
| **36** | Tablet restart during active session recovery fetches active session | **PASS** |
| **37** | Verification: Shift Summary and 40-Column Receipt Endpoints | **PASS** |

**Execution Command:**
```powershell
node --test services/backend/tests/collection-workflow.test.js
```
**Result:** 39 tests executed, 39 passed, 0 failed (duration: 36.9s).

---

### 2.3 System-Wide Regression Test Suites
- Customer Lifecycle & Auth (`npm --prefix services/backend test`): 39 passed, 0 failed.
- Customer Identification & RFID (`identification-phase08.test.js`): 23 passed, 0 failed.
- Sync Engine (`sync-engine.test.js`): 11 passed, 0 failed.
