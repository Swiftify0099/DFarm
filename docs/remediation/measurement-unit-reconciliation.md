# Milk Measurement Unit & Density Conversion Reconciliation
**DFarm — Smart Dairy Management System**  
**Remediation Deliverable 08**  

---

## 1. Authoritative Measurement Standards

DFarm standardizes milk transactions across two physical quantities:
- **Mass (Kilograms, KG)**: Primary intake measurement on physical weighing scales.
- **Volume (Litres, L)**: Secondary customer-facing representation and commercial invoicing quantity.

---

## 2. Milk Density & Volume Conversion Formula

Because milk is an emulsion with suspended butterfat and dissolved solids-not-fat (SNF), its specific gravity exceeds water ($1.000\text{ g/cm}^3$).

### Corrected Indian Dairy Industry Standard (ISI/BIM Formula):
$$\text{Density } (\text{g/cm}^3 \text{ or kg/L}) = 1.0 + \frac{\text{CLR}}{1000}$$
$$\text{Where CLR} = \text{Corrected Lactometer Reading at } 20^\circ\text{C or } 29^\circ\text{C}$$

When converting between measured mass and calculated volume:
$$\text{Volume (Litres)} = \frac{\text{Weight (Kilograms)}}{\text{Density (kg/L)}}$$
$$\text{Weight (Kilograms)} = \text{Volume (Litres)} \times \text{Density (kg/L)}$$

### Default Standard Densities (When CLR is not directly read):
- **Cow Milk**: Standard Density = $1.0280\text{ kg/L}$ (Range: $1.026 - 1.032$).
- **Buffalo Milk**: Standard Density = $1.0320\text{ kg/L}$ (Range: $1.030 - 1.036$).

---

## 3. Approved Quality & Quantity Validation Limits

All intake measurements must pass center-configured boundaries before rate evaluation:

| Parameter | Cow Milk Allowed Range | Buffalo Milk Allowed Range | Rejection Behavior |
|---|---|---|---|
| **Fat Percentage** | $2.8\% - 6.0\%$ | $5.0\% - 12.0\%$ | Flags `INVALID`; blocks auto-commit without supervisor override |
| **SNF Percentage** | $7.8\% - 10.2\%$ | $8.2\% - 11.5\%$ | Flags `INVALID`; blocks auto-commit without supervisor override |
| **CLR** | $26.0 - 32.0$ | $28.0 - 34.0$ | Used for density validation |
| **Net Weight** | $0.5\text{ kg} - 200.0\text{ kg}$ | $0.5\text{ kg} - 200.0\text{ kg}$ | Physical weighing scale limits |

---

## 4. Measurement Source Tracking

Every reading record persists its capture origin in `reading_source`:
- `MANUAL_ENTRY` (Current operational mode: operator manually keys scale display into UI).
- `AUTOMATED_ANALYZER` (Deferred: direct physical analyzer serial port integration).
- `AUTOMATED_SCALE` (Deferred: direct physical weighing scale serial port integration).
- `TEST_FIXTURE` (Automated integration and calibration tests).
