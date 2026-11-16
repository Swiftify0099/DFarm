# DFarm — Nearby Dairy Discovery: Root Cause Report

**Date:** 2026-11-16  
**Investigated by:** DFarm Engineering  
**Status:** ✅ All root causes identified and fixed

---

## Executive Summary

Registered dairies were not appearing in the Customer App's nearby dairy selection list due to **five distinct bugs** across the backend and frontend. The most critical was a missing backend class that caused a silent runtime failure for every nearby search request. A secondary hardcoded GPS coordinate caused every customer to search near Kolhapur regardless of actual location.

---

## Root Cause #1 — FATAL: `GetNearbyDairiesUseCase` Class Was Never Implemented

**Severity:** 🔴 Critical — Total failure of database-backed nearby search  
**Affected:** `services/backend/src/`

### Evidence

`services/backend/src/presentation/routes/dairies.routes.ts`:
- Line 3: `import { GetNearbyDairiesUseCase } from '../../application/use-cases/index.js';`
- Line 12: `const getNearbyDairies = new GetNearbyDairiesUseCase();`
- Line 561: `let data = await getNearbyDairies.execute(lat, lng, searchParam, radiusKm);`

`GetNearbyDairiesUseCase` **did not exist** anywhere in the codebase. Not in the use-cases directory, not exported from `index.ts`. The `index.ts` only exported 9 other use cases (auth, sessions, collections, customers, ledger, telemetry).

### Impact

On server startup, Node.js imports the route file and resolves `GetNearbyDairiesUseCase` as `undefined`. Calling `new undefined()` throws `TypeError: GetNearbyDairiesUseCase is not a constructor`. This propagates to the Express error handler, returning HTTP 500. The route falls through to merge **only in-memory dairies** (created since last server restart). Database-registered dairies are **never** returned.

### Fix

Created: `services/backend/src/application/use-cases/dairies/GetNearbyDairiesUseCase.ts`  
Updated: `services/backend/src/application/use-cases/index.ts` — added export line

---

## Root Cause #2 — Hardcoded Kolhapur Coordinates as GPS Default

**Severity:** 🔴 Critical — Wrong location used for every customer  
**Affected:** `apps/dfarm-customer-app/src/app/(onboarding)/dairy-discovery.tsx`

### Evidence

```ts
const [selectedCoords, setSelectedCoords] = useState<{...} | null>({
  latitude: 16.6644,
  longitude: 74.2588,
  areaName: 'Kolhapur'    // ← hardcoded for every customer
});
```

GPS was never automatically requested on screen mount. Only triggered by manual tap of "GPS Live" chip.

### Impact

Every customer searches near Kolhapur on first open. If their actual dairy is elsewhere, it never appears. Customers in Pune, Sangli, or any other city see only Kolhapur-area dairies.

### Fix

Rewrote `dairy-discovery.tsx`:
- `useEffect` auto-calls `locationService.getCurrentLocation()` on mount
- `LocationState` machine: `detecting → ready | denied | unavailable | manual`
- `selectedCoords` derived from `locationState` — no independent hardcoded state

---

## Root Cause #3 — 150 km Search Radius Masked the Real Problem

**Severity:** 🟠 High — Defeats the purpose of nearby search  
**Affected:** `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts`

### Evidence

```ts
radiusKm: 150,
```

150 km covers all of Maharashtra. This was likely added during development to force results to appear despite the broken GPS.

### Fix

Changed `radiusKm: 150` → `radiusKm: 5`. Backend defaults: 5 km with GPS, 150 km without GPS (directory mode).

---

## Root Cause #4 — Silent GPS Fallback to Kolhapur

**Severity:** 🟠 High — GPS failure was invisible to user  
**Affected:** `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts`

### Evidence

```ts
currentLat = coords?.latitude || 16.6644;  // Kolhapur fallback
currentLng = coords?.longitude || 74.2588;
```

When GPS returned `null`, Kolhapur was silently substituted. User saw no error.

### Fix

Removed fallback. `null` GPS → `currentLat`/`currentLng` remain `undefined` → backend returns all dairies (directory mode). UI shows explicit permission-denied banner with Retry.

---

## Root Cause #5 — Race Condition in GPS Refresh

**Severity:** 🟡 Medium — Stale search results after GPS refresh  
**Affected:** `apps/dfarm-customer-app/src/app/(onboarding)/dairy-discovery.tsx`

### Evidence

```ts
setSelectedCoords({ latitude: coords.latitude, ... });
await refetch();  // fires before React state propagates to queryKey
```

### Fix

Removed manual `refetch()`. `locationState` → `selectedCoords` derivation → `queryKey` change → TanStack Query auto-refetches.

---

## Database Findings

| Component | Status |
|-----------|--------|
| `organizations.latitude / longitude` | ✅ NUMERIC(10,7) with range CHECK |
| Spatial index `idx_organizations_geo` | ✅ Present (migration 028) |
| Coordinate INSERT from Super Admin | ✅ Correct |
| Coordinate PATCH update | ✅ Correct |
| `dairy_centers` coordinates | ✅ Mirrored from organization |

---

## API Findings

| Endpoint | Status | Issue |
|----------|--------|-------|
| `GET /api/v1/dairies/nearby` | ⚠️ Broken | Use case missing → HTTP 500 |
| `POST /api/v1/dairies` | ✅ Working | Saves coordinates correctly |
| `PATCH /api/v1/dairies/:id/location` | ✅ Working | Updates coordinates |
| `GET /api/v1/dairies/:id` | ✅ Working | Returns coordinates |

---

## Status Filter Findings

**Included in nearby results:** All statuses except SUSPENDED, DELETED, DISABLED  
**Excluded:** SUSPENDED, DELETED, DISABLED  
**Result:** Dairies in ACTIVE, INACTIVE, or draft_onboarding states ARE shown to customers.

This is correct per the business requirement: a newly provisioned dairy should be discoverable as soon as it has valid coordinates, regardless of Primary Admin activation status.

---

## Files Changed

| File | Change Type |
|------|-------------|
| `services/backend/src/application/use-cases/dairies/GetNearbyDairiesUseCase.ts` | **NEW** |
| `services/backend/src/application/use-cases/index.ts` | Added export |
| `services/backend/src/presentation/routes/dairies.routes.ts` | Fixed memEntry type; radiusKm already added |
| `apps/dfarm-customer-app/src/app/(onboarding)/dairy-discovery.tsx` | Full rewrite |
| `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts` | Radius + GPS fallback fix |

---

## Remaining Limitations

1. **Google Maps API Key** — `DairyLocationPicker` requires `VITE_GOOGLE_MAPS_API_KEY`. Without it, the interactive map is unavailable; manual coordinate entry fallback works.
2. **PostGIS** — Not installed. Pure Haversine via PostgreSQL math is used. Accurate for distances up to ~1,000 km.
3. **GPS on web/emulator** — Requires a physical device or emulator with location emulation for real GPS testing.
4. **In-memory dairies** — Not persisted across server restarts. Ensure PostgreSQL connectivity for production.
