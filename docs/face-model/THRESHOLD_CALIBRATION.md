# DFARM BIOMETRIC THRESHOLD CALIBRATION & POLICY
**Document ID:** `DFARM-SPEC-BIO-002`  
**Model:** `MobileFaceNet-ArcFace v1.0.0` (512D)  
**Metric:** Cosine Similarity  

---

## 1. Operating Characteristic & Threshold Policy

In dairy operations, false positive matches (attributing milk delivery to the wrong farmer) are severe financial integrity hazards. False negatives (requiring secondary verification via RFID or Supervisor Manual) are minor operational inconveniences.

Therefore, the decision threshold is strictly calibrated for **low False Acceptance Rate (FAR)**:

| Metric | Threshold Value | Target Performance | Field Operational Policy |
|---|---|---|---|
| **High-Confidence Accept** | $\ge 0.72$ | FAR $< 0.001\%$ ($1 \text{ in } 100,000$) | Immediate match; customer profile automatically loaded. |
| **Ambiguity Rejection Margin** | $\Delta < 0.05$ | Prevents close secondary matches | If top 2 candidates have similarity difference $< 0.05$, reject match. |
| **Unknown / Reject** | $< 0.72$ | Rejection of unregistered persons | Abort automatic match; prompt operator to tap RFID card or use Supervisor PIN. |

---

## 2. Decision Logic Flow

```
Captured Face ──> Quality Check (sharpness, pose, IPD)
                       │
                 [PASS]├───> [FAIL] ──> Prompt user to align face / improve lighting
                       ▼
              512D L2-Normalized Embedding
                       │
                       ▼
         Cosine Similarity vs Cached Center Templates
                       │
                       ├─ Best Match < 0.72 ──────────> FAIL: UNKNOWN_PERSON
                       │
                       ├─ Best - SecondBest < 0.05 ───> FAIL: AMBIGUOUS_MATCH
                       │
                       └─ Best Match >= 0.72 ─────────> VALIDATE STATUS & CENTER
                                                               │
                                                         [ACTIVE]├───> SUCCESS (Load Customer)
                                                               │
                                                        [INACTIVE]───> FAIL: CUSTOMER_NOT_ACTIVE
```
