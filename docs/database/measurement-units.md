# Canonical Measurement Units and Financial Rate Contract

## 1. Problem Statement & Historical Ambiguity

In early phase designs, measurement units exhibited semantic divergence:
- **Phase 09 (Sync Engine)** utilized `quantity_liters` and `rate_per_liter`.
- **Phase 10 (Collection Application)** utilized `weight_kg` and `rate_per_kg`.

In physical dairy operations, milk weighing stations measure mass using load cells in **Kilograms (KG)**. Naively asserting that $1\text{ KG} = 1\text{ Litre}$ introduces severe financial errors because raw milk density fluctuates between $1.026\text{ kg/L}$ and $1.034\text{ kg/L}$ depending on fat and solids-not-fat (SNF) content.

---

## 2. Canonical Measurement Contract

Phase 11 establishes a single canonical measurement contract across database tables, backend DTOs, validation schemas, sync payloads, and Android models:

1. **Measured Quantity**:
   - The primary measured physical quantity from collection scales is explicitly declared as **`KILOGRAM`** (`KG`).
   - Stored in `milk_collections.quantity` / `milk_collections.net_weight` as exact `NUMERIC(10, 3)`.
   - Android collection clients and backend services declare `measurement_unit = 'KG'`.

2. **Pricing Unit**:
   - The rate chart specifies its pricing unit explicitly via `rate_chart_versions.pricing_unit`.
   - Default pricing unit: **`PER_KG`**.
   - Optional supported pricing unit: **`PER_LITER`** (only if the center is explicitly calibrated with volumetric instruments).

3. **Rejection of Silent Mismatch**:
   - When a collection request specifies quantity in `KG` but an applied rate version specifies `PER_LITER` without an approved density conversion formula, the backend **rejects** the transaction with `UNIT_MISMATCH`.
   - Never assume $1\text{ KG} = 1\text{ L}$.

4. **Density-Based Volume Derivation**:
   - If volumetric reporting in Litres is required for bulk tanker transport, volume is calculated using the official dairy density equation:
     $$\text{Density } (\rho) = 1 + \left(\frac{\text{CLR}}{4 \times 1000}\right) + (0.0002 \times \text{Fat}) \approx 1.028 \text{ to } 1.032 \text{ g/cm}^3$$
     $$\text{Volume (L)} = \frac{\text{Weight (KG)}}{\text{Density (kg/L)}}$$
   - When volume is derived, it is stored in a separate column (`volume_liters NUMERIC(10, 3)`) alongside its source tag (`source: DERIVED_FROM_MASS`), preserving the raw load cell weight intact.

---

## 3. Database Schema & Migration Invariants

Migration `014_milk_rate_management_system.sql` maintains historical backward compatibility:
- Pre-existing columns (`quantity`, `rate_per_unit`, `total_amount`) remain unchanged.
- Financial rates are strictly defined as `NUMERIC(10, 2)` or `NUMERIC(10, 4)`.
- Total payable amount is computed with bank-grade rounding:
  $$\text{Total Amount} = \text{ROUND}(\text{Net Weight} \times \text{Applied Rate}, 2)$$
- Zero floating-point calculations (`FLOAT`, `REAL`, `DOUBLE PRECISION`) exist anywhere in the financial path.

---

## 4. End-to-End Alignment Verification

- **Backend DTOs**: `RateCalculationRequestDTO`, `RateCalculationResultDTO`, `MilkCollectionDTO`.
- **Zod Schemas**: `RateCalculationRequestSchema`, `MilkCollectionSubmissionSchema`.
- **Android Models**: `MilkCollectionEntity` (Room SQLite), `RateChartCell` (Kotlin Data Class).
- **Receipt Formats**: Thermal receipt displays `Weight: XX.XX KG`, `Rate: ₹XX.XX / KG`, `Total: ₹XXX.XX`.

