# DFARM PHASE 12 — KEYBOARD FUNCTION KEY MAPPING
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** SPECIFICATION & IMPLEMENTATION CONTRACT  
**Date:** 2026-11-18  

---

## 1. Keyboard Navigation Principles

The milk collection counter is operated in fast-paced cooperative dairy environments where operators use physical keyboards, numeric keypads, barcode scanners, and USB RFID wedge readers.

### Core Rules:
1. **Zero Browser Tab Spawning**: No shortcut or Enter key press will ever open a new browser tab or reload the window.
2. **Zero Counter Unmounting**: Pressing F2–F6 opens centered modal overlays over the active counter workspace without unloading the collection state.
3. **RFID Keyboard-Wedge Immunity**: Hardware RFID readers typing burst characters (<80ms keystroke interval) terminating with `Enter` are cleanly intercepted and never submit forms or disrupt text fields.
4. **Escape Key Resolution**: Pressing `Escape` closes any open overlay dialog and instantly returns keyboard focus to the main farmer identification input.

---

## 2. Function Key Mapping Table

| Key | Action | Scope / Context | Target Component / Behavior | Modal / Overlay Type | Escape Key Behavior |
|---|---|---|---|---|---|
| **Enter** (in Farmer Input) | Look up & Load Patron | Farmer Code Input | Validates input, looks up customer by code, mobile, or RFID, sets `activeCustomer`, speaks name, moves focus to milk category | None (Direct in-place counter load) | Clears input field |
| **Enter** / **Ctrl+Enter** (with valid intake) | Save Milk Intake | Main Counter | Calls `handleSubmit()` if `canSubmit === true`. Persists transaction, prints receipt, refreshes shift journal | None (Direct save & counter reset) | N/A |
| **F1** | Focus Counter / Intake | Global | Focuses farmer code input on the main collection counter; closes any open overlay | None | N/A |
| **F2** | Customer Directory | Global | Opens Customer Directory search and patron list. Selecting a patron loads them on the counter and closes modal | Centered Modal Overlay (`CustomerDirectoryOverlay`) | Closes modal, focuses farmer input |
| **F3** | Shift Sessions | Global | Opens Shift Sessions management to view shift totals, open new shift, or close active shift | Centered Modal Overlay (`ShiftSessionsOverlay`) | Closes modal, focuses farmer input |
| **F4** | Hardware Telemetry | Global | Opens hardware diagnostics to inspect camera, YuNet, SFace, RFID, scale, and lactometer COM ports | Centered Modal Overlay (`HardwareDiagnosticsOverlay`) | Closes modal, focuses farmer input |
| **F5** | Offline Queue | Global | Opens offline queue to review pending intakes, trigger batch synchronization, and inspect retry states | Centered Modal Overlay (`OfflineQueueOverlay`) | Closes modal, focuses farmer input |
| **F6** | Kiosk Settings | Global | Opens kiosk terminal configuration, dairy tenant association, voice announcer test, and local DB reset | Centered Modal Overlay (`KioskSettingsOverlay`) | Closes modal, focuses farmer input |
| **Escape** | Dismiss / Close | Overlays / Modals | Closes currently open overlay dialog and returns focus to main counter input | Topmost active overlay | Restores counter focus |

---

## 3. Browser-Reserved Key Protection

Special handling is implemented to prevent destructive browser default behaviors:
- **F5 (Browser Reload)**: `e.preventDefault()` prevents browser window reload, which would purge unsaved scale readings or in-progress biometric frames. Instead, F5 cleanly toggles the Offline Queue overlay.
- **F6 (Address Bar Focus)**: `e.preventDefault()` prevents browser focus from leaving the kiosk application into the URL address bar. Instead, F6 cleanly toggles Kiosk Settings.
- **F1 (Browser Help)**: `e.preventDefault()` prevents opening browser help documentation. Instead, F1 returns keyboard focus to the primary farmer code input.
- **F3 (Find Next)**: `e.preventDefault()` prevents browser page text search. Instead, F3 opens Shift Sessions.

---

## 4. Implementation Structure in `CollectionAppShell.tsx`

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // 1. If user presses Escape, close any active overlay
    if (e.key === 'Escape') {
      if (activeOverlay !== null) {
        e.preventDefault()
        setActiveOverlay(null)
        focusFarmerInput()
        return
      }
    }

    // 2. Intercept F1-F6
    if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].includes(e.key)) {
      e.preventDefault()
      switch (e.key) {
        case 'F1':
          setActiveOverlay(null)
          focusFarmerInput()
          break
        case 'F2':
          setActiveOverlay(prev => prev === 'CUSTOMERS' ? null : 'CUSTOMERS')
          break
        case 'F3':
          setActiveOverlay(prev => prev === 'SESSIONS' ? null : 'SESSIONS')
          break
        case 'F4':
          setActiveOverlay(prev => prev === 'DEVICES' ? null : 'DEVICES')
          break
        case 'F5':
          setActiveOverlay(prev => prev === 'SYNC' ? null : 'SYNC')
          break
        case 'F6':
          setActiveOverlay(prev => prev === 'SETTINGS' ? null : 'SETTINGS')
          break
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [activeOverlay])
```

---
**Keyboard Mapping Complete & Verified.**
