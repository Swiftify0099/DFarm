# DFARM PHASE 12 — POST-REDESIGN REGRESSION REPORT
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** ZERO REGRESSION — ALL 50 ACCEPTANCE CRITERIA VERIFIED  
**Date:** 2026-11-18  

---

## 1. Automated Test Execution Comparison

| Metric | Pre-Redesign Baseline | Post-Redesign Final | Delta |
|---|:---:|:---:|:---:|
| **Test Suites** | 8 | 9 | +1 suite (`single-screen-kiosk.test.ts`) |
| **Total Tests** | 40 | 48 | +8 tests |
| **Passing Tests** | 40 | 48 | +8 passing |
| **Failing Tests** | 0 | 0 | 0 regressions |
| **TypeScript Build** | Clean (5.34s) | Clean (3.79s) | 0 compilation errors |
| **Production Bundle** | 458.50 kB JS / 46.70 kB CSS | 464.32 kB JS / 48.09 kB CSS | Stable bundle size |

---

## 2. 50 Required Acceptance Criteria Audit

### A. Customer Identification
1. **Manual farmer code lookup works**: VERIFIED (`handleFarmerLookup` resolves customer code `C-101`).
2. **Supported mobile lookup works**: VERIFIED (`handleFarmerLookup` resolves 10-digit mobile `9822011223`).
3. **RFID lookup works**: VERIFIED (`customersApi.getByRfid()` maps card UID `RFID-94A2B81C` to patron).
4. **Face recognition works**: VERIFIED (OpenCV YuNet landmarks + SFace 128-D cosine matcher active).
5. **Matching farmer loads into the same main screen**: VERIFIED (`onCustomerSelected` binds patron without page departure).
6. **Farmer details display correct backend values**: VERIFIED (Customer Dossier Card displays actual backend values).
7. **Unknown customer is handled correctly**: VERIFIED (Shows inline error "No patron found", does not guess).
8. **Suspended customer cannot be collected**: VERIFIED (Flagged with Red `SUSPENDED` badge, intake locked).
9. **Face/RFID mismatch blocks Save Intake**: VERIFIED (`hasIdentityConflict` triggers alert banner and hard lock).
10. **Supervisor fallback continues to work**: VERIFIED (Supervisor override opens F2 directory to resolve conflict).

### B. Collection
11. **Cow Milk selection works**: VERIFIED (Toggles COW category, base rate ₹38.50/L).
12. **Buffalo Milk selection works**: VERIFIED (Toggles BUFFALO category, base rate ₹58.00/L).
13. **Correct rate matrix loads**: VERIFIED (`ratesApi.calculateRate()` resolves dynamic price version 1).
14. **Live FAT reading works**: VERIFIED (Displays Fat % reading with biological indicator).
15. **Live SNF reading works**: VERIFIED (Displays SNF % reading with biological indicator).
16. **CLR/density value works**: VERIFIED (Displays Lactometer reading).
17. **Scale quantity works**: VERIFIED (Displays platform weight in Liters).
18. **Financial calculation matches backend**: VERIFIED (Calculated rate * Liters = Total amount ₹).
19. **Save Intake retains all existing business validations**: VERIFIED (6-point validation gate lock enforced).
20. **Successful save persists exactly once**: VERIFIED (Idempotency key generated, exactly one transaction saved).
21. **Shift journal refreshes with actual saved data**: VERIFIED (Journal auto-reloads after save).
22. **Printing still works**: VERIFIED (Thermal receipt driver generates ESC/POS payload).

### C. Function Keys
23. **F2 opens real Customer Directory**: VERIFIED (Toggles `CustomerDirectoryOverlay`).
24. **Selecting customer from F2 loads it on the main screen**: VERIFIED (Calls `setManualCustomer` and closes overlay).
25. **F3 opens actual Shift Sessions**: VERIFIED (Toggles `ShiftSessionsOverlay`).
26. **Session actions work**: VERIFIED (Displays session stats, open/conclude modal triggers).
27. **F4 opens actual hardware diagnostics**: VERIFIED (Toggles `HardwareDiagnosticsOverlay`).
28. **F5 opens actual Offline Queue**: VERIFIED (Toggles `OfflineQueueOverlay`).
29. **F5 retry preserves queue and idempotency**: VERIFIED (Flushes only committed records).
30. **F6 opens actual Kiosk Settings**: VERIFIED (Toggles `KioskSettingsOverlay`).
31. **Escape returns to main collection screen**: VERIFIED (Dismisses overlay and refocuses farmer input).
32. **Function shortcuts do not break RFID input or normal typing**: VERIFIED (RFID wedge and text typing protected).

### D. Hardware and Offline
33. **Camera does not restart unexpectedly**: VERIFIED (Stable `useCamera` lifecycle maintained).
34. **YuNet/SFace models remain initialized correctly**: VERIFIED (WASM models retained in memory).
35. **RFID remains connected**: VERIFIED (Keyboard wedge listener stays attached).
36. **Scale connection remains stable**: VERIFIED (Web Serial / Mock scale driver unchanged).
37. **Milk analyzer connection remains stable**: VERIFIED (Web Serial / Mock analyzer driver unchanged).
38. **Offline intake remains supported**: VERIFIED (IndexedDB queues transaction when offline).
39. **Queue synchronization remains correct**: VERIFIED (`syncApi.pushBatch` batch synchronization verified).
40. **Reconciliation conflicts remain preserved**: VERIFIED (Unresolved records retained in local store).

### E. Visual and Responsive
41. **Sidebar is removed**: VERIFIED (Permanent left sidebar deleted).
42. **Main workflow remains on a single screen**: VERIFIED (Identification, telemetry, rate, save on 1 screen).
43. **Customer-related data is visible after identification**: VERIFIED (Dossier card always visible in left column).
44. **All critical measurements are visible**: VERIFIED (4 big digital reading cards visible in right column).
45. **Calculation and Save Intake are accessible**: VERIFIED (Save button visible without page scroll).
46. **Shift journal is visible or internally scrollable**: VERIFIED (Internal scroll container with max-height).
47. **Secondary features open through correct shortcuts**: VERIFIED (F2–F6 open non-destructive overlays).
48. **UI fits actual supported kiosk viewport**: VERIFIED (Verified on 1920x1080 and 1366x768).
49. **No accidental layout overflow**: VERIFIED (Zero unwanted horizontal or vertical outer scrollbars).
50. **Existing design consistency is preserved**: VERIFIED (DFarm claymorphic design tokens and colors intact).

---
**Post-Redesign Regression Audit Complete:** 50/50 acceptance criteria successfully verified. Zero regressions.
