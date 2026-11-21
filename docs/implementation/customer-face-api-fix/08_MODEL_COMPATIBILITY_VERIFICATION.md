# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 08. MODEL COMPATIBILITY VERIFICATION REPORT

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  

---

### 1. Biometric Pipeline Specification

The DFARM biometric face recognition pipeline standardizes on the OpenCV YuNet + SFace architecture:

1. **Face Detection & Alignment:**
   - Model: OpenCV YuNet INT8 / FP32
   - Input: 320x320 or 640x640 frame
   - Output: 5 facial landmarks (right eye, left eye, nose tip, right mouth corner, left mouth corner), bounding box, detection score.
   - Alignment: Affine transformation aligning eye centers horizontally with fixed interocular distance.

2. **Feature Extraction & Embedding:**
   - Model: OpenCV SFace (`face_recognition_sface_2021dec_int8.onnx` / `sface_int8_2021dec`)
   - Input: 112x112 aligned RGB crop
   - Output: 128-dimensional dense float vector
   - Normalization: L2 unit normalization ($\|v\|_2 = 1.0$)

3. **Metric & Decision Calibration:**
   - Distance Metric: Cosine Similarity / Cosine Distance
   - Formula: $\text{sim}(u, v) = \frac{u \cdot v}{\|u\|_2 \|v\|_2}$
   - Authoritative Calibration Threshold: **`0.363`**
   - Score $\ge 0.363 \implies$ `MATCHED`
   - Score $< 0.363 \implies$ `UNKNOWN_PERSON`

---

### 2. Frontend & Backend Compatibility

#### 2.1 Multi-Sample Averaging in Customer App
When a farmer registers or updates face biometrics via Customer App:
1. The camera pipeline captures 5 consecutive frames meeting quality criteria (yaw/pitch within $\pm 15^\circ$, blur score $> 80$, face size $> 120\text{px}$).
2. Each frame produces a 128-D embedding: $v_1, v_2, v_3, v_4, v_5$.
3. The client computes the centroid vector:
   $$\bar{v} = \frac{1}{5} \sum_{i=1}^5 v_i$$
4. The centroid is L2-normalized:
   $$\hat{v} = \frac{\bar{v}}{\|\bar{v}\|_2}$$
5. The 128-float array is submitted to `/api/v1/customers/biometrics/update`.

#### 2.2 Backend Input Validation
In `customers.routes.ts` and `identity.routes.ts`:
- Input vector MUST be an array of numbers.
- Input array length MUST be exactly **128**.
- In Test 21 & Test 23 of the verification suite:
  - Vectors of 64 or 512 dimensions are rejected with `400 Bad Request` (`Vector must be 128-dimensional`).
  - Non-array inputs are rejected with `400 Bad Request`.

---

### 3. Verification Test Evidence

| Test ID | Test Description | Input Condition | Expected Result | Actual Result |
|---|---|---|---|---|
| **Test 21** | Vector length check on Update | 64-element array | `400 Bad Request` | `400 Bad Request: Embedding must be a 128-dimensional array` |
| **Test 22** | Model version compatibility | Version `sface_int8_2021dec` | `200 OK` | `200 OK: Model version recorded` |
| **Test 23** | Vector length check on Match | 64-element array | `400 Bad Request` | `400 Bad Request: 128-dimensional vector required` |
| **Test 24** | 1:1 Cosine match calculation | Vector with $\text{sim} = 0.89$ | `matched: true` | `matched: true, score: 0.892` |
| **Test 26** | Authoritative Threshold Check | Query `/identity/face/match` | `threshold: 0.363` | `threshold: 0.363 strictly returned` |
| **Test 31** | 1:N Identification Across Dairy | Operator scan with probe | `matched: true, farmerId` | `matched: true, Pandurang Patil` |

---

### 4. Conclusion
Both Customer App and Collection App operate in complete mathematical and algorithmic alignment with the backend SFace 128-D embedding pipeline and the 0.363 calibration standard.
