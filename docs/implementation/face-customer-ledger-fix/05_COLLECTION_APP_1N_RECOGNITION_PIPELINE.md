# DFARM — COLLECTION APP 1:N FACE RECOGNITION PIPELINE

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `05_COLLECTION_APP_1N_RECOGNITION_PIPELINE`  
**Status:** FIXED & OPTIMIZED  

---

## 1. The Collection Kiosk 1:N Recognition Challenge

During morning and evening milk collection hours, hundreds of farmers arrive at dairy collection centers. The Collection App (`apps/dfarm-collection-app`) operates on a counter kiosk or tablet equipped with a camera.

### Operational Requirements:
1. Operator points camera at incoming farmer (hands-free).
2. Live face detector extracts 5 landmarks and bounding box in $< 50\text{ ms}$.
3. Face patch is aligned, cropped to $112 \times 112$, and embedded via OpenCV SFace INT8 into a 128-D vector.
4. The probe vector is compared 1:N against **all enrolled active customers belonging to that Dairy**.
5. If cosine similarity $\ge 0.363$: Immediately identify farmer, select profile, and display previous balance.
6. If cosine similarity $< 0.363$: Return `UNKNOWN_PERSON` without false matches.

---

## 2. Root Cause of Previous False Exclusions

Previously, when the Collection App queried the gallery or sent a probe vector:
```json
{
  "success": true,
  "isMatch": false,
  "status": "UNKNOWN_PERSON",
  "similarity": 0.0955,
  "threshold": 0.363
}
```

The failure was traced to **Center-Level Over-Filtering**:
* The kiosk operator belonged to center `C-01`.
* In `services/backend/src/presentation/routes/identity.routes.ts`, the query for enrolled templates restricted `centerId = req.user?.centerId`.
* Farmers registered at other centers or at the central cooperative office were excluded from the search space.
* Result: The backend compared the probe against an empty list or irrelevant subset, yielding low similarity scores ($\sim 0.09$).

---

## 3. The Remediated 1:N Match Architecture

### 3.1 Dairy-Wide Template Retrieval
In `services/backend/src/presentation/routes/identity.routes.ts`:
```typescript
// GET /face/templates
router.get('/face/templates', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query['organizationId'] as string || req.user?.organizationId;
    if (!orgId) {
      res.status(400).json({ success: false, error: 'organizationId is required' });
      return;
    }

    // Load ALL active enrolled customers belonging to the Dairy
    const rawCenterId = req.query['centerId'] as string;
    const centerId = rawCenterId && rawCenterId !== 'ALL' ? rawCenterId : undefined;

    const templates = await getFaceTemplatesUseCase.execute(orgId, centerId);
    res.json({
      success: true,
      count: templates.length,
      templates,
    });
  } catch (err) {
    next(err);
  }
});
```

### 3.2 Server-Side 1:N Match Evaluation
When a probe embedding is sent to `POST /face/match`:
```typescript
const templates = await getFaceTemplatesUseCase.execute(orgId);
let bestMatch: any = null;
let bestScore = -1;

for (const candidate of templates) {
  const score = cosineSimilarity(embedding, candidate.embedding);
  if (score > bestScore) {
    bestScore = score;
    bestMatch = candidate;
  }
}

const isMatch = bestScore >= 0.363;
res.json({
  success: true,
  isMatch,
  matched: isMatch,
  status: isMatch ? 'FACE_MATCHED' : 'UNKNOWN_PERSON',
  similarity: Math.round(bestScore * 10000) / 10000,
  similarityScore: Math.round(bestScore * 10000) / 10000,
  confidenceScore: Math.round(Math.max(0, bestScore) * 1000) / 10,
  threshold: 0.363,
  matchedCustomer: isMatch && bestMatch
    ? {
        id: bestMatch.customerId,
        globalCustomerId: bestMatch.globalCustomerId,
        farmerCode: bestMatch.farmerCode,
        fullName: bestMatch.fullName,
      }
    : null,
  rejectionReason: isMatch ? null : 'NO_MATCH_BELOW_THRESHOLD',
});
```

---

## 4. Verification

* **Subtest 5 of E2E Suite:**
  - Evaluated probe vector of enrolled farmer against all Dairy A templates.
  - Returns `isMatch: true`, `status: 'FACE_MATCHED'`, `matchedCustomer.farmerCode: 'WAR-101'`, `matchedCustomer.fullName: 'Prakash Patil'`.
  - Non-enrolled arbitrary probe vector returns `isMatch: false`, `status: 'UNKNOWN_PERSON'`, `rejectionReason: 'NO_MATCH_BELOW_THRESHOLD'`.

---
*Signed & Verified by DFARM Architectural Engineering Team*
