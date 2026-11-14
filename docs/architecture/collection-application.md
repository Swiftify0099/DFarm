# DFarm Collection Android Application Architecture (`apps/collection-app`)

## 1. Executive Architecture Summary
The DFarm Collection Android Application (`apps/collection-app`) is a native Android application designed specifically for counter-top Android tablets and ruggedized touchscreen kiosks operating at village dairy collection centers. It is engineered with **Kotlin**, **Jetpack Compose**, and **Clean Architecture** patterns, ensuring lightning-fast performance, offline durability, and zero financial ambiguity.

---

## 2. Directory Structure

```
apps/collection-app/
├── app/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── java/com/dfarm/collection/
│       │   │   ├── MainActivity.kt
│       │   │   ├── domain/
│       │   │   │   ├── model/Models.kt
│       │   │   │   ├── statemachine/CollectionStateMachine.kt
│       │   │   │   ├── identification/CustomerIdentificationService.kt
│       │   │   │   ├── measurement/MeasurementProviders.kt
│       │   │   │   ├── pricing/RateCalculationEngine.kt
│       │   │   │   ├── receipt/ReceiptFormatter.kt
│       │   │   │   └── sync/OfflineSyncQueue.kt
│       │   │   └── ui/
│       │   │       ├── screens/Screens.kt
│       │   │       └── theme/Theme.kt
│       │   └── res/
│       │       └── values/ (strings.xml, colors.xml, themes.xml)
│       └── test/java/com/dfarm/collection/
│           ├── CollectionStateMachineTest.kt
│           ├── CustomerIdentificationTest.kt
│           ├── MeasurementValidationTest.kt
│           ├── RateCalculationEngineTest.kt
│           ├── ReceiptFormatterTest.kt
│           └── OfflineSyncQueueTest.kt
├── build.gradle.kts
├── settings.gradle.kts
└── gradlew.bat
```

---

## 3. Core Architectural Layers

### 3.1 Domain Models (`domain/model/Models.kt`)
Contains immutable data classes representing core enterprise concepts:
- `Customer`: Farmer profile, primary center, status, and milk category permissions (`canDeliverCow`, `canDeliverBuffalo`).
- `CollectionSession`: Complete lifecycle state, shift, category, identification method, and idempotency tokens.
- `MilkQualityMeasurement` & `MilkWeightMeasurement`: Validated physical milk measurements with reading sources (`MANUAL_ENTRY`, `HARDWARE_INTERFACE`, `SOFTWARE_SIMULATOR`).
- `RateCalculationResult`: Applied rate version, cell rate per unit, calculated amount, and rule descriptors.
- `CollectionReceipt`: Monospace slip text, SHA-256 payload hash, and metadata.
- `CenterValidationLimits`: Minimum and maximum acceptable thresholds for fat, SNF, and weight.

### 3.2 Collection State Machine (`domain/statemachine/CollectionStateMachine.kt`)
An explicit 16-state finite state machine governing user operations:
- Prevents out-of-order transitions (e.g., cannot take measurements before customer identification and category selection).
- Automatically selects the category when the customer possesses single-category authorization (`COW` or `BUFFALO`).
- Requires operator confirmation when the customer is authorized for `BOTH`.
- Enforces safe session cancellation if category needs modification after creation.

### 3.3 Identification Cascade (`domain/identification/CustomerIdentificationService.kt`)
Coordinates the 3-method identification hierarchy:
1. Face Biometrics (Cosine Similarity $\ge 0.85$ via MobileFaceNet embeddings)
2. RFID Tag Scanning (UID match against active center assignments)
3. Supervisor Manual Selection (Supervisor PIN required, audit event logged)
- Fails closed if the customer is `INACTIVE`, `SUSPENDED`, or soft-deleted.
- Enforces cross-center rejection if the farmer belongs to a different primary collection center.
- Checks offline token freshness (< 72 hours).

### 3.4 Measurement Provider Boundary (`domain/measurement/MeasurementProviders.kt`)
Defines clean software abstraction contracts:
- `MilkQualityProvider`: Reads and validates milk quality (fat %, SNF %, optional CLR).
- `MilkWeightProvider`: Reads and validates net milk quantity in Kilograms (KG).
- **Hardware Deferral Notice:** Physical serial RS-232, load cells, and analyzer protocols are deferred. `ProductionManualQualityProvider` and `ProductionManualWeightProvider` mark all readings as `DEFERRED_HARDWARE_BOUNDARY` to guarantee complete transparency.
- `MeasurementValidationEngine`: Validates biological sanity bounds read dynamically from database configuration.

### 3.5 Exact Rate Calculation Engine (`domain/pricing/RateCalculationEngine.kt`)
- Evaluates approved rate charts and rate chart versions.
- Matches exact `(fat, snf)` grid coordinates.
- Throws controlled `RateCellNotFoundException` when a cell is missing. No rates or interpolation factors are ever invented.

### 3.6 Receipt Formatter (`domain/receipt/ReceiptFormatter.kt`)
- Renders standard 40-column monospace slips suitable for 58mm/80mm thermal printers.
- Computes SHA-256 cryptographic verification digest of the receipt payload.
- Masks customer names for privacy compliance.

### 3.7 Offline Sync Queue & Recovery (`domain/sync/OfflineSyncQueue.kt`)
- Implements durable offline transaction storage.
- Tracks sync attempt count, last failure reasons, and cursor acknowledgements.
- Detects stale authorization (> 72 hours) and halts collection until online sync re-authorization occurs.
- Recovers uncommitted open sessions upon tablet application restart.

---

## 4. UI Layer (`ui/screens/Screens.kt`)
Built with Material 3 Jetpack Compose for high-contrast visibility and fast touch response:
- `LoginScreen`: Operator and device authentication with center selection.
- `DashboardScreen`: Active shift indicators, offline status pill, and quick collection entry.
- `IdentificationScreen`: Interactive camera feed placeholder, RFID card tap detector, and supervisor search.
- `CustomerInfoScreen`: Verified customer profile summary without sensitive PII.
- `CategorySelectionScreen`: Context-aware Cow / Buffalo selection with auto-selection bypass.
- `MeasurementScreen`: High-visibility weight and quality measurement inputs with real-time biological bounds checking.
- `TransactionReviewScreen`: Final rate breakdown and amount confirmation with cancel/proceed controls.
- `ReceiptScreen`: Monospace receipt preview and thermal print trigger.

---

## 5. Verification Status
All unit tests in `apps/collection-app/app/src/test/java/com/dfarm/collection/` compile and pass cleanly via Gradle:
```
BUILD SUCCESSFUL (24 actionable tasks: 24 executed)
100% unit tests passing across all domain components.
```
