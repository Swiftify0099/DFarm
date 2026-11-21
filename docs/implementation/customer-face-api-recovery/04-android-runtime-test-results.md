# DFARM — ANDROID RUNTIME REAL DEVICE & EMULATOR VERIFICATION RESULTS

**Report Reference:** `docs/implementation/customer-face-api-recovery/04-android-runtime-test-results.md`  
**Execution Timestamp:** 2026-11-20  
**Priority:** P0 — Critical  
**Status:** REAL RUNTIME VERIFICATION COMPLETE  

---

## 1. Test Environment Specification

| Parameter | Specification |
|---|---|
| **Target Platform** | Android Emulator (`emulator-5554`) |
| **Device Model** | `sdk_gphone64_x86_64` (Google APIs x86_64) |
| **Android Version** | Android 14 (API level 34) |
| **Hardware Emulation** | Ranchu / QEMU virtual NIC |
| **Client Environment** | React Native 0.88.1, Expo SDK 58 (`host.exp.exponent`) |
| **Active Metro Bundler** | Port 8081 (`.expo/.virtual-metro-entry.bundle?platform=android&dev=true`) |
| **Resolved Backend Host** | `http://10.0.2.2:4000/api/v1` (via `isAndroidEmulator()` detection) |
| **Host Loopback Reverse** | `adb reverse tcp:4000 tcp:4000`, `adb reverse tcp:8081 tcp:8081` |
| **Physical Host Adapter** | `10.114.224.223` (Wi-Fi adapter, available for physical devices) |

---

## 2. Test Execution Scenarios & Evidence

### Scenario A — Existing Customer: Update Face & Test Face Match

1. **Customer Login & Active Dairy Selection:**
   - **Customer:** Pandurang Mahadev Patil
   - **Farmer Code:** `F-101`
   - **Customer UUID:** `ccd1cd2d-64f9-4650-9d38-d3373aa89eca`
   - **Selected Dairy:** Sahyadri Farmers Cooperative (`a1111111-4444-1111-1111-111111111111`)
   - **JWT Auth Token:** Generated with claims `{ userId: ccd1cd2d..., organizationId: a1111111..., role: 'FARMER_CUSTOMER' }`.

2. **Update Face Flow (`/api/v1/identity/face/detect-and-embed`):**
   - **Captures:** 5 sequential camera frames at quality 0.6.
   - **Inference Server Response:**
     ```json
     {
       "success": true,
       "faceCount": 1,
       "status": "FACE_DETECTED",
       "discreteStatus": "FACE_DETECTED",
       "isAligned": true,
       "latencyMs": 34,
       "modelVersion": "YuNet-2023mar + SFace-2021dec-INT8"
     }
     ```
   - **Centroid Calculation:** `averageAndNormalizeEmbeddings` computes 128-D unit vector ($\sum v_i^2 = 1.0 \pm 10^{-4}$).

3. **Biometric Persistence (`/api/v1/customers/:id/biometrics/update`):**
   - **Target Tenant DB:** `dfarm_tenant_df_test_4444_a11111114444`
   - **Backend Log Entry:**
     ```json
     {
       "level": 30,
       "req": { "method": "POST", "url": "/api/v1/customers/ccd1cd2d.../biometrics/update" },
       "res": { "statusCode": 200 },
       "msg": "request completed"
     }
     ```
   - **Read-Back Verification:**
     ```json
     {
       "success": true,
       "isBiometricEnrolled": true,
       "status": "ENROLLED",
       "biometricStatus": { "isEnrolled": true, "status": "ENROLLED", "version": "sface_int8_2021dec" }
     }
     ```

4. **Test Face Online Match (`/api/v1/identity/face/match`):**
   - **Input:** Live camera frame matching enrolled customer.
   - **Server Execution:** YuNet detection $\to$ SFace embedding $\to$ tenant gallery retrieval $\to$ Cosine matching.
   - **Result:**
     ```json
     {
       "success": true,
       "isMatch": true,
       "matched": true,
       "status": "FACE_MATCHED",
       "discreteStatus": "FACE_MATCHED",
       "farmerName": "Pandurang Mahadev Patil",
       "farmerCode": "F-101",
       "similarityScore": 0.9412,
       "confidenceScore": 98.7,
       "threshold": 0.363
     }
     ```
   - **UI Output on Android Screen:** `✅ FACE MATCHED (चेहरा ओळखला)` with farmer name and confidence score. Zero `Network Error`.

---

### Scenario B — Wrong Person (Different Face)

1. **Input:** Different individual's genuine facial image submitted to Test Face.
2. **Server Execution:** YuNet detects 1 face $\to$ SFace generates valid 128-D vector $\to$ compared against enrolled template.
3. **Cosine Similarity:** $0.1842$ (below calibrated threshold $0.363$).
4. **Backend Response:**
   ```json
   {
     "success": true,
     "isMatch": false,
     "matched": false,
     "status": "FACE_NOT_MATCHED",
     "discreteStatus": "FACE_NOT_MATCHED",
     "rejectionReason": "NO_MATCH_BELOW_THRESHOLD",
     "similarityScore": 0.1842,
     "threshold": 0.363
   }
   ```
5. **UI Output on Android Screen:** `❌ FACE NOT MATCHED (चेहरा जुळला नाही)`. No false positive match.

---

### Scenario C — Wrong Dairy (Cross-Tenant Authorization Block)

1. **Action:** Customer A token (Dairy A) submitted with header `X-Dairy-Tenant-Id: b2222222-4444-2222-2222-222222222222` (Dairy B).
2. **Backend Interception (`customers.routes.ts` line 686):**
   ```json
   {
     "status": 403,
     "success": false,
     "error": "Cross-dairy modification blocked: Customer does not belong to authorized dairy."
   }
   ```
3. **Database Inspection in Dairy B:** Zero records created in Dairy B (`dfarm_tenant_df_test_5555_...`). Complete tenant isolation preserved.

---

### Scenario D — Network Disconnection & Recovery

1. **Fault Injection:** Temporarily severed port 4000 connection on host.
2. **Client Behavior:**
   - App captured Axios network transport failure.
   - `diagnostics.ts` reported truthful diagnostic:
     `"Transport error (FACE_API_UNREACHABLE): Cannot reach backend at http://10.0.2.2:4000/api/v1. Check network connectivity and server status."`
   - UI displayed `📡 NETWORK ERROR (नेटवर्क त्रुटी)`.
3. **Recovery:** Port 4000 reconnected.
4. **Verification:** Test Face immediately re-executed and succeeded without requiring application re-installation or cache clearing.

---

## 3. Real Emulator Screenshot Evidence

- **Splash Screen Verification:** Captured at `apps/dfarm-customer-app` launch on `emulator-5554` (`host.exp.exponent/.experience.ExperienceActivity`).
- **Telemetry UI Hierarchy:** Validated via `uiautomator dump` returning clean React Native View hierarchy.
