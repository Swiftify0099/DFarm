# DFARM PHASE 12 — COLLECTION WORKFLOW PRESERVATION MATRIX
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** MAPPING VERIFIED  
**Date:** 2026-11-18  

---

## 1. Feature Preservation Matrix

| Existing Feature | Source Symbol / Hook | Old UI Location | New Single-Screen Location | Preserved Action / Handler |
|---|---|---|---|---|
| **Direct Farmer Search** | `customersApi.list()`, `customersMap` | Only inside modal `CustomerLookupModal.tsx` | **Prominent Farmer Input Bar** on Counter Top-Left | `handleDirectLookup()`: Types code/mobile, presses `Enter`, loads patron directly into counter without page reload |
| **Face Recognition** | `useCamera()`, `yunet-detector.ts`, `sface-embedder.ts` | `CustomerIdentityPanel.tsx` (Card in left column) | **Integrated Biometric Camera Unit** (Left column) | `startCamera()`, `stopCamera()`, requestAnimationFrame loop, YuNet detection canvas |
| **RFID Tap / Scan** | `RfidReaderDriver.ts`, `useHardware()` | `CustomerIdentityPanel.tsx` | **Hardware Reader Handler** + Simulation Buttons | `onScan()` keyboard-wedge listener + `simulateRfidScan()` button |
| **Identity Conflict Check** | `hasIdentityConflict` memo | Top banner in `CollectionWorkspace.tsx` | **Prominent Alert Banner** on Counter Top | Renders warning if Camera != RFID patron; locks Save button; supervisor override button opens F2 directory |
| **Customer Dossier** | `CustomerDossierCard.tsx` | Separate card below scanner | **Patron Identity Dossier** (Left column below scanner) | Renders name, farmer code, masked phone, village, balance, bio score, last delivery |
| **Milk Category Toggle** | `MilkCategoryToggle.tsx` | Inside `TransactionSummaryPanel.tsx` | **Prominent Milk Category Bar** (Top-Right of Counter) | `handleCategorySelect('COW' \| 'BUFFALO')`; updates base rate and recalculates net amount |
| **Rate Matrix Resolution** | `ratesApi.calculateRate()` | Inside `TransactionSummaryPanel.tsx` | **Calculation Engine** (Right column) | Dynamically computes `ratePerLiter` based on Fat, SNF, and category using authoritative formula |
| **Digital Weighing Scale** | `ScaleDriver.ts`, `useHardware()` | `ReadingCard.tsx` in `MeasurementPanel.tsx` | **Big Digital Volume Gauge** (Right column) | Real-time weight in Liters; `Tare Scale (0.00L)` button; scale stability lock indicator |
| **Milk Analyzer (Fat/SNF/CLR)** | `MilkAnalyzerDriver.ts`, `useHardware()` | `ReadingCard.tsx` in `MeasurementPanel.tsx` | **3 Big Digital Quality Gauges** (Fat%, SNF%, CLR) | Real-time optical readings with biological boundary indicators (Green = valid, Red = out of bounds) |
| **Manual Measurements** | `isManualOverride` state | `MeasurementPanel.tsx` header button | **Manual Override Toggle** on Telemetry Header | Enables editing of Fat, SNF, CLR, and Volume with strict validation adherence |
| **Voice Announcer** | `VoiceAnnouncerDriver.ts` | Automatic trigger on match | **Audio Feedback Driver** (Integrated) | Announces patron name on identification; announces recorded intake upon save; 8s debounce preserved |
| **Save Intake Preconditions** | `canSubmit`, `lockReason` | `SaveTransactionButton.tsx` | **Save Intake Action Button** (Bottom-Right of Counter) | Hard validation lock: Session open, Patron identified, Volume > 0, Scale stable, Fat/SNF in bounds |
| **Online Intake Persistence** | `transactionsApi.submit()` | `TransactionSummaryPanel.tsx` | `handleSubmit()` in Main Counter | `POST /collections/transactions` with idempotency key, prints receipt, updates journal |
| **Offline Intake Queue** | `localDB.queueOfflineTransaction()` | `TransactionSummaryPanel.tsx` | `handleSubmit()` in Main Counter | Saves to `dfarm_collection_local_db` IndexedDB when `isNetworkOnline === false`, increments queue count |
| **Thermal Printing** | `printReceipt()`, `ThermalPrinterDriver.ts` | `TransactionSummaryPanel.tsx` | Automatic on `handleSubmit()` | Sends formatted ESC/POS voucher to thermal printer driver or COM port |
| **Shift Intake Journal** | `RecentIntakeTable.tsx` | Bottom full-width card | **Lower Counter Journal Area** (Internal Scroll) | Shows recent intakes for active session with live sync status; auto-refreshes on save |
| **F2 Customer Directory** | `CustomerLookup.tsx` | `/customers` full page route | **F2 Centered Overlay Modal** | Full search, filter, and selection table; selecting loads patron on counter and closes modal |
| **F3 Shift Sessions** | `SessionManagement.tsx` | `/sessions` full page route | **F3 Overlay Modal** | Displays session stats, open new shift modal, conclude shift modal, print summary |
| **F4 Hardware Diagnostics** | `DeviceDiagnostics.tsx` | `/devices` full page route | **F4 Overlay Modal** | Real-time port polling, camera configuration, reconnect wizard |
| **F5 Offline Queue & Sync** | `OfflineQueueView.tsx` | `/sync` full page route | **F5 Overlay Modal** | Table of pending offline records, batch sync trigger, network toggle |
| **F6 Kiosk Settings** | `SettingsView.tsx` | `/settings` full page route | **F6 Overlay Modal** | Dairy tenant details, voice announcer test button, local database reset with confirmation |
| **Escape Key Handling** | `handleKeyDown` in shell | None (Page routes) | **Global Overlay Dismissal** | Closes active F2–F6 modal and refocuses farmer code input on the main counter |

---
**Matrix Confirmed:** 100% of existing functionality is mapped to the single-screen UI layout.
