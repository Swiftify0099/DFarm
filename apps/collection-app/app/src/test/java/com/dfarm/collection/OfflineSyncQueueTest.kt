package com.dfarm.collection

import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.sync.OfflineSyncQueue
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class OfflineSyncQueueTest {

    private lateinit var queue: OfflineSyncQueue

    @Before
    fun setUp() {
        queue = OfflineSyncQueue(maxOfflineHours = 72)
    }

    @Test
    fun testEnqueueAndPendingVisibility() {
        val session = CollectionSession(
            customerUuid = "c1",
            organizationId = "org1",
            centerId = "cnt1",
            deviceId = "dev1",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13"
        )

        val enqueued = queue.enqueue(session, "{\"weight\": 12.5}")
        assertTrue(enqueued)
        assertEquals(1, queue.getPendingCount())
        assertEquals(SessionState.PENDING_SYNC, session.state)

        val pending = queue.getPendingItems()
        assertEquals(1, pending.size)
        assertEquals(session.sessionUuid, pending.first().sessionUuid)
    }

    @Test
    fun testDuplicateEnqueueIsIdempotentlyIgnored() {
        val session = CollectionSession(
            customerUuid = "c1",
            organizationId = "org1",
            centerId = "cnt1",
            deviceId = "dev1",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13"
        )

        assertTrue(queue.enqueue(session, "{}"))
        assertFalse("Duplicate submission with same idempotency key must return false", queue.enqueue(session, "{}"))
        assertEquals(1, queue.getPendingCount())
    }

    @Test
    fun testMarkSyncedDecreasesPendingCount() {
        val session = CollectionSession(
            customerUuid = "c1",
            organizationId = "org1",
            centerId = "cnt1",
            deviceId = "dev1",
            identificationMethod = IdentificationMethod.RFID,
            milkCategory = MilkCategory.BUFFALO,
            shift = Shift.EVENING,
            businessDate = "2026-11-13"
        )

        queue.enqueue(session, "{}")
        assertEquals(1, queue.getPendingCount())

        queue.markSynced(session.idempotencyReference)
        assertEquals(0, queue.getPendingCount())
    }

    @Test
    fun testOfflineFreshnessExpiry() {
        // Queue configured for 72 hours max offline
        assertFalse(queue.isOfflineExpired())

        // Simulate 75 hours since last sync
        queue.lastSuccessfulSyncTime = System.currentTimeMillis() - (75L * 3600 * 1000)
        assertTrue(queue.isOfflineExpired())
    }

    @Test
    fun testRecoverInterruptedSessionOnAppRestart() {
        val incompleteSession = CollectionSession(
            customerUuid = "c1",
            organizationId = "org1",
            centerId = "cnt1",
            deviceId = "dev1",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13",
            state = SessionState.WAITING_FOR_MEASUREMENTS
        )

        val recovered = queue.recoverInterruptedSession(incompleteSession)
        assertNotNull(recovered)
        assertEquals(SessionState.WAITING_FOR_MEASUREMENTS, recovered?.state)

        val completedSession = incompleteSession.copy(state = SessionState.COMPLETED)
        assertNull("Completed sessions should not be restored as active", queue.recoverInterruptedSession(completedSession))
    }
}
