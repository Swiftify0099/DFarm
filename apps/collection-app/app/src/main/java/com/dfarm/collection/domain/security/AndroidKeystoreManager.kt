package com.dfarm.collection.domain.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AndroidKeystoreManager {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "DFarmBiometricMasterKey"
        private const val GCM_TAG_LENGTH = 128
        private const val AES_KEY_SIZE = 256
    }

    init {
        ensureMasterKeyExists()
    }

    private fun ensureMasterKeyExists() {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
            )
            val keyGenSpec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(AES_KEY_SIZE)
                .setRandomizedEncryptionRequired(true)
                .build()

            keyGenerator.init(keyGenSpec)
            keyGenerator.generateKey()
        }
    }

    private fun getSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.getKey(KEY_ALIAS, null) as SecretKey
    }

    /**
     * Encrypts face template embedding vector (float array) using AES-256-GCM.
     * Returns: Triple(CiphertextBytes, IVBytes, AuthTagBytes)
     */
    fun encryptEmbedding(embedding: FloatArray): Triple<ByteArray, ByteArray, ByteArray> {
        val buffer = ByteBuffer.allocate(embedding.size * 4)
        for (f in embedding) {
            buffer.putFloat(f)
        }
        val plaintext = buffer.array()

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getSecretKey())
        val iv = cipher.iv
        val ciphertextWithTag = cipher.doFinal(plaintext)

        // In Java GCM, tag is appended to the ciphertext (last 16 bytes = 128 bits)
        val tagLength = GCM_TAG_LENGTH / 8
        val ciphertextLength = ciphertextWithTag.size - tagLength
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextLength)
        val authTag = ciphertextWithTag.copyOfRange(ciphertextLength, ciphertextWithTag.size)

        return Triple(ciphertext, iv, authTag)
    }

    /**
     * Decrypts AES-256-GCM encrypted embedding back to FloatArray.
     */
    fun decryptEmbedding(ciphertext: ByteArray, iv: ByteArray, authTag: ByteArray): FloatArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), spec)

        val combined = ByteArray(ciphertext.size + authTag.size)
        System.arraycopy(ciphertext, 0, combined, 0, ciphertext.size)
        System.arraycopy(authTag, 0, combined, ciphertext.size, authTag.size)

        val decrypted = cipher.doFinal(combined)
        val buffer = ByteBuffer.wrap(decrypted)
        val floats = FloatArray(decrypted.size / 4)
        for (i in floats.indices) {
            floats[i] = buffer.float
        }
        return floats
    }
}

