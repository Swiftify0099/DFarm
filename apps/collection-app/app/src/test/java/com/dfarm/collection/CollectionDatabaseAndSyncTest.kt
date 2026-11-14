package com.dfarm.collection

import com.dfarm.collection.domain.storage.*
import com.dfarm.collection.domain.sync.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.UUID

class CollectionDatabaseAndSyncTest {

    private lateinit var database: InMemoryCollectionDatabase
    private lateinit var revocationGuard: OfflineRevocationGuard
    private lateinit var syncEngine: DFarmSyncEngine

    @Before
    fun setUp() {
        database = InMemoryCollectionDatabase()
        revocationGuard = OfflineRevocationGuard(database, maxOfflineHours = 72)
        syncEngine = DFarmSyncEngine(database, revocationGuard)
    }

    @Test
    fun testCollectionTransactionLocalPersistenceAndJournal() {
        val session = LocalCollectionSession(
            sessionId = UUID.randomUUID().toString(),
            customerId = "CUST-101",
            centerId = "CENTER-01",
            deviceId = "DEV-01",
            businessDate = "2026-11-14",
            shiftType = "MORNING",
            milkCategory = "COW",
            identificationMethod = "FACE",
            intakeSequenceUuid = UUID.randomUUID().toString(),
            sessionState = "COMPLETED"
        )
        database.saveCollectionSession(session)

        val collection = LocalMilkCollection(
            collectionId = UUID.randomUUID().toString(),
            sessionId = session.sessionId,
            customerId = session.customerId,
            centerId = session.centerId,
            businessDate = session.businessDate,
            shiftType = session.shiftType,
            milkCategory = session.milkCategory,
            netWeight = 32.4,
            fatPercentage = 4.5,
            snfPercentage = 8.8,
            appliedRatePerUnit = 42.0,
            totalAmount = 1360.80,
            idempotencyKey = "IDEMP-COL-001"
        )

        val payloadJson = "{\"weight\":32.4,\"fat\":4.5,\"total\":1360.80}"
        val saved = database.saveMilkCollectionAndEnqueueSync(collection, collection.idempotencyKey, payloadJson)
        assertTrue("Collection must be saved atomically", saved)

        val pending = database.getPendingJournalEvents()
        assertEquals(1, pending.size)
        assertEquals("IDEMP-COL-001", pending[0].idempotencyKey)
        assertEquals("PENDING_SYNC", pending[0].syncStatus)
    }

    @Test
    fun testOfflineRevocationGuardFailClosedWhenExpired() {
        val customer = CachedCustomer(
            customerId = "CUST-AUTH-1",
            farmerCode = "F-101",
            fullName = "Ramesh Pawar",
            mobileNumber = "9822112233",
            primaryCenterId = "CENTER-01",
            status = "ACTIVE"
        )
        database.saveCustomer(customer)

        // 1. Fresh sync within 72 hours -> Authorized
        database.setLastSyncTimestamp(System.currentTimeMillis() - (10L * 3600 * 1000))
        assertTrue("Recent sync should be authorized", revocationGuard.isAuthorizationValid())
        assertTrue("Customer should be authorized", revocationGuard.isCustomerAuthorized("CUST-AUTH-1"))

        // 2. Offline for 75 hours (> 72 hours max) -> Fails closed
        database.setLastSyncTimestamp(System.currentTimeMillis() - (75L * 3600 * 1000))
        assertFalse("Expired sync window must fail closed", revocationGuard.isAuthorizationValid())

        try {
            revocationGuard.assertAuthorizationValid()
            fail("Must throw OfflineAuthorizationExpiredException when expired")
        } catch (e: OfflineAuthorizationExpiredException) {
            assertTrue(e.message?.contains("expired") == true)
        }
    }

    @Test
    fun testSoftDeleteTombstonePurgesCustomerAndFaceTemplate() {
        val customerId = "CUST-TOMBSTONE-1"
        val customer = CachedCustomer(
            customerId = customerId,
            farmerCode = "F-999",
            fullName = "Ankush Jadhav",
            mobileNumber = "9823456789",
            primaryCenterId = "CENTER-01",
            status = "ACTIVE"
        )
        database.saveCustomer(customer)

        val template = CachedFaceTemplate(
            id = "FACE-TPL-1",
            customerId = customerId,
            cryptoNonce = "iv123",
            authTag = "tag123",
            encryptedEmbedding = "encBase64",
            status = "ACTIVE"
        )
        database.saveFaceTemplate(template)

        assertEquals(1, database.getActiveFaceTemplates().size)

        // Apply downstream tombstone
        val tombstone = RevocationTombstone(
            tombstoneId = "TOMB-1",
            entityType = "CUSTOMER",
            entityId = customerId,
            reason = "Farmer left cooperative",
            revokedAt = System.currentTimeMillis()
        )
        revocationGuard.applyRevocationTombstone(tombstone)

        // Customer must be marked REVOKED
        val updatedCust = database.getCustomer(customerId)
        assertNotNull(updatedCust)
        assertEquals("REVOKED", updatedCust?.status)
        assertTrue(updatedCust?.isDeleted == true)
        assertTrue(updatedCust?.isRevoked == true)

        // Biometric face index MUST be purged
        val activeTemplates = database.getActiveFaceTemplates()
        assertTrue("Revoked customer must be purged from active face matching index", activeTemplates.isEmpty())
        assertFalse("Revoked customer must not be authorized", revocationGuard.isCustomerAuthorized(customerId))
    }

    @Test
    fun testUpstreamPushSyncIdempotency() = runBlocking {
        val colId = UUID.randomUUID().toString()
        val idempotencyKey = "IDEMP-PUSH-1"
        val collection = LocalMilkCollection(
            collectionId = colId,
            sessionId = UUID.randomUUID().toString(),
            customerId = "CUST-1",
            centerId = "CENTER-01",
            businessDate = "2026-11-14",
            shiftType = "MORNING",
            milkCategory = "COW",
            netWeight = 20.0,
            fatPercentage = 4.0,
            snfPercentage = 8.5,
            appliedRatePerUnit = 40.0,
            totalAmount = 800.0,
            idempotencyKey = idempotencyKey
        )
        database.saveMilkCollectionAndEnqueueSync(collection, idempotencyKey, "{}")

        assertEquals(1, database.getPendingJournalEvents().size)

        // Mock backend push response
        val mockPoster: suspend (String, String) -> Pair<Int, String?> = { _, _ ->
            val pendingEventId = database.getPendingJournalEvents().first().eventId
            val resp = """
                {
                    "success": true,
                    "data": {
                        "applied": 1,
                        "results": [
                            {
                                "eventId": "$pendingEventId",
                                "status": "COMMITTED"
                            }
                        ]
                    }
                }
            """.trimIndent()
            Pair(200, resp)
        }

        val pushed = syncEngine.pushPendingJournal("DEV-01", "CENTER-01", mockPoster)
        assertEquals(1, pushed)
        assertTrue("Pending journal should be empty after sync", database.getPendingJournalEvents().isEmpty())
    }

    @Test
    fun testDownstreamPullIncrementalSyncAndCursorAdvance() = runBlocking {
        val custId = UUID.randomUUID().toString()

        val mockGetter: suspend (String) -> Pair<Int, String?> = { url ->
            val resp = """
                {
                    "success": true,
                    "data": {
                        "customers": [
                            {
                                "id": "$custId",
                                "farmerCode": "F-888",
                                "fullName": "Sambhaji Kadam",
                                "mobilePhone": "9811223344",
                                "primaryCenterId": "CENTER-01",
                                "status": "ACTIVE"
                            }
                        ],
                        "rateCards": [
                            {
                                "id": "RATE-1",
                                "rateChartVersionId": "RCV-1",
                                "fatPercentage": 4.5,
                                "snfPercentage": 8.5,
                                "ratePerUnit": 41.50
                            }
                        ],
                        "faceTemplates": [
                            {
                                "id": "FACE-1",
                                "customerId": "$custId",
                                "cryptoNonce": "iv_test",
                                "authTag": "tag_test",
                                "encryptedEmbedding": "ciphertext_test",
                                "status": "ACTIVE"
                            }
                        ],
                        "tombstones": [],
                        "nextCursor": 1,
                        "nextTombstoneCursor": 0
                    }
                }
            """.trimIndent()
            Pair(200, resp)
        }

        var ackCalled = false
        val mockPoster: suspend (String, String) -> Pair<Int, String?> = { url, _ ->
            if (url == "/api/v1/sync/acknowledge") {
                ackCalled = true
            }
            Pair(200, "{\"success\": true}")
        }

        val summary = syncEngine.pullDownstreamUpdates("CENTER-01", mockGetter, mockPoster)
        assertTrue(summary.isSuccess)
        assertEquals(1, summary.pulledCustomersCount)
        assertEquals(1, summary.pulledTemplatesCount)
        assertEquals(1, summary.pulledRatesCount)
        assertTrue("Server cursor must be acknowledged", ackCalled)

        // Verify stored in DB
        val cust = database.getCustomer(custId)
        assertNotNull(cust)
        assertEquals("Sambhaji Kadam", cust?.fullName)

        val rate = database.getApplicableRate(4.5, 8.5)
        assertEquals(41.50, rate ?: 0.0, 0.001)

        val cursors = database.getServerCursors()
        assertEquals(1L, cursors.first)
    }

    @Test
    fun testDeviceRevocationFailsClosed() = runBlocking {
        val mockGetter: suspend (String) -> Pair<Int, String?> = { _ ->
            Pair(403, "{\"error\":\"DEVICE_REVOKED\"}")
        }
        val mockPoster: suspend (String, String) -> Pair<Int, String?> = { _, _ ->
            Pair(403, "{\"error\":\"DEVICE_REVOKED\"}")
        }

        try {
            syncEngine.pullDownstreamUpdates("CENTER-01", mockGetter, mockPoster)
            fail("Must throw DeviceRevokedException on 403")
        } catch (e: DeviceRevokedException) {
            assertTrue(e.message?.contains("revoked") == true)
        }
    }
}
