# Customer GPS Location Flow — DFarm Customer App

## Overview

The `DairyDiscoveryScreen` automatically requests GPS on mount and uses real device coordinates to surface nearby dairies. Manual area filter chips are available as a fallback.

---

## 1. Auto-GPS on Mount (`useEffect`)

When the screen mounts, a `useEffect` immediately calls `locationService.getCurrentLocation()`:

```typescript
useEffect(() => {
  let cancelled = false;
  async function detectLocation() {
    setLocationState({ kind: 'detecting' });
    try {
      const coords = await locationService.getCurrentLocation();
      if (cancelled) return;
      if (coords) {
        setLocationState({ kind: 'ready', latitude: coords.latitude, longitude: coords.longitude, label: 'GPS Current Location' });
      } else {
        setLocationState({ kind: 'denied' });
        setActiveArea('all');
      }
    } catch {
      if (!cancelled) {
        setLocationState({ kind: 'unavailable' });
        setActiveArea('all');
      }
    }
  }
  detectLocation();
  return () => { cancelled = true; };
}, []);
```

The cleanup `cancelled = true` prevents stale state updates if the component unmounts before GPS resolves.

---

## 2. LocationState Machine

```
                     ┌─────────────┐
         (mount)     │  detecting  │  ← initial state
                     └──────┬──────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
           coords        coords       exception
           returned      null
              │             │              │
         ┌────▼────┐  ┌─────▼──────┐ ┌────▼───────┐
         │  ready  │  │   denied   │ │ unavailable│
         └────┬────┘  └─────┬──────┘ └────┬───────┘
              │             │              │
              └──── user taps area chip ───┘
                            │
                       ┌────▼─────┐
                       │  manual  │  ← preset area or "All Areas"
                       └──────────┘
```

| State | Meaning | Query behavior |
|---|---|---|
| `detecting` | GPS request in-flight | `selectedCoords = undefined` → hook tries GPS internally |
| `ready` | Real GPS fix obtained | `selectedCoords = { lat, lng }` → proximity search |
| `denied` | User denied permission | `selectedCoords = null` → all-areas fetch |
| `unavailable` | GPS hardware/timeout error | `selectedCoords = null` → all-areas fetch |
| `manual` | User selected a preset area | `selectedCoords = { lat?, lng? }` → preset proximity or all-areas |

---

## 3. How `selectedCoords` Drives the QueryKey

```typescript
const selectedCoords =
  locationState.kind === 'ready' || locationState.kind === 'manual'
    ? { latitude: locationState.latitude, longitude: locationState.longitude }
    : locationState.kind === 'detecting'
    ? undefined   // hook may attempt GPS itself
    : null;       // All Areas — no radius filter

useDairyDiscovery(searchQuery, selectedCoords);
// queryKey: ['dairies', 'nearby', searchQuery, selectedCoords?.latitude, selectedCoords?.longitude]
```

Each unique `(searchQuery, lat, lng)` combination is an isolated cache entry. When `locationState` transitions (e.g. `detecting → ready`), the queryKey changes and TanStack Query automatically fires a new fetch — **no manual `refetch()` call is needed**.

This eliminates the previous race condition where `refetch()` was called before `setSelectedCoords` had propagated.

---

## 4. Permission Denied Handling

When GPS is denied or unavailable:

1. `locationState` is set to `{ kind: 'denied' }` or `{ kind: 'unavailable' }`.
2. `activeArea` is set to `'all'`.
3. `selectedCoords` becomes `null` → the query fetches all dairies with text search only.
4. A yellow warning banner (`renderLocationBanner`) is shown with a "Enable GPS" / "Retry GPS" button.
5. The user can still select preset area chips (Kolhapur, Sangli, Pune) for approximate proximity search.

---

## 5. Manual GPS Refresh (`handleDetectGPS`)

The GPS Live chip and the banner buttons both call `handleDetectGPS`:

```typescript
const handleDetectGPS = async () => {
  setIsRefreshingLocation(true);
  setLocationState({ kind: 'detecting' });   // triggers loading UI
  try {
    const coords = await locationService.getCurrentLocation();
    if (coords) {
      setLocationState({ kind: 'ready', ... });  // queryKey updates → auto-refetch
    } else {
      setLocationState({ kind: 'denied' });
    }
  } catch {
    setLocationState({ kind: 'unavailable' });
  } finally {
    setIsRefreshingLocation(false);
  }
};
```

No `await refetch()` is called — the queryKey change drives the re-fetch automatically.
