# Dairy Discovery Eligibility — DFarm Customer App

## Overview

This document defines which dairies are visible to customers in the nearby discovery screen, and how GPS coordinates affect eligibility.

---

## 1. Status Eligibility

A dairy is **discoverable** by customers if its `status` column in the `organizations` table is **NOT IN**:

| Status | Discoverable? | Reason |
|---|---|---|
| `ACTIVE` | ✅ Yes | Normal operating dairy |
| `draft_onboarding` | ✅ Yes | Newly registered, completing onboarding |
| `INACTIVE` | ✅ Yes | Temporarily inactive but not removed |
| `SUSPENDED` | ❌ No | Administratively suspended |
| `DELETED` | ❌ No | Soft-deleted record |
| `DISABLED` | ❌ No | Explicitly disabled by admin |

> [!IMPORTANT]
> Both `ACTIVE` and `draft_onboarding` / `INACTIVE` dairies are shown to customers. This allows a newly registered dairy to appear in discovery while it completes its onboarding profile.

> [!WARNING]
> `SUSPENDED` dairies are always excluded, regardless of search query or area filter. The backend `GetNearbyDairiesUseCase` enforces this via `WHERE status NOT IN ('SUSPENDED', 'DELETED', 'DISABLED')`.

---

## 2. GPS Coordinate Eligibility

| Condition | GPS Search | "All Areas" / Text Search |
|---|---|---|
| Dairy has valid `latitude` AND `longitude` (non-null, non-zero, in-range) | ✅ Included, sorted by distance | ✅ Included |
| Dairy has `NULL` or `0` coordinates | ❌ Excluded from proximity results | ✅ Included (text search only) |
| Dairy has out-of-range coordinates | ❌ Excluded from proximity results | ✅ Included (text search only) |

Coordinate validity check (enforced in `GetNearbyDairiesUseCase`):

```sql
WHERE
  o.latitude IS NOT NULL
  AND o.longitude IS NOT NULL
  AND o.latitude <> 0
  AND o.longitude <> 0
  AND o.latitude BETWEEN -90 AND 90
  AND o.longitude BETWEEN -180 AND 180
```

> [!NOTE]
> A dairy without coordinates still appears when the customer uses text search or the "All Areas" filter. Missing coordinates only excludes the dairy from GPS proximity sorting; it does **not** prevent the dairy from being registered or used.

---

## 3. Search Radius

| Mode | Radius |
|---|---|
| GPS Live / Preset Area (coordinates provided) | **5 km** default |
| Backend extended radius (no coordinates) | 150 km (effectively: all Maharashtra) |
| Customer app `useDairyDiscovery` hook | `radiusKm: 5` passed to backend |

The 5 km default is intentional for a "nearby village collection center" use case. Customers who want to see dairies outside this radius can:
- Use text search (name, village, district, in-charge)
- Select the "All Areas" chip

---

## 4. In-Memory Fallback Dairies

If the backend is unreachable, `useDairyDiscovery` falls back to a hardcoded list of verifiable registered Maharashtra dairies (Gokul, Warna, Sahyadri, Tasgaon, DFarm Shivajinagar, etc.). These fallback entries:

- Are always returned regardless of GPS proximity (the fallback list is not radius-filtered — it returns all entries, sorted by distance if GPS is available)
- Do **not** represent live database state
- Serve only as a development/offline convenience until the backend is reachable

> [!CAUTION]
> Do not rely on the fallback list for production correctness. It exists solely to unblock UI development when the backend is offline.
