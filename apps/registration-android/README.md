# DFarm Customer Registration Android Application (`apps/registration-android`)
**Phase 06 of 20 — Implemented & Verified**

Dedicated native Android application for dairy cooperative registration officers to onboard farmers, validate mobile identity, record milk permissions (Cow/Buffalo/Both), and manage customer records against the authoritative DFarm PostgreSQL ledger.

---

## 1. Features Implemented in Phase 06

- **Officer Authentication & Center Selection**:
  - Secure login against real P05 Express/PostgreSQL endpoints (`POST /api/v1/auth/login`, `GET /api/v1/auth/me`).
  - Active milk collection center selection (`X-Center-ID`).
  - Hardware Keystore-encrypted token storage via `androidx.security.crypto.EncryptedSharedPreferences`.
  - Automatic session invalidation upon receiving HTTP 401 Unauthorized.
- **5-Step Registration Wizard**:
  - **Step 1: Personal Details**: Full Name, Village, Taluka, District, Postal PIN.
  - **Step 2: Mobile Validation**: 10-digit Indian mobile validation with automatic E.164 normalization (`+91XXXXXXXXXX`).
  - **Step 3: Milk Permissions**: Choice cards for Cow only, Buffalo only, or Both (Cow & Buffalo) + optional banking KYC.
  - **Step 4: Review & Consent**: Read-only summary card with officer declaration before ledger commit.
  - **Step 5: Backend Confirmation & Registration Status**: Server-generated canonical UUID (`id`), assigned farmer code (`farmerCode`), `DRAFT` / `IN_PROGRESS` state, and pending next steps dashboard.
- **Customer Management**:
  - Paginated customer list with debounced search across name, mobile number, and farmer code.
  - Quick filter chips for milk categories (`COW`, `BUFFALO`) and statuses (`DRAFT`, `ACTIVE`).
  - Complete customer profile detail screen with KYC verification checklist.
  - Authorized customer profile editing (`PATCH /api/v1/customers/:customerId`) with protected immutable keys.
- **Security & Integrity**:
  - Zero hardcoded API keys or service-role secrets in APK.
  - Handles duplicate mobile conflict (`HTTP 409 DUPLICATE_MOBILE_NUMBER`) with user-friendly error banners.
  - Strict scope enforcement: Biometric Face model inference and Physical RFID hardware integration deferred to Phase 07 and Phase 08.

---

## 2. Technology Stack

- **OS / Target**: Android 7.0+ (Min SDK: 24, Target SDK: 36, Compile SDK: 36)
- **Language**: Kotlin 2.3
- **UI Framework**: Jetpack Compose (Material 3)
- **Navigation**: AndroidX Navigation 3 (`androidx.navigation3`)
- **Networking**: Retrofit 2.11 + OkHttp 4.12 with HttpLoggingInterceptor
- **JSON Serialization**: Kotlinx Serialization JSON 1.7.3
- **Security**: Android Keystore + `androidx.security:security-crypto:1.1.0-alpha06`
- **Testing**: JUnit 4, Kotlinx Coroutines Test, OkHttp MockWebServer

---

## 3. Build & Test Instructions

### Prerequisites
- JDK 17 or JDK 21+ (`java -version`)
- Android SDK platforms `android-34`, `android-35`, or `android-36` with build-tools `35.0.0`
- Configured `local.properties` with `sdk.dir`

### Run Unit Tests
```powershell
cd apps/registration-android
.\gradlew.bat testDebugUnitTest
```
*Executes all 25 unit and MockWebServer API integration tests.*

### Build Debug APK
```powershell
cd apps/registration-android
.\gradlew.bat assembleDebug
```
*Generates debug APK at `app/build/outputs/apk/debug/app-debug.apk`.*

### Install on Connected Device / Emulator
```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Backend Configuration & Ports

When running on the Android Emulator, the app connects to the local development backend on the host machine using:
- **Default Base URL**: `http://10.0.2.2:3000/` (Express API)
- **Physical Device LAN**: Configurable via `ApiClient.setBaseUrl("http://<HOST_IP>:3000/")`

---

## 5. Directory Structure

```
apps/registration-android/app/src/
├── main/
│   ├── AndroidManifest.xml
│   ├── kotlin/com/dfarm/registration/
│   │   ├── MainActivity.kt
│   │   ├── Navigation.kt
│   │   ├── NavigationKeys.kt
│   │   ├── data/
│   │   │   ├── api/
│   │   │   │   ├── ApiClient.kt
│   │   │   │   ├── AuthInterceptor.kt
│   │   │   │   └── DFarmApiService.kt
│   │   │   ├── models/
│   │   │   │   └── ApiModels.kt
│   │   │   ├── repository/
│   │   │   │   ├── AuthRepository.kt
│   │   │   │   └── CustomerRepository.kt
│   │   │   └── storage/
│   │   │       └── SessionManager.kt
│   │   ├── ui/
│   │   │   ├── auth/
│   │   │   │   ├── LoginScreen.kt
│   │   │   │   └── LoginViewModel.kt
│   │   │   ├── components/
│   │   │   │   ├── DisplayComponents.kt
│   │   │   │   └── FormComponents.kt
│   │   │   ├── management/
│   │   │   │   ├── CustomerDetailScreen.kt
│   │   │   │   ├── CustomerDetailViewModel.kt
│   │   │   │   ├── CustomerEditScreen.kt
│   │   │   │   ├── CustomerEditViewModel.kt
│   │   │   │   ├── CustomerListScreen.kt
│   │   │   │   └── CustomerListViewModel.kt
│   │   │   ├── registration/
│   │   │   │   ├── RegistrationWizardScreen.kt
│   │   │   │   └── RegistrationWizardViewModel.kt
│   │   │   └── theme/
│   │   │       ├── Color.kt
│   │   │       ├── Theme.kt
│   │   │       └── Type.kt
│   └── res/
└── test/kotlin/com/dfarm/registration/
    ├── CustomerFormValidationTest.kt
    ├── CustomerRegistrationWizardTest.kt
    └── CustomerRepositoryApiTest.kt
```
