package com.dfarm.collection.domain.sync

import com.dfarm.collection.domain.storage.ICollectionDatabase
import com.dfarm.collection.domain.storage.RevocationTombstone

class OfflineAuthorizationExpiredException(message: String) : SecurityException(message)
class DeviceRevokedException(message: String) : SecurityException(message)

class OfflineRevocationGuard(
    private val database: ICollectionDatabase,
    var maxOfflineHours: Long = 72
) {

    /**
     * Checks whether the tablet's offline authorization window is valid.
     * Enforces fail-closed security: if the last successful sync with central cloud
     * exceeds maxOfflineHours (default 72h), all active transactions & biometric
     * matchings are strictly blocked.
     */
    fun isAuthorizationValid(): Boolean {
        val lastSync = database.getLastSyncTimestamp()
        if (lastSync == 0L) {
            // Uninitialized or freshly provisioned - allow initial sync window
            return true
        }
        val elapsedMillis = System.currentTimeMillis() - lastSync
        val elapsedHours = elapsedMillis / (1000 * 3600)
        return elapsedHours <= maxOfflineHours
    }

    /**
     * Asserts authorization validity. Throws fail-closed security exception if expired.
     */
    fun assertAuthorizationValid() {
        if (!isAuthorizationValid()) {
            val lastSync = database.getLastSyncTimestamp()
            val elapsedHours = (System.currentTimeMillis() - lastSync) / (1000 * 3600)
            throw OfflineAuthorizationExpiredException(
                "Offline authorization window expired ($elapsedHours hours since last central cloud sync, max allowed: $maxOfflineHours hours). Central cloud connectivity required to re-authorize tablet."
            )
        }
    }

    /**
     * Applies a downstream revocation tombstone:
     * - Inactivates customer record
     * - Deletes customer face embedding from local recognition index
     * - Marks tombstone as applied locally
     */
    fun applyRevocationTombstone(tombstone: RevocationTombstone) {
        database.applyTombstone(tombstone)
    }

    /**
     * Checks if a specific customer is active and not revoked/deleted.
     */
    fun isCustomerAuthorized(customerId: String): Boolean {
        assertAuthorizationValid()
        val customer = database.getCustomer(customerId) ?: return false
        return customer.status == "ACTIVE" && !customer.isDeleted && !customer.isRevoked
    }
}

