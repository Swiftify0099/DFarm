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

## Root Cause #6 — Physical Android Device Failed to Connect to `http://10.0.2.2:4000`

**Severity:** 🔴 Critical — Silent complete network failure on physical mobile phones  
**Affected:** `apps/dfarm-customer-app/src/services/api-client.ts`

### Evidence

On real physical Android devices (as shown in user device screenshot with VoLTE and Wi-Fi), `10.0.2.2` is unreachable because `10.0.2.2` is exclusive to the Android Studio desktop emulator. The app was unable to contact the backend server at all, falling back into network error handling and returning an empty list.

### Fix

Rewrote `resolveDefaultBaseUrl()` in `apps/dfarm-customer-app/src/services/api-client.ts` to dynamically resolve the Metro bundler host IP (`Constants.expoConfig?.hostUri`) or route to LAN Wi-Fi IP `http://10.114.224.223:4000/api/v1`.

---

## Root Cause #7 — Concurrent Native GPS Lock Failure & Lack of Last-Known Position

**Severity:** 🟠 High — Indoor or simultaneous GPS lock errors  
**Affected:** `apps/dfarm-customer-app/src/services/location-service.ts`

### Evidence

When `useEffect` on screen mount and `useDairyDiscovery` queried `getCurrentLocation()` at the same millisecond, concurrent calls to `Location.getCurrentPositionAsync()` collided on Android FusedLocationProvider. Additionally, if indoor GPS was weak, it immediately threw null without trying `Location.getLastKnownPositionAsync()`.

### Fix

1. Implemented in-flight single promise mutex (`pendingPromise`) in `LocationService` to deduplicate concurrent requests.
2. Added fallback to `Location.getLastKnownPositionAsync()` when active GPS lock times out indoors.
3. Disabled TanStack query while location is detecting (`enabled: locationState.kind !== 'detecting'`).

---

## Root Cause #8 — Suspended Dairy Filtering & Proximity Discovery Lifecycle

**Severity:** 🔴 Critical — Compliance with business rules (approved & not suspended only)  
**Affected:** `services/backend/src/presentation/routes/dairies.routes.ts`, `GetNearbyDairiesUseCase.ts`

### Evidence

Dairies marked as `SUSPENDED` were previously eligible or lacked explicit suspension lifecycle endpoints.

### Fix

1. Added `POST /api/v1/dairies/:id/suspend` and `POST /api/v1/dairies/:id/reactivate`.
2. Updated DB queries and in-memory cache to strictly filter out `SUSPENDED` and `DISABLED` dairies.
3. Verified in tests: when Super Admin suspends a dairy, it immediately vanishes from Customer App discovery; when reactivated, it immediately reappears.

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

| Endpoint | Status | Issue | Resolution |
|----------|--------|-------|------------|
| `GET /api/v1/dairies/nearby` | ✅ Repaired | Strict Haversine proximity & active/suspended filter | Returns real distance, excludes suspended |
| `POST /api/v1/dairies` | ✅ Working | Saves coordinates correctly | Inserts active organization, center & admin |
| `POST /api/v1/dairies/:id/suspend` | ✅ Added | Super Admin suspend endpoint | Updates DB & in-memory cache, excludes from nearby |
| `POST /api/v1/dairies/:id/reactivate` | ✅ Added | Super Admin reactivate endpoint | Updates DB & in-memory cache, restores discovery |
| `PATCH /api/v1/dairies/:id/location` | ✅ Working | Updates coordinates | Coordinates updated across org & centers |
| `GET /api/v1/dairies/:id` | ✅ Working | Returns coordinates | Includes formatted address & primary admin |

---

## Status Filter Findings

**Discoverable in nearby results:** Only approved / active, non-suspended dairies within the configured radius (default 5 km).  
**Strictly Excluded:** `SUSPENDED`, `DELETED`, `DISABLED`  
**Result:** 
- When Super Admin creates a dairy with Primary Admin: saved as ACTIVE with coordinates and immediately discoverable by nearby customers.
- When Super Admin clicks "Suspend Dairy": dairy is marked `SUSPENDED` on backend & DB and instantly disappears from customer discovery.
- When Super Admin clicks "Reactivate Dairy": dairy is restored to `ACTIVE` and instantly reappears in customer discovery.
- In Customer App: if no dairies exist within 5 km, shows clean empty state with options to expand search, eliminating previous fake fallback list.

---

## Files Changed

- [GetNearbyDairiesUseCase.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/dairies/GetNearbyDairiesUseCase.ts)
- [dairies.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/dairies.routes.ts)
- [client.ts (Super Admin)](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/api/client.ts)
- [mockBackend.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/services/mockBackend.ts)
- [useDairyDiscovery.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts)
- [dairy-discovery.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/app/(onboarding)/dairy-discovery.tsx)

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
