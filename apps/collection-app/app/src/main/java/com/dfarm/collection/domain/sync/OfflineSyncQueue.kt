package com.dfarm.collection.domain.sync

import com.dfarm.collection.domain.model.CollectionSession
import com.dfarm.collection.domain.model.SessionState

data class QueuedSyncItem(
    val id: String,
    val sessionUuid: String,
    val idempotencyKey: String,
    val payloadJson: String,
    val enqueuedAt: Long = System.currentTimeMillis(),
    var retryCount: Int = 0,
    var isSynced: Boolean = false,
    var syncedAt: Long? = null,
    var lastError: String? = null
)

class OfflineSyncQueue(
    private val maxOfflineHours: Long = 72,
    var lastSuccessfulSyncTime: Long = System.currentTimeMillis()
) {
    private val queue = mutableListOf<QueuedSyncItem>()
    private val processedIdempotencyKeys = mutableSetOf<String>()

    fun enqueue(session: CollectionSession, payloadJson: String): Boolean {
        // Enforce idempotency: prevent duplicate queueing
        if (processedIdempotencyKeys.contains(session.idempotencyReference)) {
            return false
        }
        val item = QueuedSyncItem(
            id = java.util.UUID.randomUUID().toString(),
            sessionUuid = session.sessionUuid,
            idempotencyKey = session.idempotencyReference,
            payloadJson = payloadJson
        )
        queue.add(item)
        processedIdempotencyKeys.add(session.idempotencyReference)
        session.state = SessionState.PENDING_SYNC
        return true
    }

    fun getPendingItems(): List<QueuedSyncItem> {
        return queue.filter { !it.isSynced }
    }

    fun markSynced(idempotencyKey: String) {
        queue.find { it.idempotencyKey == idempotencyKey }?.let {
            it.isSynced = true
            it.syncedAt = System.currentTimeMillis()
        }
        lastSuccessfulSyncTime = System.currentTimeMillis()
    }

    fun markFailed(idempotencyKey: String, error: String) {
        queue.find { it.idempotencyKey == idempotencyKey }?.let {
            it.retryCount++
            it.lastError = error
        }
    }

    fun getPendingCount(): Int {
        return queue.count { !it.isSynced }
    }

    fun isOfflineExpired(): Boolean {
        val elapsedHours = (System.currentTimeMillis() - lastSuccessfulSyncTime) / (1000 * 3600)
        return elapsedHours > maxOfflineHours
    }

    /**
     * Tablet application restart during active session recovery:
     * Recovers incomplete active sessions from local store so uncommitted transactions
     * are never silently lost.
     */
    fun recoverInterruptedSession(savedSession: CollectionSession?): CollectionSession? {
        if (savedSession == null) return null
        return if (savedSession.state in listOf(
            SessionState.SESSION_CREATED,
            SessionState.WAITING_FOR_MEASUREMENTS,
            SessionState.MEASUREMENTS_RECEIVED,
            SessionState.READY_FOR_REVIEW
        )) {
            savedSession
        } else {
            null
        }
    }
}
