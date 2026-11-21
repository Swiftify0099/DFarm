# DFARM — Step-by-Step Verification Guide

**Report Index:** `10_STEP_BY_STEP_VERIFICATION_GUIDE.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  

---

## 1. Prerequisites

1. Platform services running:
   - Platform Server / Proxy: Port 3000 (`scripts/dev-server.js`)
   - Backend API: Port 4000 (`dist/server.js`)
   - Dairy Admin Portal: Port 5174 (`apps/dfarm-dairy-admin`)
   - Collection App Kiosk: Port 5175 (`apps/dfarm-collection-app`)
   - Customer App Metro: Port 8081 (`apps/dfarm-customer-app`)

---

## 2. Test Step 1: Customer Face Biometric Enrollment

1. Launch Customer App on device or browser emulator (`http://localhost:8081`).
2. Log in with approved farmer credentials.
3. On the Home Dashboard, notice the amber banner: **"Face Biometrics Not Enrolled / चेहरा नोंदणी अपूर्ण"**.
4. Tap **"Enroll Face Biometrics Now (५ नमुने) →"**.
5. Grant camera permission. Align face inside the oval reticle.
6. Tap **"Capture & Update Template"**.
7. Observe the progress bar advancing smoothly across 5 quality-checked samples ($20\% \rightarrow 40\% \rightarrow 60\% \rightarrow 80\% \rightarrow 100\%$).
8. Observe the green confirmation badge: **"Biometric Template Updated!"**.

---

## 3. Test Step 2: Customer App "Test Face" Verification

1. In Customer App, navigate to **Profile → Test My Face** or tap **"Test Face"** from top navigation bar.
2. Tap **"Run Diagnostics Test"**.
3. View the live telemetry card. Confirm the top Discrete Status Banner displays:
   - `✅ FACE MATCHED (चेहरा ओळखला)`
   - Farmer Name (e.g., `Santosh Popat Patil`)
   - Farmer Code (e.g., `C-201`)
   - Cosine Similarity Score (e.g., `98.5%`, well above `36.3%`).

---

## 4. Test Step 3: Collection Kiosk Recognition

1. Open Milk Collection Kiosk at `http://localhost:5175`.
2. Ensure shift session is open.
3. In the Customer Identity Panel, click **"Start Camera"**.
4. Stand in front of camera or present enrolled farmer portrait.
5. Verify reticle immediately turns green (`#10B981`) with label `MATCHED (98%)`.
6. Confirm voice announcer speaks: `"नमस्कार [नाव], ओळख पटली"`.
7. Verify farmer code (`C-201`) automatically populates the collection intake form.
8. Present an unregistered person; verify the reticle highlights red with `UNKNOWN PERSON` without crashing or freezing.
