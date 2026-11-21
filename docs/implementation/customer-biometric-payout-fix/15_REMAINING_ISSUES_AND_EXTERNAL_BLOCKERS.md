# DFARM — REMAINING ISSUES & EXTERNAL BLOCKERS REPORT

**Document Identifier:** `15_REMAINING_ISSUES_AND_EXTERNAL_BLOCKERS.md`  
**Execution Reference:** `DFARM-CUSTOMER-REGISTRATION-BIOMETRIC-PAYOUT-FIX`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Scope:** Honest assessment of third-party external dependencies, hardware gates, and production clearing-house prerequisites.

---

## 1. EXTERNAL CLEARING-HOUSE DEPENDENCY (BANK ACCOUNT PENNY-DROP)

### Context & Impact
* In the current implementation, bank accounts are validated syntactically via regex:
  - Account Number: 9–18 numeric digits.
  - IFSC Code: `/^[A-Z]{4}0[A-Z0-9]{6}$/`.
* **External Blocker:** Syntax validation does not prove account ownership or active account status at the beneficiary bank branch.
* **Production Prerequisite:** Integration with an authorized corporate banking or NPCI Penny-Drop API (e.g. SBI CMP API, Cashfree Bank Account Verification, or Razorpay Fund Account Validation for verification only).
* **Current Honest Policy:** Accounts are marked as `DETAILS_SUBMITTED` or `FORMAT_VALID`, never prematurely stamped as `VERIFIED` without an actual clearing-house cryptographic response.

---

## 2. PRODUCTION HARDWARE INTEGRATION GATES

### 2.1 Dual-Camera Stereo Liveness on Village Kiosks
* Standard webcams cannot perform structured-light or infrared 3D depth estimation.
* **Mitigation:** The kiosk app utilizes passive Laplacian variance texture checks and multi-frame optical flow analysis. For high-security cooperatives, physical supervisory confirmation is required for initial registration.

### 2.2 Corporate Banking Host-to-Host (H2H) SFTP Connectivity
* SBI CMP and other corporate banking rails require a dedicated encrypted VPN tunnel or static IP whitelisting for automated SFTP file drop.
* In the absence of an active H2H tunnel, the manual NEFT CSV export/import workflow remains the authoritative production bridge.

---

## 3. DOCKER DESKTOP / WSL RELAY RUNTIME LATENCY ON WINDOWS HOSTS

### Observation & Advisory
* On Windows hosts, the Docker Desktop WSL relay proxy (`wslrelay`) can introduce transient 10–14 second socket handshake latencies when establishing new TCP connections to forwarded container ports (e.g., port 54322).
* **Applied Mitigation:** Default `TENANT_POOL_CONNECTION_TIMEOUT_MS` was increased to 60000ms, and `PostgresPool.ts` connection resilience was hardened to prevent premature failover.
* **Production Recommendation:** Production deployments run natively on Linux containers (GCP Cloud Run / Kubernetes / Compute Engine), which operate with zero WSL relay overhead ($< 1\text{ ms}$ socket establishment).
