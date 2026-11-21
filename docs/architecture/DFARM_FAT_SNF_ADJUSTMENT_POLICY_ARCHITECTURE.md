# DFARM ARCHITECTURE: CENTRAL GLOBAL FAT/SNF ADJUSTMENT POLICY MANAGEMENT
**Document ID:** `DFARM-ARCH-FSAP-001`  
**Roadmap Scope:** Roadmap Phase 04 — Super Admin Platform Services  
**Author:** DFarm Principal Solution Architect & Hardware-Intake Integration Auditor  
**Status:** APPROVED & IMPLEMENTED  

---

## 1. Executive Summary & Purpose

The **Central Global FAT/SNF Adjustment Policy Management Engine** establishes mathematical precision, statutory compliance, and uniform quality deduction guidelines for milk intake across DFarm cooperative kiosks.

A critical principle of the DFarm platform is the absolute separation of:
1. **Raw Analyzer Readings:** Direct physical sensor measurements (ultrasonic attenuation, optical refraction) captured by hardware analyzers.
2. **Device Hardware Calibration:** Zero-point calibration offsets stored locally inside certified instruments.
3. **Commercial Quality Deduction Policies:** Central commercial formulas and bracket deduction rules applied during payment settlement.

---

## 2. Core Governance Principles

1. **Zero Guessed Deduction Values:**
   No arbitrary, hardcoded, or estimated deduction values are permitted in collection processing. All deduction formulas must be formally drafted, approved, and cryptographically verified.
2. **Separation of Raw Readings & Commercial Policy:**
   Milk analyzers report physical FAT% and SNF%. The intake receipt records raw values unaltered. The rate engine applies adjustments separately based on published policy versions.
3. **Draft Quarantine:**
   Draft policies cannot alter active financial calculations or collection shift settlements.
4. **Rounding Policy Enforcements:**
   To prevent truncation discrepancies, adjustment policies explicitly mandate numeric rounding rules:
   - `NEAREST_TWO_DECIMALS` (Standard financial standard)
   - `ROUND_DOWN` (Strict statutory minimum floor)
   - `ROUND_UP` (Farmer-incentive premium)
5. **SHA-256 Checksumming:**
   Version rule sets are hashed with SHA-256 to guarantee mathematical non-repudiation.

---

## 3. Database Schema Specification (`dfarm_central`)

Implemented in migration `033_central_platform_policies_and_support.sql`:

```sql
-- Global FAT/SNF Policy Definition
CREATE TABLE IF NOT EXISTS global_fat_snf_adjustment_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versioned Rules and Quality Deductions
CREATE TABLE IF NOT EXISTS global_fat_snf_adjustment_policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES global_fat_snf_adjustment_policies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    milk_category VARCHAR(20) NOT NULL DEFAULT 'BOTH',
    fat_adjustment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    snf_adjustment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    rounding_policy VARCHAR(50) NOT NULL DEFAULT 'NEAREST_TWO_DECIMALS',
    checksum VARCHAR(64) NOT NULL,
    change_summary TEXT,
    created_by UUID,
    created_by_name VARCHAR(150),
    published_by UUID,
    published_by_name VARCHAR(150),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uidx_fat_snf_version UNIQUE (policy_id, version_number),
    CONSTRAINT chk_fat_snf_milk_category CHECK (milk_category IN ('COW', 'BUFFALO', 'BOTH')),
    CONSTRAINT chk_fat_snf_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'))
);
```

---

## 4. Rule Definition Structure

```json
{
  "milkCategory": "BOTH",
  "roundingPolicy": "NEAREST_TWO_DECIMALS",
  "fatAdjustmentRules": [
    {
      "minFat": 3.00,
      "maxFat": 3.49,
      "deductionPerPoint": 0.25,
      "description": "Standard low-fat penalty per 0.1% defect"
    },
    {
      "minFat": 3.50,
      "maxFat": 5.00,
      "deductionPerPoint": 0.00,
      "description": "Standard acceptable bracket - zero deduction"
    }
  ],
  "snfAdjustmentRules": [
    {
      "minSnf": 8.00,
      "maxSnf": 8.49,
      "deductionPerPoint": 0.30,
      "description": "Sub-standard SNF penalty"
    },
    {
      "minSnf": 8.50,
      "maxSnf": 10.00,
      "deductionPerPoint": 0.00,
      "description": "Optimal solid-not-fat content"
    }
  ]
}
```

---

## 5. Security & Least Privilege

- Creation, version drafting, and publishing are restricted to `SUPER_ADMIN`.
- `PLATFORM_OPERATOR` is restricted to read-only visibility (`policies:read`). Attempts to create or publish return `403 Forbidden`.
- Any publication triggers immutable audit logging with actor identity and timestamp.
