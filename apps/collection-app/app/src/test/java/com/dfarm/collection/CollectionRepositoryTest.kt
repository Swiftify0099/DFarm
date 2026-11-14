package com.dfarm.collection

import com.dfarm.collection.data.api.ApiClient
import com.dfarm.collection.data.models.*
import com.dfarm.collection.data.repository.CollectionRepository
import com.dfarm.collection.data.storage.InMemorySessionManager
import com.dfarm.collection.domain.identification.IdentificationResult
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.storage.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.UUID

class CollectionRepositoryTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var sessionManager: InMemorySessionManager
    private lateinit var database: InMemoryCollectionDatabase
    private lateinit var repository: CollectionRepository

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        sessionManager = InMemorySessionManager()
        database = InMemoryCollectionDatabase()

        val baseUrl = mockWebServer.url("/").toString()
        val apiService = ApiClient.createService(baseUrl, sessionManager)

        repository = CollectionRepository(
            apiService = apiService,
            sessionManager = sessionManager,
            database = database
        )
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    @Test
    fun testLoginSuccessAndSaveSession() = runBlocking {
        val loginJson = """
            {
                "success": true,
                "token": "test-jwt-token-xyz",
                "officer": {
                    "id": "officer-uuid-001",
                    "email": "ramesh@dfarm.local",
                    "fullName": "Ramesh Patil",
                    "role": "COLLECTION_OFFICER",
                    "organizationId": "org-sangli-01",
                    "centerId": "center-tasgaon-01",
                    "assignedCenters": [
                        {
                            "centerId": "center-tasgaon-01",
                            "centerName": "Tasgaon Center",
                            "centerCode": "TAS01"
                        }
                    ]
                }
            }
        """.trimIndent()

        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(loginJson))

        val result = repository.login("ramesh@dfarm.local", "securePass123")
        assertTrue("Login should succeed", result.isSuccess)

        val officer = result.getOrNull()
        assertNotNull(officer)
        assertEquals("Ramesh Patil", officer?.fullName)
        assertTrue(sessionManager.isLoggedIn())
        assertEquals("test-jwt-token-xyz", sessionManager.getToken())
        assertEquals("center-tasgaon-01", sessionManager.getActiveCenterId())
        assertEquals("Tasgaon Center", sessionManager.getActiveCenterName())
    }

    @Test
    fun testLoginInvalidCredentials() = runBlocking {
        val errorJson = """
            {
                "success": false,
                "message": "Invalid email or password"
            }
        """.trimIndent()

        mockWebServer.enqueue(MockResponse().setResponseCode(401).setBody(errorJson))

        val result = repository.login("wrong@dfarm.local", "badpass")
        assertTrue("Login should fail for invalid credentials", result.isFailure)
        assertFalse(sessionManager.isLoggedIn())
    }

    @Test
    fun testFaceRecognitionFailSafeRejection() {
        // Production face model artifact is unverified (STAGING_UNVERIFIED).
        // The repository MUST immediately reject automatic matching and fail-safe to RFID or Manual.
        val result = repository.identifyByFace()
        assertTrue("Face identification must fail-safe", result is IdentificationResult.Failure)
        val failure = result as IdentificationResult.Failure
        assertEquals("CALIBRATION_NOT_APPROVED", failure.errorCode)
        assertTrue(failure.reason.contains("STAGING_UNVERIFIED"))
    }

    @Test
    fun testRfidIdentificationOnlineSuccess() = runBlocking {
        // Set logged-in session
        sessionManager.saveSession(
            "dummy-token",
            OfficerProfile(
                id = "off-1",
                email = "op@dfarm.local",
                fullName = "Operator",
                role = "OFFICER",
                organizationId = "org-1",
                centerId = "center-tasgaon-01"
            )
        )

        val rfidResponseJson = """
            {
                "success": true,
                "data": {
                    "success": true,
                    "customerUuid": "cust-uuid-patil-001",
                    "method": "RFID",
                    "customer": {
                        "id": "cust-uuid-patil-001",
                        "fullName": "Pandurang Patil",
                        "farmerCode": "FARMER-001",
                        "status": "ACTIVE",
                        "permittedCategories": ["COW", "BUFFALO"]
                    }
                }
            }
        """.trimIndent()

        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(rfidResponseJson))

        val result = repository.identifyByRfid("E28011606000020475E8D354")
        assertTrue("RFID identification must succeed", result is IdentificationResult.Success)

        val success = result as IdentificationResult.Success
        assertEquals("cust-uuid-patil-001", success.canonicalUuid)
        assertEquals("Pandurang Patil", success.customer.fullName)
        assertEquals("FARMER-001", success.customer.farmerCode)
        assertEquals(IdentificationMethod.RFID, success.method)
        assertEquals(2, success.customer.permittedCategories.size)
    }

    @Test
    fun testRfidIdentificationOfflineFallback() = runBlocking {
        // Pre-populate offline database
        val cached = CachedCustomer(
            customerId = "cust-offline-uuid-002",
            farmerCode = "FARMER-002",
            fullName = "Tanaji Ghorpade",
            primaryCenterId = "center_default",
            mobileNumber = "+919876543211",
            status = "ACTIVE",
            permittedCategories = listOf("BUFFALO"),
            rfidCardId = "E28011606000020475E8D999"
        )
        database.saveCustomer(cached)

        // Offline: session is not logged in or server fails
        val result = repository.identifyByRfid("E28011606000020475E8D999")
        assertTrue("Offline RFID should resolve from local database", result is IdentificationResult.Success)

        val success = result as IdentificationResult.Success
        assertEquals("cust-offline-uuid-002", success.canonicalUuid)
        assertEquals("Tanaji Ghorpade", success.customer.fullName)
        assertEquals(listOf(MilkCategory.BUFFALO), success.customer.permittedCategories)
    }

    @Test
    fun testRfidIdentificationNotFound() = runBlocking {
        val result = repository.identifyByRfid("UNKNOWN-CARD-12345")
        assertTrue("Unknown RFID should fail", result is IdentificationResult.Failure)
        val failure = result as IdentificationResult.Failure
        assertEquals("RFID_NOT_FOUND", failure.errorCode)
    }

    @Test
    fun testSupervisorManualVerificationRejectsShortJustification() = runBlocking {
        val result = repository.verifyBySupervisor(
            targetCustomerUuid = "cust-1",
            reasonCategory = "FARMER_REQUEST",
            justificationNotes = "no" // < 5 chars
        )
        assertTrue(result is IdentificationResult.Failure)
        val failure = result as IdentificationResult.Failure
        assertEquals("SUPERVISOR_AUTH_REQUIRED", failure.errorCode)
    }

    @Test
    fun testSupervisorManualVerificationOnlineSuccess() = runBlocking {
        sessionManager.saveSession(
            "dummy-token",
            OfficerProfile(
                id = "off-1",
                email = "op@dfarm.local",
                fullName = "Operator",
                role = "SUPERVISOR",
                organizationId = "org-1",
                centerId = "center-tasgaon-01"
            )
        )

        val verifyResponseJson = """
            {
                "success": true,
                "data": {
                    "success": true,
                    "customerUuid": "cust-uuid-manual-003",
                    "method": "SUPERVISOR_MANUAL",
                    "customer": {
                        "id": "cust-uuid-manual-003",
                        "fullName": "Deepak Shinde",
                        "farmerCode": "FARMER-003",
                        "status": "ACTIVE",
                        "permittedCategories": ["COW"]
                    }
                }
            }
        """.trimIndent()

        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(verifyResponseJson))

        val result = repository.verifyBySupervisor(
            targetCustomerUuid = "cust-uuid-manual-003",
            reasonCategory = "CAMERA_FAILURE",
            justificationNotes = "Customer forgot RFID card and camera unverified"
        )

        assertTrue(result is IdentificationResult.Success)
        val success = result as IdentificationResult.Success
        assertEquals("cust-uuid-manual-003", success.canonicalUuid)
        assertEquals("Deepak Shinde", success.customer.fullName)
        assertEquals(IdentificationMethod.SUPERVISOR_MANUAL, success.method)
    }

    @Test
    fun testCalculateRateOnlineAuthoritative() = runBlocking {
        sessionManager.saveSession(
            "dummy-token",
            OfficerProfile(
                id = "off-1",
                email = "op@dfarm.local",
                fullName = "Operator",
                role = "OFFICER",
                organizationId = "org-1",
                centerId = "center-tasgaon-01"
            )
        )

        val rateResponseJson = """
            {
                "success": true,
                "data": {
                    "rateVersionId": "rv-cow-2026",
                    "rateVersionNumber": 2,
                    "rateChartId": "rc-standard-cow",
                    "appliedRate": 44.50,
                    "quantity": 25.500,
                    "totalAmount": 1134.75,
                    "calculationRule": "MATRIX_EXACT_MATCH",
                    "roundingMode": "HALF_EVEN_2_DECIMALS"
                }
            }
        """.trimIndent()

        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(rateResponseJson))

        val rateResult = repository.calculateRate(
            milkCategory = MilkCategory.COW,
            fat = 4.5,
            snf = 8.8,
            netWeight = 25.500
        )

        assertTrue("Online rate calculation should succeed", rateResult.isSuccess)
        val data = rateResult.getOrNull()
        assertNotNull(data)
        assertEquals(44.50, data!!.appliedRate, 0.001)
        assertEquals(25.500, data.quantity, 0.001)
        assertEquals(1134.75, data.totalAmount, 0.001)
        assertEquals("MATRIX_EXACT_MATCH", data.calculationRule)
    }

    @Test
    fun testCalculateRateOfflineFallback() = runBlocking {
        // Insert rate cells in local database
        database.saveRateCell(
            CachedRateCell(
                id = UUID.randomUUID().toString(),
                rateChartVersionId = "v1",
                fatPercentage = 4.5,
                snfPercentage = 8.8,
                ratePerUnit = 42.0
            )
        )

        val rateResult = repository.calculateRate(
            milkCategory = MilkCategory.COW,
            fat = 4.5,
            snf = 8.8,
            netWeight = 20.0
        )

        assertTrue(rateResult.isSuccess)
        val data = rateResult.getOrNull()
        assertNotNull(data)
        assertEquals(42.0, data!!.appliedRate, 0.001)
        assertEquals(840.0, data.totalAmount, 0.001)
    }

    @Test
    fun testCommitMilkCollectionOnlineAtomic() = runBlocking {
        sessionManager.saveSession(
            "dummy-token",
            OfficerProfile(
                id = "off-1",
                email = "op@dfarm.local",
                fullName = "Ramesh Patil",
                role = "OFFICER",
                organizationId = "org-1",
                centerId = "center-tasgaon-01"
            )
        )

        val customer = Customer(
            id = "cust-uuid-001",
            organizationId = "org-1",
            primaryCenterId = "center-tasgaon-01",
            farmerCode = "FARMER-001",
            fullName = "Pandurang Patil",
            mobileNumber = "+919876543210",
            status = CustomerStatus.ACTIVE,
            permittedCategories = listOf(MilkCategory.COW)
        )

        // 1. Session create response
        val createSessionJson = """
            {
                "success": true,
                "data": {
                    "sessionId": "session-uuid-111",
                    "centerId": "center-tasgaon-01",
                    "customerId": "cust-uuid-001",
                    "selectedMilkCategory": "COW",
                    "identificationMethod": "RFID",
                    "sessionState": "INITIALIZED"
                }
            }
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(createSessionJson))

        // 2. Session complete response
        val completeSessionJson = """
            {
                "success": true,
                "data": {
                    "status": "COMPLETED",
                    "session": {
                        "id": "session-uuid-111",
                        "session_state": "COMPLETED"
                    },
                    "collection": {
                        "id": "col-uuid-222",
                        "total_amount": 1134.75
                    },
                    "ledger": {
                        "previousBalance": 0.0,
                        "newBalance": 1134.75
                    },
                    "receipt": {
                        "receiptNumber": "RCP-20261114-001"
                    }
                }
            }
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(completeSessionJson))

        // 3. Receipt text response
        val receiptJson = """
            {
                "success": true,
                "data": {
                    "receiptText": "DFARM MILK COLLECTION RECEIPT\nReceipt: RCP-20261114-001\nFarmer: Pandurang Patil\nQty: 25.500 KG\nTotal: INR 1134.75"
                }
            }
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(receiptJson))

        val commitResult = repository.commitMilkCollection(
            customer = customer,
            category = MilkCategory.COW,
            method = IdentificationMethod.RFID,
            shift = Shift.MORNING,
            businessDate = "2026-11-14",
            netWeight = 25.500,
            fat = 4.5,
            snf = 8.8,
            appliedRate = 44.50,
            totalAmount = 1134.75,
            idempotencyKey = "IDEMP-TEST-001"
        )

        assertTrue("Online collection commit should succeed", commitResult.isSuccess)
        val data = commitResult.getOrNull()
        assertNotNull(data)
        assertEquals("session-uuid-111", data!!.sessionId)
        assertEquals("col-uuid-222", data.collectionId)
        assertEquals("RCP-20261114-001", data.receiptNumber)
        assertEquals(1134.75, data.totalAmount, 0.001)
        assertEquals(1134.75, data.newBalance!!, 0.001)
        assertFalse(data.isOffline)
        assertTrue(data.receiptText.contains("RCP-20261114-001"))
    }

    @Test
    fun testCommitMilkCollectionOfflineFallbackEnqueuesSync() = runBlocking {
        // Offline: No auth token / network disconnected
        val customer = Customer(
            id = "cust-offline-002",
            organizationId = "org-1",
            primaryCenterId = "center_default",
            farmerCode = "FARMER-002",
            fullName = "Tanaji Ghorpade",
            mobileNumber = "+919876543211",
            status = CustomerStatus.ACTIVE,
            permittedCategories = listOf(MilkCategory.BUFFALO)
        )

        val commitResult = repository.commitMilkCollection(
            customer = customer,
            category = MilkCategory.BUFFALO,
            method = IdentificationMethod.SUPERVISOR_MANUAL,
            shift = Shift.EVENING,
            businessDate = "2026-11-14",
            netWeight = 15.000,
            fat = 7.0,
            snf = 9.2,
            appliedRate = 58.00,
            totalAmount = 870.00,
            idempotencyKey = "IDEMP-OFFLINE-002"
        )

        assertTrue("Offline commit should succeed locally", commitResult.isSuccess)
        val data = commitResult.getOrNull()
        assertNotNull(data)
        assertTrue(data!!.isOffline)
        assertTrue(data.receiptNumber.startsWith("RCP-OFFLINE-"))

        // Check local database
        val collections = database.getLocalCollections(10)
        assertEquals(1, collections.size)
        assertEquals(870.00, collections[0].totalAmount, 0.001)
        assertEquals("PENDING_SYNC", collections[0].syncStatus)

        // Check sync journal queue
        val pendingEvents = database.getPendingJournalEvents(10)
        assertEquals(1, pendingEvents.size)
        assertEquals("MILK_COLLECTION", pendingEvents[0].entityType)
        assertEquals("IDEMP-OFFLINE-002", pendingEvents[0].idempotencyKey)
    }

    @Test
    fun testShiftSummaryAndHistory() = runBlocking {
        sessionManager.saveSession(
            "dummy-token",
            OfficerProfile(
                id = "off-1",
                email = "op@dfarm.local",
                fullName = "Operator",
                role = "OFFICER",
                organizationId = "org-1",
                centerId = "center-tasgaon-01"
            )
        )

        val summaryJson = """
            {
                "success": true,
                "data": {
                    "centerId": "center-tasgaon-01",
                    "shift": "MORNING",
                    "businessDate": "2026-11-14",
                    "totalCollections": 15,
                    "totalWeightKg": 420.500,
                    "averageFat": 4.52,
                    "averageSnf": 8.79,
                    "totalAmount": 18712.25
                }
            }
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(summaryJson))

        val summary = repository.getShiftSummary(Shift.MORNING, "2026-11-14")
        assertEquals(15, summary.totalCollections)
        assertEquals(420.500, summary.totalWeightKg, 0.001)
        assertEquals(18712.25, summary.totalAmount, 0.001)

        val historyJson = """
            {
                "success": true,
                "data": [
                    {
                        "id": "col-101",
                        "customer_id": "cust-1",
                        "farmer_code": "FARMER-001",
                        "customer_name": "Pandurang Patil",
                        "selected_milk_category": "COW",
                        "shift_type": "MORNING",
                        "business_date": "2026-11-14",
                        "session_state": "COMPLETED",
                        "net_weight": 25.0,
                        "fat_percentage": 4.5,
                        "snf_percentage": 8.8,
                        "applied_rate_per_unit": 44.50,
                        "total_amount": 1112.50
                    }
                ]
            }
        """.trimIndent()
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody(historyJson))

        val history = repository.getCollectionHistory("2026-11-14", Shift.MORNING)
        assertEquals(1, history.size)
        assertEquals("FARMER-001", history[0].farmerCode)
        assertEquals(1112.50, history[0].totalAmount!!, 0.001)
    }
}
