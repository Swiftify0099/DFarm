package com.dfarm.collection

import com.dfarm.collection.domain.identification.*
import com.dfarm.collection.domain.model.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CustomerIdentificationTest {

    private lateinit var service: CustomerIdentificationService
    private val expectedCenterId = "center_tasgaon_01"
    private val expectedOrgId = "org_sangli"

    private val customers = mutableMapOf<String, Customer>()

    @Before
    fun setUp() {
        customers.clear()
        val c1 = Customer(
            id = "c1",
            organizationId = expectedOrgId,
            primaryCenterId = expectedCenterId,
            farmerCode = "FARMER-001",
            fullName = "Pandurang Patil",
            mobileNumber = "+919876543210",
            status = CustomerStatus.ACTIVE,
            permittedCategories = listOf(MilkCategory.COW),
            rfidCardId = "RFID-1001"
        )
        val cSuspended = Customer(
            id = "c2",
            organizationId = expectedOrgId,
            primaryCenterId = expectedCenterId,
            farmerCode = "FARMER-002",
            fullName = "Tanaji Ghorpade",
            mobileNumber = "+919876543211",
            status = CustomerStatus.SUSPENDED,
            permittedCategories = listOf(MilkCategory.BUFFALO),
            rfidCardId = "RFID-1002"
        )
        val cDeleted = Customer(
            id = "c3",
            organizationId = expectedOrgId,
            primaryCenterId = expectedCenterId,
            farmerCode = "FARMER-003",
            fullName = "Deepak Shinde",
            mobileNumber = "+919876543212",
            status = CustomerStatus.ACTIVE,
            permittedCategories = listOf(MilkCategory.COW),
            isDeleted = true
        )
        val cWrongCenter = Customer(
            id = "c4",
            organizationId = expectedOrgId,
            primaryCenterId = "center_miraj_02",
            farmerCode = "FARMER-004",
            fullName = "Rahul Chavan",
            mobileNumber = "+919876543213",
            status = CustomerStatus.ACTIVE,
            permittedCategories = listOf(MilkCategory.COW)
        )
        customers["c1"] = c1
        customers["c2"] = cSuspended
        customers["c3"] = cDeleted
        customers["c4"] = cWrongCenter

        val repo = object : CustomerRepository {
            override fun findById(id: String): Customer? = customers[id]
            override fun findByFarmerCode(code: String): Customer? = customers.values.find { it.farmerCode == code }
            override fun findByRfid(rfid: String): Customer? = customers.values.find { it.rfidCardId == rfid }
            override fun search(query: String): List<Customer> = customers.values.filter { it.fullName.contains(query) }
        }

        service = CustomerIdentificationService(
            customerRepository = repo,
            expectedCenterId = expectedCenterId,
            expectedOrganizationId = expectedOrgId,
            maxOfflineHours = 72,
            lastSyncTimestamp = System.currentTimeMillis(),
            calibrationConfig = FaceModelCalibrationConfig(
                isCalibrationApproved = true,
                threshold = FaceModelCalibrationConfig.CANONICAL_THRESHOLD
            )
        )
    }

    @Test
    fun testFaceIdentificationSuccessWithHighConfidence() {
        val result = service.identifyByFace(
            embedding = FloatArray(128) { 0.1f },
            faceMatchCandidate = customers["c1"],
            similarityScore = 0.94
        )
        assertTrue(result is IdentificationResult.Success)
        val success = result as IdentificationResult.Success
        assertEquals("c1", success.canonicalUuid)
        assertEquals(IdentificationMethod.FACE, success.method)
    }

    @Test
    fun testFaceIdentificationRejectedWhenConfidenceBelowThreshold() {
        val result = service.identifyByFace(
            embedding = FloatArray(128) { 0.1f },
            faceMatchCandidate = customers["c1"],
            similarityScore = 0.65 // Below 0.720 threshold
        )
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("FACE_MATCH_UNCERTAIN", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testFaceIdentificationFailSafeWhenCalibrationUnapproved() {
        val repo = object : CustomerRepository {
            override fun findById(id: String): Customer? = customers[id]
            override fun findByFarmerCode(code: String): Customer? = customers.values.find { it.farmerCode == code }
            override fun findByRfid(rfid: String): Customer? = customers.values.find { it.rfidCardId == rfid }
            override fun search(query: String): List<Customer> = customers.values.filter { it.fullName.contains(query) }
        }
        val unapprovedService = CustomerIdentificationService(
            customerRepository = repo,
            expectedCenterId = expectedCenterId,
            expectedOrganizationId = expectedOrgId,
            maxOfflineHours = 72,
            calibrationConfig = FaceModelCalibrationConfig(isCalibrationApproved = false)
        )
        val result = unapprovedService.identifyByFace(
            embedding = FloatArray(128) { 0.1f },
            faceMatchCandidate = customers["c1"],
            similarityScore = 0.95
        )
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("CALIBRATION_NOT_APPROVED", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testOfflineAuthorizationRejectedWhenPolicyUnconfigured() {
        val repo = object : CustomerRepository {
            override fun findById(id: String): Customer? = customers[id]
            override fun findByFarmerCode(code: String): Customer? = customers.values.find { it.farmerCode == code }
            override fun findByRfid(rfid: String): Customer? = customers.values.find { it.rfidCardId == rfid }
            override fun search(query: String): List<Customer> = customers.values.filter { it.fullName.contains(query) }
        }
        val unconfiguredService = CustomerIdentificationService(
            customerRepository = repo,
            expectedCenterId = expectedCenterId,
            expectedOrganizationId = expectedOrgId,
            maxOfflineHours = null // unapproved/missing configuration
        )
        val result = unconfiguredService.identifyByRfid("RFID-1001")
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("OFFLINE_POLICY_UNAPPROVED", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testRfidIdentificationSuccess() {
        val result = service.identifyByRfid("RFID-1001")
        assertTrue(result is IdentificationResult.Success)
        val success = result as IdentificationResult.Success
        assertEquals("c1", success.canonicalUuid)
        assertEquals(IdentificationMethod.RFID, success.method)
    }

    @Test
    fun testSupervisorManualIdentificationSuccess() {
        val result = service.identifyBySupervisorManual(
            farmerCodeOrId = "FARMER-001",
            supervisorUserId = "sup_user_123",
            justification = "Farmer forgot RFID card and face camera has glare"
        )
        assertTrue(result is IdentificationResult.Success)
        val success = result as IdentificationResult.Success
        assertEquals("c1", success.canonicalUuid)
        assertEquals(IdentificationMethod.SUPERVISOR_MANUAL, success.method)
    }

    @Test
    fun testUnknownCustomerRejection() {
        val result = service.identifyByRfid("RFID-UNKNOWN-999")
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("RFID_NOT_FOUND", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testDeletedCustomerRejection() {
        val result = service.identifyBySupervisorManual(
            farmerCodeOrId = "FARMER-003",
            supervisorUserId = "sup_user_123",
            justification = "Manual verification attempt"
        )
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("CUSTOMER_DELETED", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testSuspendedCustomerRejection() {
        val result = service.identifyByRfid("RFID-1002")
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("CUSTOMER_NOT_ACTIVE", (result as IdentificationResult.Failure).errorCode)
    }

    @Test
    fun testWrongCenterCustomerRejection() {
        val result = service.identifyBySupervisorManual(
            farmerCodeOrId = "FARMER-004",
            supervisorUserId = "sup_user_123",
            justification = "Visiting from Miraj center"
        )
        assertTrue(result is IdentificationResult.Failure)
        assertEquals("CENTER_MISMATCH", (result as IdentificationResult.Failure).errorCode)
    }
}
