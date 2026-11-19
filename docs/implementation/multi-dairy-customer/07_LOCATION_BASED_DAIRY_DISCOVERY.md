# 07 — LOCATION-BASED DAIRY DISCOVERY

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `dairy-discovery.tsx`, `dairies.routes.ts`, `organizations` table

---

## 1. Discovery Objective

Farmers frequently live on the border between cooperative societies or own cattle across multiple villages. The discovery system enables finding real, approved dairy cooperatives based on:
1. Live device GPS location (with high accuracy timeout and permission fallback).
2. Administrative area presets (Kolhapur, Warnanagar, Sangli, Tasgaon, Karad, Satara, Pune, Baramati, Ahmednagar, Solapur).

---

## 2. Location Calculation & Spatial Query

The backend computes the exact great-circle distance between the user's coordinates and the cooperative's registered location using the canonical Haversine formula:

$$\Delta\sigma = 2 \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)} \right)$$

$$d = R \cdot \Delta\sigma \quad (R = 6371\text{ km})$$

### Spatial SQL Query (`dfarm_central`)
```sql
SELECT 
    o.id, o.name, o.code, o.status,
    o.address_line1, o.city_town, o.district, o.state, o.postal_code,
    o.latitude, o.longitude,
    (
      6371 * acos(
        cos(radians($1)) * cos(radians(o.latitude)) *
        cos(radians(o.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(o.latitude))
      )
    ) AS distance_km
FROM organizations o
WHERE o.status = 'ACTIVE' 
  AND o.latitude IS NOT NULL 
  AND o.longitude IS NOT NULL
ORDER BY distance_km ASC
LIMIT $3;
```

---

## 3. "Already Registered" Badge Integration

The Customer App cross-references the discovered dairies against the customer's known memberships:
- If `memberships.some(m => m.organizationId === dairy.id)`:
  - App renders a subtle "आधीच नोंदणीकृत" (Already Registered) badge.
  - The card action changes from "नोंदणी करा" (Register) to "या डेअरीवर जा" (Switch to this Dairy).
  - This prevents accidental re-registration attempts and provides intuitive switching directly from discovery.
