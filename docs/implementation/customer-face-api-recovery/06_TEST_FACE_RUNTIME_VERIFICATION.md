# DFARM — POST P0 FACE BIOMETRIC API CONTRACT & MOBILE RUNTIME RECOVERY
## 06. TEST FACE RUNTIME VERIFICATION & TELEMETRY

**Execution Reference:** `DFARM-FACE-P0-API-RUNTIME-RECOVERY`  
**Execution Timestamp:** 2026-11-20  
**Screen Component:** `apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx`  
**Engine:** OpenCV YuNet 2023mar + OpenCV SFace INT8 2021dec  
**Status:** FULLY VERIFIED & OPERATIONAL  

---

### 1. Test Face Functional Capabilities

The **Test Face** feature (Diagnostics Screen) validates sensor health, camera telemetry, neural model execution, and biometric matching in a strictly read-only mode:

```
[Diagnostics Screen: "Test My Face"]
             │
             ▼
[CameraView: Capture Genuine Live Frame]
             │
             ▼ (photo.base64)
[POST /api/v1/identity/face/detect-and-embed]
  ├── YuNet Anchor Decoder (Prior Boxes + IoU NMS)
  ├── Landmark Alignment Evaluation (Roll/Yaw/Pitch angle checks)
  └── SFace INT8 Embedding (128-D L2 Normalized Feature Vector)
             │
             ▼ (vector: number[128])
[POST /api/v1/identity/face/match]
  ├── Decrypt Enrolled Template from Dairy Tenant DB (AES-256-GCM)
  ├── Compute Cosine Similarity: S = dot(v_live, v_enrolled)
  └── Evaluate against Standard Decision Boundary: S >= 0.363
             │
             ▼
[Render Diagnostic Card & Match Status Pill on Mobile UI]
```

---

### 2. Discrete Conditions & State Handling

The feature accurately detects and visually reports six discrete conditions without ambiguity:

| Condition | Trigger Scenario | Backend Status | Match Status | UI Feedback to Farmer |
|---|---|---|---|---|
| **Optimal Match** | Same farmer in camera; similarity $\ge 0.363$. | `FACE_DETECTED` | `MATCH_VERIFIED` | Green pill: `"Face verified successfully (Ramesh Patil) with confidence 96%."` |
| **Unknown Person / Non-Match** | Different person in camera; similarity $< 0.363$. | `FACE_DETECTED` | `MATCH_FAILED` | Amber badge: `"Face does not match the enrolled profile (similarity: 0.142 < 0.363)."` |
| **No Face in Frame** | Camera viewfinder empty or obstructed. | `NO_FACE_DETECTED` | `SKIPPED` | Warning: `"No face detected in camera capture. Please face the camera directly."` |
| **Multiple Faces** | More than 1 face detected ($> 1$). | `MULTIPLE_FACES_DETECTED`| `SKIPPED` | Caution: `"Multiple faces (2) detected. Only 1 person permitted."` |
| **Misaligned Face** | Farmer looking sideways, tilted $> 20^\circ$. | `FACE_MISALIGNED` | `SKIPPED` | Guide: `"Face is tilted or misaligned. Please hold your head straight."` |
| **Not Yet Enrolled** | Valid face detected, but no template in Dairy DB. | `FACE_DETECTED` | `NOT_ENROLLED` | Notice: `"Face sensor optimal, but no biometric template enrolled yet. Please enroll first."` |

---

### 3. Read-Only Invariant Enforcement

To prevent accidental corruption of biometric audit trails:
1. `diagnostics.tsx` and `runFaceDiagnostics` call only `GET` and read-only `POST` endpoints (`/identity/face/detect-and-embed`, `/identity/face/match`).
2. Neither `diagnostics.tsx` nor `/identity/face/match` issues any `INSERT`, `UPDATE`, or `DELETE` statements against `face_enrollments` or `customers`.
3. Verified in automated test subtest 19: testing face multiple times preserves identical template count, version ID, and enrollment timestamp in PostgreSQL.
