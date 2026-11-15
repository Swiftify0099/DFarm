# Rate Chart & Calculation Engine Audit Report
## 2D Matrix Slabs, Exact Cell Resolution, Banker's Rounding & Anti-Interpolation Guarantees

**Document Version**: 1.0.0  
**Verification Date**: 2026-11-15  
**Target Module**: `apps/collection-expo/src/domain/pricing/RateCalculationEngine.ts`  
**Reference Kotlin Module**: `apps/collection-app/.../domain/pricing/RateCalculationEngine.kt`  
**Backend Route**: `services/backend/src/modules/rates/rate.routes.ts` (`POST /api/v1/rates/calculate`)  
**Verification Status**: **FIXED AND VERIFIED**

---

### 1. Pricing Engine Principles & Legal Metrology

In dairy accounting, milk pricing is legally regulated based on quality components (Butterfat and Solids-Not-Fat).
1. **No Invented Rates**: Rates must never be fabricated, assumed, or linearly interpolated between discrete matrix cells unless explicitly mandated by rate version rules.
2. **Approved Version Mandate**: Rate charts must be signed and approved (`isApproved === true`). Unapproved drafts are strictly rejected.
3. **Discrete 2D Matrix**: Rates are retrieved from discrete grid cells indexed by `(Fat, SNF)` rounded to 1 decimal place ($0.1\%$ resolution).
4. **Canonical Weight Multiplier**: Calculated strictly as $\text{Total Amount} = \text{Weight in KG} \times \text{Rate per KG}$.
5. **Banker's Rounding (Half-Even)**: The total amount is rounded to 2 decimal places using Gaussian / Banker's rounding (`RoundingMode.HALF_EVEN`).

---

### 2. Banker's Rounding (Round-Half-to-Even) Implementation

Standard `Math.round(x)` in JavaScript implements round-half-up (biased towards $+\infty$). DFARM strictly matches Kotlin/Java `BigDecimal.setScale(2, RoundingMode.HALF_EVEN)`:

```typescript
export function roundHalfEven(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  const n = value * factor;
  const floor = Math.floor(n);
  const diff = n - floor;

  if (Math.abs(diff - 0.5) < 1e-9) {
    // Exactly halfway: round to nearest even integer
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(n) / factor;
}
```

#### Rounding Behavior Comparison Table
| Raw Product ($\text{KG} \times \text{Rate}$) | Half-Up (`Math.round`) | Half-Even (`roundHalfEven` / Java BigDecimal) | Status |
| :--- | :--- | :--- | :--- |
| **10.505** (Nearest even: 10.50) | 10.51 | **10.50** | Validated |
| **10.515** (Nearest even: 10.52) | 10.52 | **10.52** | Validated |
| **10.525** (Nearest even: 10.52) | 10.53 | **10.52** | Validated |
| **10.535** (Nearest even: 10.54) | 10.54 | **10.54** | Validated |

---

### 3. Controlled Pricing Error (`RateCellNotFoundException`)

If an intake yields Fat/SNF values for which the dairy owner has not configured an approved price in the center rate matrix:
- The system **does not** pick the nearest neighbor or default to zero.
- It immediately throws a typed `RateCellNotFoundException`:
  ```
  Controlled Pricing Error: No approved rate cell found for COW at Fat: 3.5%, SNF: 8.0% in version 1
  ```
- The operator UI shows a high-visibility warning and prevents collection confirmation until the center manager updates the rate chart.

---

### 4. Historical Version Immutability

- Every completed milk collection permanently stores:
  - `rate_chart_version_id` (UUIDv4)
  - `rate_version_number` (Integer)
  - `applied_rate_per_unit` (Numeric 10,2)
- Retroactive rate chart edits by administrators do not alter already settled ledger transactions.

---

### 5. Automated Test Evidence

All 5 pricing engine test cases pass in `rate-calculation.test.ts`:
```
TAP version 13
# Subtest: Rate Calculation & Matrix Pricing Engine Test Suite
    ok 1 - 1. Exact Matrix Cell Rate Calculation (PASS)
    ok 2 - 2. Missing Rate Cell Throws Controlled Pricing Error (No invented rates) (PASS)
    ok 3 - 3. Unapproved Rate Chart Version Rejected (PASS)
    ok 4 - 4. Historical Rate Version Preservation (PASS)
    ok 5 - 5. Banker Rounding (Half-Even) 2 decimals precision test (PASS)
```

**Conclusion**: The pricing engine guarantees legal metrology compliance, half-even rounding, and complete protection against unauthorized or fabricated milk rates.
