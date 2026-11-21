# DFARM PHASE 12 — SINGLE-SCREEN UI ARCHITECTURE
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** ARCHITECTURE DESIGN  
**Date:** 2026-11-18  

---

## 1. Architectural Transformation Blueprint

### 1.1 Core Mandate
Eliminate the traditional dashboard sidebar navigation entirely. Transform the interface into an elegant, high-density, keyboard-first **Single-Screen Milk Collection Counter Kiosk**.

> **The Golden Rule**:  
> **ONE SCREEN = COMPLETE FARMER IDENTIFICATION + MILK COLLECTION + CALCULATION + SAVE WORKFLOW.**  
> The operator never leaves the collection workspace to identify a farmer, record readings, or view recent intakes. Secondary operational tools (F2–F6) are accessible as non-destructive overlays that preserve counter state.

---

## 2. Structural Wireframe & Screen Real Estate

```
+===================================================================================================================+
| [DFarm Logo] GOKUL PRIMARY COOPERATIVE (GOKUL-01) | [EVENING SHIFT: SH-20261118-E-KI01] | [ALL SYNCED] [ONLINE]    |
| Quick Access: [F2 Customers] [F3 Shifts] [F4 Telemetry] [F5 Offline] [F6 Settings]   | [Op: Pankaj Yewale] [LogOut]|
+===================================================================================================================+
|                                    MAIN COLLECTION COUNTER WORKSPACE                                              |
| +---------------------------------------------------+ +---------------------------------------------------------+ |
| |  PRIMARY FARMER IDENTIFICATION & BIOMETRICS       | |  MILK CATEGORY, QUALITY TELEMETRY & INTAKE CALCULATION  | |
| |                                                   | |                                                         | |
| | [ Farmer Code / Mobile / Scan RFID / Tap ] [Find] | | [Cow Milk: Base ₹38.50/L] [Buffalo Milk: Base ₹58.00/L] | |
| |                                                   | |                                                         | |
| | +-----------------------------------------------+ | | +-----------------------------------------------------+ | |
| | | LIVE CAMERA / YUNET RETICLE (Compact 200px)   | | | | 4 TELEMETRY GAUGES:                                 | | |
| | | Status: LIVE CAM (60fps) | SFace: 14ms INT8   | | | | [ MILK FAT % ]   [ SNF QUALITY % ]                  | | |
| | | [Start/Stop Cam] [Scan C-101] [Scan C-102]    | | | | [ CLR DENSITY ]  [ NET VOLUME LITERS ]              | | |
| | +-----------------------------------------------+ | | | [Scale: STABLE] [Tare Scale (0.00L)] [Manual Input] | | |
| |                                                   | | +-----------------------------------------------------+ | |
| | +-----------------------------------------------+ | |                                                         | |
| | | IDENTIFIED PATRON DOSSIER CARD                | | | +-----------------------------------------------------+ | |
| | | [Avatar] [Patron Name] [Code: C-101] [ACTIVE] | | | | FINANCIAL BREAKDOWN & SAVE ACTION                   | | |
| | | Village: Sangrul  | Mobile: +91 9822******    | | | | Calculated Rate: ₹ 38.50 / L                        | | |
| | | Ledger: ₹ 1,450.00 | Bio Score: 98.4% Match   | | | | Net Intake Value: ₹ 481.25                          | | |
| | +-----------------------------------------------+ | | | [ RECORD INTAKE (ENTER / CTRL+ENTER) ] (LOCKED/READY) | | |
| +---------------------------------------------------+ | +-----------------------------------------------------+ | |
|                                                       +---------------------------------------------------------+ |
| +---------------------------------------------------------------------------------------------------------------+ |
| | SHIFT INTAKE JOURNAL (Real-time local records - Internal Scroll, Zero Outer Page Overflow)                    | |
| | Time | Txn ID | Patron Code & Name | Category | Liters | Fat% / SNF% | Rate/L | Total ₹ | Sync Status         | |
| +---------------------------------------------------------------------------------------------------------------+ |
+===================================================================================================================+
| TELEMETRY STRIP: Cam: OK | SFace: 14ms | RFID: COM3 | Lactometer: OK | Digital Scale: STABLE | Relay: 32ms | [F4]     |
+===================================================================================================================+
```

---

## 3. Detailed Component Mapping

### 3.1 Shell Container (`CollectionAppShell.tsx`)
- **Old Structure**: Rendered `<MainNavigation />` as a permanent `<aside className="w-56">` on the left.
- **New Structure**:
  - Main container is full width (`w-full`).
  - Contains an **Overlay Modal Manager** that conditionally renders F2–F6 dialogs:
    - `F2`: `CustomerDirectoryOverlay`
    - `F3`: `ShiftSessionsOverlay`
    - `F4`: `HardwareDiagnosticsOverlay`
    - `F5`: `OfflineQueueOverlay`
    - `F6`: `KioskSettingsOverlay`
  - Global `keydown` listener intercepts F2–F6 and `Escape`.
  - While an overlay is open, `Escape` or clicking backdrop closes it and restores focus to the collection input.
  - The counter workspace (`CollectionWorkspace`) **remains mounted at all times**; active camera streams, Web Serial listeners, scale measurements, and patron state are never unmounted or lost!

### 3.2 Top Header (`CollectionHeader.tsx`)
- Maintains a compact 48px height with zero visual clutter.
- Surfaces active dairy identity, shift badge, online status pill, and offline queue count.
- Adds an inline **Keyboard Shortcut Ribbon**:
  - `[F2] Customers`
  - `[F3] Shifts`
  - `[F4] Telemetry`
  - `[F5] Offline`
  - `[F6] Settings`
- Operators can click any pill or press the corresponding function key.

### 3.3 Main Collection Counter Workspace (`CollectionWorkspace.tsx`)
Split into a balanced two-column counter layout:
1. **Left Panel: Customer Identification & Identity Dossier**
   - **Farmer Direct Code Input**:
     - Fast `<input>` with auto-focus.
     - Supports: Farmer Code (e.g. `C-101`), mobile number, RFID card UID, or barcode scan.
     - Pressing `Enter` executes direct lookup:
       - If found: immediately sets `activeCustomer`, speaks customer name via `VoiceAnnouncerDriver`, updates preferred milk category, and moves focus to the milk category or intake volume.
       - If multiple or unknown: displays clear inline error or prompts for F2 manual directory.
       - **Zero page navigation, zero new browser tabs.**
   - **Camera / Biometric Unit**:
     - Video feed and OpenCV YuNet 5-point landmark overlay.
     - Toggleable camera start/stop button.
     - Simulation buttons for quick counter testing (`C-101`, `C-102`, `Patil RFID`).
   - **Customer Dossier Card**:
     - Full patron profile rendered directly below scanner: Patron Name, Farmer Code, Village, Masked Phone, Pending Balance, Biometric Score, Last Delivery info.
2. **Right Panel: Milk Quality, Rate Matrix & Save Action**
   - **Milk Category Selector**: Cow Milk vs Buffalo Milk with base rate tags.
   - **Intake Telemetry & Quality Readings**:
     - 4 high-contrast claymorphic digital gauges:
       - `Milk Fat %` (Green if 2.0% - 15.0%, Red if out of bounds)
       - `SNF Quality %` (Green if 6.0% - 12.0%, Red if out of bounds)
       - `CLR Density` (Lactometer reading)
       - `Net Volume Liters` (Digital scale reading with stability indicator)
     - Tare Scale button and manual input toggle.
   - **Calculation & Save Area**:
     - Authoritative calculation: Base Rate, Applied Rate per Liter, Volume, Net Amount ₹.
     - Patron balance projection: Current balance + Intake value = Updated balance.
     - **Save Intake Action Button**:
       - Green/Orange when all preconditions met.
       - Locked with explanatory banner when preconditions are pending.
       - On save: Persists online or queues offline, triggers thermal receipt print, refreshes shift journal, speaks confirmation, and clears counter for next farmer.
3. **Bottom Lower Area: Shift Intake Journal**
   - High-density table of all shift intakes with internal scrolling (`max-h-56 overflow-y-auto`).
   - Shows time, txn code, farmer, milk type, liters, fat/snf, rate, total amount, and cloud sync status.

---

## 4. Viewport & Screen Fit Optimization (1366x768 & 1920x1080)

To guarantee the entire collection counter fits on standard 1366x768 kiosk screens without requiring page scrolling to see the Save button:
- Top Header: 48px fixed.
- Main Counter Grid: Flexible, compact paddings (`p-3 md:p-4`).
- Camera Box: 180px–220px height with crisp aspect ratio.
- Reading Cards: High-density digital typography.
- Shift Journal: Contained in an internal scrollable container (`max-h-48` to `max-h-64`).
- Telemetry Strip: 32px fixed.
- **Zero unwanted horizontal or vertical outer page overflow.**

---
**Architecture Approved for Implementation.**
