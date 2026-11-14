# DFarm: Local Data Security & Biometric Cryptographic Protocol

## 1. Threat Model & Security Posture

Edge collection devices (tablets and counter terminals) operate in semi-supervised rural environments where hardware may be lost, stolen, or subjected to tampering. 

To satisfy Indian Digital Personal Data Protection (DPDP) standards and high-assurance financial integrity:
1. **Zero Raw Biometric Storage:** No face images, photos, or raw camera bitmaps are ever written to disk or transmitted over the wire. Only 512-dimensional mathematically normalized biometric embeddings are extracted and stored.
2. **Hardware Keystore AES-256-GCM:** All sensitive biometric embedding vectors and device tokens are encrypted using hardware-backed keys provided by the Android Keystore (`AndroidKeyStore`), utilizing authenticated AES-256-GCM encryption with 128-bit authentication tags.
3. **Application Sandbox & ProGuard/R8:** Local SQLite databases and Keystore entries reside within the private application sandbox (`/data/data/com.dfarm.*/`), inaccessible to third-party apps or non-root users.

---

## 2. Android Keystore AES-256-GCM Implementation

```kotlin
class AndroidKeystoreManager {
    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "DFarmMasterDeviceKey"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, 
                KEYSTORE_PROVIDER
            )
            val spec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()
            keyGenerator.init(spec)
            return keyGenerator.generateKey()
        }
        val entry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry
        return entry.secretKey
    }

    fun encrypt(plainText: ByteArray): EncryptedDataPayload {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv // 12 bytes cryptographic nonce
        val cipherText = cipher.doFinal(plainText) // Includes 16 bytes GCM auth tag
        return EncryptedDataPayload(iv, cipherText)
    }

    fun decrypt(iv: ByteArray, cipherText: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), spec)
        return cipher.doFinal(cipherText)
    }
}
```

---

## 3. Biometric Template Lifecycle & Zero-Photo Guarantee

```
Camera Sensor -> MobileFaceNet Engine -> 512-dim Float Embedding
       │
       ▼
Discard Raw Bitmap Immediately (In-Memory Buffer Zeroed)
       │
       ▼
Android Keystore AES-256-GCM Encryption
       │
       ▼
Local SQLite: cached_face_templates (encrypted_embedding, crypto_nonce, auth_tag)
```

- When downloading from the cloud via `GET /api/v1/sync/pull`, templates are encrypted in-transit (TLS 1.3) and encrypted at rest on the server (`embedding_encrypted` bytea in PostgreSQL).
- When a device is decommissioned or revoked, its device token hash is wiped on the server, and the device is blocked from receiving new biometric records.

---

## 4. Offline Revocation Safety & Freshness Enforcement

A critical security vulnerability in offline systems is the window during which a revoked or soft-deleted farmer could continue to deliver milk or impersonate an identity on a disconnected edge terminal.

DFarm implements the **Offline Revocation Safety Protocol**:

1. **Policy Window:** `max_offline_hours = 72` (default 72 hours, centrally configurable per device).
2. **Freshness Verification:** The `OfflineRevocationGuard` verifies:
   $$\text{CurrentTime} - \text{LastSuccessfulSyncAt} \le \text{MaxOfflineHours}$$
3. **Fail-Closed Behavior:** If the elapsed offline duration exceeds 72 hours:
   - Biometric matching is immediately disabled.
   - The collection terminal transitions to `LOCKED_OFFLINE_EXPIRED` mode.
   - Operators cannot record new intake collections until connectivity is restored and a successful sync cycle completes.
4. **Tombstone Application:** When a customer is deleted in the central system, a tombstone is pushed downstream during the very next sync, immediately deleting the customer's face embedding from the edge device's matching index and revoking RFID card bindings.

---

## 5. Token & Secret Protection

- **Device Bearer Tokens:** The device receives a signed JWT upon registration (`POST /api/v1/devices/register`), stored inside encrypted SharedPreferences backed by MasterKeys/EncryptedSharedPreferences.
- **Server Database:** The server stores `devices.device_token_hash = SHA256(device_token)`, preventing token exposure in the event of database exfiltration.
- **Log Sanitization:** Sensitive PII (Aadhaar numbers, bank accounts, biometric vectors, auth tokens) are marked with `@Redacted` annotations and stripped by Pino log filters.

