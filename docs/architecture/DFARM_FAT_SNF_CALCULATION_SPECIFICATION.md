# DFARM ARCHITECTURE: FAT/SNF FINANCIAL CALCULATION SPECIFICATION
## SEPARATION OF SENSOR MEASUREMENT, CALIBRATION CORRECTION & COMMERCIAL QUALITY POLICIES

**Document ID:** `DFARM-ARCH-FSCS-001`  
**Roadmap Phase:** Roadmap Phase 09 — Financial Calculation, Farmer Settlement, Bulk Bank Payout & Reconciliation  
**Target:** Milk Collection Pricing Engine, PostgreSQL Tenant & Central Databases  
**Standard:** Exact Decimal Arithmetic, Pure Separation of Physical & Commercial Layers  

---

## 1. Core Architectural Separation

DFarm strictly enforces the three-layer separation of physical measurement, instrument calibration, and commercial settlement:

```
+-------------------------------------------------------------------------------+
| LAYER 1: RAW PHYSICAL SENSOR READINGS                                         |
| Ultrasonic / NIR analyzer transmits direct sensor values (FAT%, SNF%, CLR)    |
| Preserved unaltered in collection records (e.g. raw_fat = 4.23, raw_snf = 8.56)|
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| LAYER 2: HARDWARE METROLOGY CALIBRATION                                       |
| Factory zero-offset and slope adjustments certified by Weights & Measures.    |
| Applied inside instrument or recorded as verified calibration offset.        |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| LAYER 3: COMMERCIAL SETTLEMENT POLICY & DEDUCTION MATRIX                      |
| Defined centrally via global_fat_snf_adjustment_policy_versions.              |
| Evaluates quality brackets, defect deductions, and rounding rules.            |
+-------------------------------------------------------------------------------+
```

---

## 2. Mathematical Precision & Rounding Rules

1. **Paise-Level Financial Accuracy:**
   All monetary calculations operate on exact PostgreSQL `NUMERIC(12,2)` types. Intermediate rate calculations preserve 4 decimal places before rounding to 2 decimal places at the transaction total boundary:
   $$\text{Total Amount} = \text{round}_2(\text{Volume in Liters} \times \text{Rate per Liter})$$
2. **Rounding Policies:**
   - `NEAREST_TWO_DECIMALS` (Standard financial half-up rounding):
     $$\text{round}_2(x) = \frac{\lfloor 100x + 0.5 \rfloor}{100}$$
   - `ROUND_DOWN`: Floors fractional paise to statutory minimums.
   - `ROUND_UP`: Ceils fractional paise in favor of farmer incentive premiums.

---

## 3. Commercial Adjustment Bracket Matrix

When a published `global_fat_snf_adjustment_policy_versions` is applicable, quality deductions are applied deterministically:

```json
{
  "milkCategory": "COW",
  "roundingPolicy": "NEAREST_TWO_DECIMALS",
  "fatAdjustmentRules": [
    {
      "minFat": 3.00,
      "maxFat": 3.49,
      "deductionPerPoint": 0.25,
      "description": "Sub-standard fat penalty: ₹0.25 deduction per 0.1% defect below 3.5%"
    },
    {
      "minFat": 3.50,
      "maxFat": 5.50,
      "deductionPerPoint": 0.00,
      "description": "Standard acceptable fat range — zero deduction"
    }
  ],
  "snfAdjustmentRules": [
    {
      "minSnf": 8.00,
      "maxSnf": 8.49,
      "deductionPerPoint": 0.20,
      "description": "Sub-standard SNF penalty: ₹0.20 deduction per 0.1% defect below 8.5%"
    },
    {
      "minSnf": 8.50,
      "maxSnf": 10.00,
      "deductionPerPoint": 0.00,
      "description": "Standard acceptable SNF range — zero deduction"
    }
  ]
}
```

- If no published policy is effective, **zero arbitrary deductions** are invented, protecting farmer earnings from unauthorized penalties.
