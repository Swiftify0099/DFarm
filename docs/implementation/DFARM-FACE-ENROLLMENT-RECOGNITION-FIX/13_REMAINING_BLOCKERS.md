# DFARM — Remaining Blockers & Known Mitigations

**Report Index:** `13_REMAINING_BLOCKERS.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  

---

## 1. Current System Status: NO CRITICAL BLOCKERS

All 7 core problem statements identified in the root cause investigation have been systematically resolved, verified through automated end-to-end integration tests, and validated in live browser and mobile test harnesses.

| Problem Statement | Status | Resolution |
| :--- | :--- | :--- |
| 1. Customer App enrollment unclear | **RESOLVED** | Added prominent Home Dashboard Banner + 5-sample tactile progress indicator |
| 2. Enrollment completion unconfirmed | **RESOLVED** | Backend read-back verification confirms tenant DB persistence |
| 3. Customer App Test Face button broken | **RESOLVED** | Live inference + `/identity/face/match` + discrete status hero pills |
| 4. Collection App false `UNKNOWN PERSON` | **RESOLVED** | Fixed AAD encryption mismatch + dynamic operator template refresh |
| 5. Camera detection vs identity mismatch | **RESOLVED** | Synchronized `useCamera` bounding boxes with `HardwareContext.faceState` |
| 6. Model / preprocessing incompatibility | **RESOLVED** | Verified identical YuNet/SFace INT8 SHA256 checksums & 128-D L2 normalization |
| 7. Tenant DB routing & template retrieval | **RESOLVED** | Strict multi-tenant isolation with zero cross-tenant leakage |

---

## 2. Low-Priority Operational Recommendations

1. **Physical Postgres in Local Development:**
   - In environments where Docker or local PostgreSQL (`port 54322`) is stopped, the backend automatically fails over to the isolated memory test double.
   - For physical hardware testing with native PostgreSQL, ensure Docker daemon is started (`docker start dfarm-postgres-tenant-db`).
2. **Camera Lighting in Village Collection Centers:**
   - For collection centers operating in low-light morning shifts (5:00 AM), recommend installing a warm LED diffuse light above the collection counter to ensure YuNet detection confidence $> 0.85$.
