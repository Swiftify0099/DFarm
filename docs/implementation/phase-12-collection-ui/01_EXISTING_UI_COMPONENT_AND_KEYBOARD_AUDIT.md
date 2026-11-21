# DFARM PHASE 12 — EXISTING UI COMPONENT AND KEYBOARD AUDIT
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** COMPLETE AUDIT (PRE-TRANSFORMATION)  
**Date:** 2026-11-18  

---

## 1. Existing Layout & Navigation Architecture

Currently, `CollectionAppShell.tsx` wraps the entire authenticated workspace in a traditional dashboard layout:

```
+---------------------------------------------------------------------------------------+
|  Top Header (CollectionHeader.tsx) - 64px height                                      |
|  [Logo & Dairy Info]  [Shift Badge]         [Sync Badge] [Online Pill] [User] [Logout] |
+---------------------------------------------------------------------------------------+
|  Sidebar (MainNavigation.tsx)  |  Main Content Viewport (<Outlet />)                  |
|  Width: 224px (w-56)           |  Current Route: /collection (CollectionWorkspace)   |
|                                |                                                      |
|  [F1] Milk Collection          |  Row 1:                                              |
|  [F2] Customer Directory       |    Left (7 cols): Camera/RFID Scanner + Dossier      |
|  [F3] Shift Sessions           |    Right (5 cols): Calculation & Save Action         |
|  [F4] Hardware Telemetry       |  Row 2:                                              |
|  [F5] Offline Queue            |    Intake Telemetry & Quality Readings (4 Gauges)    |
|  [F6] Kiosk Settings           |  Row 3:                                              |
|                                |    Shift Intake Journal Table (Recent records)       |
|  [Terminal Kiosk Footer Info]  |                                                      |
+---------------------------------------------------------------------------------------+
|  Bottom Telemetry Strip (MachineHealthBar.tsx) - 40px height                          |
|  Camera | SFace INT8 | RFID Reader | Lactometer | Digital Scale | Cloud Relay | F4 -> |
+---------------------------------------------------------------------------------------+
```

### Critical Flaws in Current Layout Identified by User:
1. **Permanent Left Sidebar consumes 224px (14rem) of horizontal space**, compressing the primary collection inputs, camera view, and financial matrix on 1366x768 and 1080p kiosk screens.
2. **Navigating to secondary features via sidebar or F-keys uses full page route changes (`navigate('/customers')`, etc.)**, which unmounts `CollectionWorkspace` and breaks active unsaved collection workflow!
3. **No direct farmer code / search input on the main collection counter**: Operator is forced to either click "Manual Search (F2)", navigate to `/customers`, select a patron, or use external modals.
4. **Camera and identification controls are isolated in their own card**, causing visual disconnect from customer identity and collection telemetry.
5. **Screen fit issues on 1366x768**: Multiple stacked vertical sections (`CustomerIdentityPanel` + `CustomerDossierCard` + `MeasurementPanel` + `RecentIntakeTable`) cause extensive vertical page scrolling, hiding the "Record Intake" button below the fold on standard kiosk screens!

---

## 2. Existing Component Inventory

### 2.1 Layout Components
| File | Name | Purpose | Current Behavior | Target Transformation |
|---|---|---|---|---|
| `CollectionAppShell.tsx` | Shell Container | Top bar, sidebar, outlet, bottom bar | Houses `<MainNavigation />` sidebar | **Remove `<MainNavigation />` sidebar**. Make main viewport full width. Host F2–F6 modal/overlay layer so collection workspace stays mounted! |
| `CollectionHeader.tsx` | Kiosk Header | Dairy brand, session badge, sync status, online pill, operator profile | Fixed 64px header | Maintain compact, high-density counter header with live dairy name, session, operator, and status. |
| `MainNavigation.tsx` | Left Sidebar | 6 nav items with F1–F6 shortcuts, terminal footer | Permanent left drawer, triggers `navigate(path)` | **Remove as permanent sidebar**. Convert F2–F6 to quick-access action overlays accessible via top bar pills and function keys without route departure. |
| `MachineHealthBar.tsx` | Bottom Strip | Peripheral statuses (YuNet, SFace, RFID, Scale, etc.) | 40px bottom bar, clicks to `/devices` | Maintain streamlined status footer with quick shortcut pills. |

### 2.2 Workspace Components
| File | Name | Purpose | State / Props | Target Transformation |
|---|---|---|---|---|
| `CollectionWorkspace.tsx` | Main Collection Page | Assembles scanner, dossier, calculation, telemetry, journal | Holds `manualCustomer`, `isLookupOpen`, `refreshTxnTrigger` | **Transform into Single-Screen Counter Terminal**. Integrate direct farmer code/mobile keyboard input directly on the main counter. Prevent page navigation on Enter. |
| `CustomerIdentityPanel.tsx` | Scanner & Recognition | Live camera feed, YuNet landmarks canvas, simulation buttons | Integrates `useCamera()`, `useHardware()` | Keep camera / RFID engine intact. Compact scanner presentation with direct farmer code entry field. |
| `CustomerDossierCard.tsx` | Customer Profile Card | Displays patron details, balance, bio score, last intake | Reads `customer: CustomerIdentity \| null` | Seamlessly integrate into Customer Panel. Clearly shows customer name, code, village, balance, category without occupying redundant space. |
| `MilkCategoryToggle.tsx` | Cow / Buffalo Switch | Radio toggles with base rates | Category selection | Keep Cow / Buffalo toggle with base rates, bind to keyboard shortcuts (e.g. 1 / 2 or C / B). |
| `ReadingCard.tsx` | Single Gauge Card | Displays Fat, SNF, CLR, Weight with status pills | Value, unit, status, editable | Maintain crisp, readable digital gauge displays with biological validation colors. |
| `MeasurementPanel.tsx` | Telemetry Grid | 4 gauges (Fat, SNF, CLR, Weight) + Tare & Manual buttons | Interacts with `HardwareContext` | Maintain 4 prominent gauges, Tare scale button, manual override toggle. |
| `TransactionSummaryPanel.tsx` | Calculation & Save | Base rate, calculated rate, volume, net amount, Save Intake button | Computes totals, calls `transactionsApi.submit()` or `localDB.queueOfflineTransaction()` | Keep authoritative formula and strict validation gate lock. Ensure Save button is always accessible without scrolling. |
| `SaveTransactionButton.tsx` | Action Button | Large submit button with lock reason banner | `canSubmit`, `lockReason`, `isSubmitting` | Maintain strict lock conditions and high-visibility state. |
| `RecentIntakeTable.tsx` | Shift Journal | Table of recent collections with sync pills | Reads from `localDB` / API | Fit within main workspace using clean internal scroll container so table never causes outer page overflow. |
| `CustomerLookupModal.tsx` | Patron Search Modal | Search by code, name, mobile; selects customer | Input, search list, `onSelectCustomer` | Reuse as part of F2 overlay and quick-lookup dialog. |

### 2.3 Secondary Module Pages (Targeting F2–F6 Overlays)
| Route / File | Feature | Function Key | Current Implementation | Target Single-Screen Behavior |
|---|---|---|---|---|
| `/customers`<br>`CustomerLookup.tsx` | Customer Directory | **F2** | Separate page with search, filters, table, and `CustomerDetailModal` | Render as **F2 Centered Overlay Modal / Drawer**. On patron selection: close overlay, immediately load patron into active counter, do NOT navigate away! |
| `/sessions`<br>`SessionManagement.tsx` | Shift Sessions | **F3** | Separate page with session summary, open shift, close shift, print summary | Render as **F3 Overlay Modal**. Allows opening/closing shifts and viewing totals without losing collection context. |
| `/devices`<br>`DeviceDiagnostics.tsx` | Hardware Diagnostics | **F4** | Separate page with device cards, poll button, `ReconnectWizard`, `CameraConfigModal` | Render as **F4 Overlay Modal**. Real-time device statuses, reconnection wizards, and camera configs accessible on demand. |
| `/sync`<br>`OfflineQueueView.tsx` | Offline Queue | **F5** | Separate page with offline items table, manual sync button, offline toggle | Render as **F5 Overlay Modal**. View pending offline intakes, trigger sync, review sync errors. |
| `/settings`<br>`SettingsView.tsx` | Kiosk Settings | **F6** | Separate page with tenant details, voice announcer test, DB reset | Render as **F6 Overlay Modal**. Access kiosk configuration without leaving collection screen. |

---

## 3. Existing Keyboard Event Handlers Audit

### 3.1 `MainNavigation.tsx` Keyboard Listener
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Prevent browser default help actions on F1-F6
    if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].includes(e.key)) {
      e.preventDefault()
      const target = NAV_ITEMS.find((item) => item.shortcut === e.key)
      if (target) {
        navigate(target.path)
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [navigate])
```
**Risk Identified**:
- In the current code, pressing F2–F6 calls `navigate('/customers')` etc. This unloads the active `CollectionWorkspace`, destroying in-progress measurements, camera focus, and customer selection.
- Browser default for F5 is page refresh, and F6 is browser URL bar focus. `e.preventDefault()` is used, but if the user is on another route, F5 could reload the page.
- Need a robust overlay manager at the shell level where F2–F6 toggle overlays over the active `CollectionWorkspace`, and `Escape` closes any open overlay to return focus directly to the collection counter.

### 3.2 RFID Reader Keyboard-Wedge Listener (`RfidReaderDriver.ts`)
```typescript
startKeyboardListener(): void {
  if (this.keyboardListenerAttached) return
  this.buffer = ''
  this.lastKeystrokeTime = 0

  this.boundKeyHandler = (e: KeyboardEvent) => {
    const now = Date.now()
    const targetTag = (e.target as HTMLElement)?.tagName?.toUpperCase()

    // Ignore if typing in text inputs UNLESS it's rapid RFID wedge burst (<45ms between keys)
    const isTextInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA'

    if (e.key === 'Enter') {
      if (this.buffer.length >= 8) {
        const elapsed = now - this.lastKeystrokeTime
        // RFID readers deliver characters in rapid succession (< 45ms per keystroke)
        const isRapidBurst = this.buffer.length > 0 && elapsed < 200
        if (isRapidBurst || !isTextInput) {
          const cardUid = this.buffer.trim().toUpperCase()
          this.notifyScan({
            cardUid,
            readerType: 'KEYBOARD_WEDGE',
            timestamp: new Date().toISOString(),
          })
          this.buffer = ''
          if (!isTextInput) {
            e.preventDefault()
          }
          return
        }
      }
      this.buffer = ''
      return
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (this.lastKeystrokeTime > 0 && (now - this.lastKeystrokeTime) > 80) {
        this.buffer = '' // Reset buffer if keystrokes are too slow (manual human typing)
      }
      this.buffer += e.key
      this.lastKeystrokeTime = now
    }
  }

  window.addEventListener('keydown', this.boundKeyHandler)
  this.keyboardListenerAttached = true
}
```
**Key Protection Rule**:
The RFID wedge driver uses an inter-keystroke time threshold (< 80ms) and `< 200ms` burst window to distinguish USB RFID readers from manual human typing.
**The new farmer input field on the main screen must NOT conflict with this listener.**
When an operator types a farmer code manually (e.g. `C-101`) and presses Enter, the manual input handler will look up the customer, whereas a hardware RFID scan will be detected by `RfidReaderDriver` and processed through `onScan()`.

---

## 4. Single-Screen Counter Specification

### Layout Division (Optimized for 1366x768 & 1920x1080)
1. **Compact Kiosk Header (48px)**:
   - DFarm Logo + Cooperative Name + Center Code
   - Shift Badge (Morning / Evening + Session Code)
   - Real-time Sync & Online Pill
   - Quick action pills: `[F2 Customers]` `[F3 Shifts]` `[F4 Hardware]` `[F5 Sync]` `[F6 Settings]`
   - Operator Profile & Logout
2. **Main Counter Workspace (Full Width, Zero Sidebar)**:
   - **Left Panel (5 cols)**:
     - **Prominent Farmer Identification Bar**:
       - Fast keyboard input field: `[ Farmer Code / Mobile / Scan RFID / [Enter] ]`
       - Status badge / Camera toggle
       - Direct result or error banner
     - **Integrated Camera / Biometric Box**:
       - Video feed + YuNet landmark canvas
       - Streamlined height (200px) with SFace INT8 latency pill
       - Quick test buttons: Face C-101, Face C-102, Tap Patil, Supervisor Override
     - **Active Patron Dossier Card**:
       - Farmer name, code, masked mobile, village, balance, bio score, permitted category
   - **Right Panel (7 cols)**:
     - **Top**: Milk Category Selector (Cow ₹38.50/L | Buffalo ₹58.00/L) + Rate Matrix Version
     - **Middle**: Intake Telemetry & Quality Readings (4 Big Digital Gauges: Fat %, SNF %, CLR Density, Net Volume Liters) + Tare Scale button + Manual Override button
     - **Bottom**: Financial Calculation Breakdown (Calculated Rate, Net Value ₹, Patron Balance Projection) + **RECORD INTAKE [ENTER / CTRL+ENTER]** action button
3. **Bottom Lower Area**:
   - **Shift Intake Journal (Real-time local journal)**: Table of intakes with auto-scroll and status indicators
4. **Bottom Telemetry Strip (36px)**:
   - Compact status pills for Camera, SFace, RFID, Analyzer, Scale, Cloud Network

---
**Audit Complete:** All components, routes, and keyboard behaviors verified for Phase 12 single-screen layout transformation.
