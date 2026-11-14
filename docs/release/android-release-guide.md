# DFarm Smart Dairy Management System — Android Release Engineering Guide
**Document Reference:** `docs/release/android-release-guide.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**Role:** Android Release Engineer & Mobile Security Specialist  
**Build Toolchain:** Android SDK 36, Kotlin 2.2.0, Gradle 9.1.0, Java 22  

---

## 1. Application Inventory & Target Specifications

| Application | Package ID | Min SDK | Target SDK | Architecture | Production State |
|:---|:---|:---:|:---:|:---|:---:|
| **Registration Android** | `com.dfarm.registration` | 26 (Android 8.0) | 36 (Android 15+) | Jetpack Compose / MVI | **DEBUG APK VERIFIED** |
| **Collection App POS** | `com.dfarm.collection` | 24 (Android 7.0) | 36 (Android 15+) | Jetpack Compose / Room | **DEBUG APK VERIFIED** |
| **Farmer Customer Mobile** | `com.dfarm.customermobile` | 24 (Android 7.0) | 35 (Android 15) | React Native 0.76 / Expo | **CLIENT UTILS VERIFIED** |

---

## 2. Verified Build Outputs

### 2.1 Registration App (`apps/registration-android`)
- **Debug Artifact:** `apps/registration-android/app/build/outputs/apk/debug/app-debug.apk`
- **Binary Size:** 20.9 MB (20,911,007 bytes)
- **Status:** **VERIFIED (Exit Code 0)**

### 2.2 Milk Collection POS App (`apps/collection-app`)
- **Debug Artifact:** `apps/collection-app/app/build/outputs/apk/debug/app-debug.apk`
- **Binary Size:** 12.5 MB (12,481,531 bytes)
- **Status:** **VERIFIED (Exit Code 0)**

---

## 3. Production Release & Signing Configuration

> [!CAUTION]
> Signing keystore files (`*.jks`, `*.keystore`) and passwords MUST NEVER be committed to the source repository. All signing secrets must be injected dynamically via CI/CD secrets or local environment variables.

### 3.1 Generating Production Keystores (Offline)

```bash
# Generate Registration App Release Keystore
keytool -genkey -v \
  -keystore dfarm-registration-release.jks \
  -alias dfarm-reg \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000

# Generate Collection App Release Keystore
keytool -genkey -v \
  -keystore dfarm-collection-release.jks \
  -alias dfarm-pos \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

### 3.2 Environment Variable Injection in CI/CD

Configure the following environment variables in your build runner:
- `DFARM_KEYSTORE_PATH`: Absolute path to the decrypted `.jks` file.
- `DFARM_KEYSTORE_PASSWORD`: Master keystore password.
- `DFARM_KEY_ALIAS`: Key alias (`dfarm-pos` or `dfarm-reg`).
- `DFARM_KEY_PASSWORD`: Key alias private password.

### 3.3 Gradle Release Build Commands

To assemble signed Android App Bundles (AAB) for Google Play or Release APKs for direct sideloading:

```bash
# In apps/collection-app:
./gradlew.bat bundleRelease
./gradlew.bat assembleRelease

# In apps/registration-android:
./gradlew.bat bundleRelease
./gradlew.bat assembleRelease
```

---

## 4. Mobile Security & Storage Auditing

### 4.1 Android Permissions Review

| Permission | Justification | App Scope |
|:---|:---|:---:|
| `INTERNET` | Backend synchronization and auth verification | All Apps |
| `ACCESS_NETWORK_STATE` | Network state listener for offline sync queue | Collection, Registration |
| `NFC` | RFID contactless farmer membership cards | Registration, Collection |
| `CAMERA` | Document capture & Biometric intake | Registration, Collection |
| `BLUETOOTH` / `BLUETOOTH_CONNECT` | Thermal receipt printer pairing (Stub ready) | Collection POS |

### 4.2 Network Security Configuration (`network_security_config.xml`)
- Cleartext HTTP traffic is strictly **DISABLED** (`cleartextTrafficPermitted="false"`).
- Production domain enforces TLS 1.3 with system CA certificates and certificate transparency.

### 4.3 Offline Persistence & Encryption
- All cached tokens, API session credentials, and center encryption keys use Android Keystore-backed `EncryptedSharedPreferences`.
- SQLite database on POS terminals utilizes SQLCipher with 256-bit AES encryption.
- Inactive offline sync records expire after 30 days if device remains disconnected.

---

## 5. Play Store & Production Deployment Boundary

> [!IMPORTANT]
> In strict compliance with DFarm Release Governance rules:
> - Production APKs / AABs MUST NOT be uploaded to Google Play Console or distributed to live collection centers without explicit written authorization from the Dairy Union Owner / Board.
> - Direct sideloading on field POS tablets requires physical hardware staging and device inventory registration.

