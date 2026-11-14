package com.dfarm.collection.domain.identification

import com.dfarm.collection.domain.model.Customer
import com.dfarm.collection.domain.model.CustomerStatus
import com.dfarm.collection.domain.model.IdentificationMethod
import java.util.UUID

sealed class IdentificationResult {
    data class Success(
        val customer: Customer,
        val canonicalUuid: String,
        val method: IdentificationMethod,
        val confidenceScore: Double? = null,
        val identifiedAt: Long = System.currentTimeMillis()
    ) : IdentificationResult()

    data class Failure(
        val reason: String,
        val errorCode: String
    ) : IdentificationResult()
}

interface CustomerRepository {
    fun findById(id: String): Customer?
    fun findByFarmerCode(code: String): Customer?
    fun findByRfid(rfid: String): Customer?
    fun search(query: String): List<Customer>
}

data class FaceModelCalibrationConfig(
    val modelVersion: String = "MobileFaceNet-ArcFace-v1.0.0",
    val preprocessingVersion: String = "112x112-norm-mean127.5-scale128.0",
    val threshold: Double = CANONICAL_THRESHOLD,
    val isCalibrationApproved: Boolean = false,
    val approvalStatus: String = "STAGING_UNVERIFIED"
) {
    companion object {
        const val CANONICAL_THRESHOLD: Double = 0.720
    }
}

class CustomerIdentificationService(
    private val customerRepository: CustomerRepository,
    private val expectedCenterId: String,
    private val expectedOrganizationId: String,
    private val maxOfflineHours: Long? = null,
    private val lastSyncTimestamp: Long = System.currentTimeMillis(),
    private val calibrationConfig: FaceModelCalibrationConfig = FaceModelCalibrationConfig()
) {

    /**
     * Executes Triple-Method Customer Identification Cascade:
     * 1. Face Recognition (Canonical centralized threshold 0.720, requires explicit calibration approval)
     * 2. RFID Card Tap
     * 3. Supervisor Manual Verification
     */
    fun identifyByFace(
        embedding: FloatArray,
        faceMatchCandidate: Customer?,
        similarityScore: Double,
        minimumConfidence: Double = calibrationConfig.threshold
    ): IdentificationResult {
        if (!calibrationConfig.isCalibrationApproved) {
            return IdentificationResult.Failure(
                "Face model calibration is unverified for production (${calibrationConfig.approvalStatus}). Fail-safe fallback to RFID or Manual identification required.",
                "CALIBRATION_NOT_APPROVED"
            )
        }
        if (similarityScore < minimumConfidence || faceMatchCandidate == null) {
            return IdentificationResult.Failure(
                "Face match confidence $similarityScore below required threshold $minimumConfidence",
                "FACE_MATCH_UNCERTAIN"
            )
        }
        return validateAndResolve(faceMatchCandidate, IdentificationMethod.FACE, similarityScore)
    }

    fun identifyByRfid(rfidTag: String): IdentificationResult {
        if (rfidTag.isBlank()) {
            return IdentificationResult.Failure("RFID tag cannot be empty", "INVALID_RFID")
        }
        val customer = customerRepository.findByRfid(rfidTag.trim())
            ?: return IdentificationResult.Failure("No active customer assigned to RFID tag: $rfidTag", "RFID_NOT_FOUND")
        return validateAndResolve(customer, IdentificationMethod.RFID)
    }

    fun identifyBySupervisorManual(
        farmerCodeOrId: String,
        supervisorUserId: String,
        justification: String
    ): IdentificationResult {
        if (supervisorUserId.isBlank() || justification.length < 5) {
            return IdentificationResult.Failure(
                "Supervisor manual identification requires valid supervisor ID and audit justification",
                "SUPERVISOR_AUTH_REQUIRED"
            )
        }
        val customer = customerRepository.findById(farmerCodeOrId)
            ?: customerRepository.findByFarmerCode(farmerCodeOrId)
            ?: return IdentificationResult.Failure("Customer not found: $farmerCodeOrId", "CUSTOMER_NOT_FOUND")
        return validateAndResolve(customer, IdentificationMethod.SUPERVISOR_MANUAL)
    }

    private fun validateAndResolve(
        customer: Customer,
        method: IdentificationMethod,
        confidence: Double? = null
    ): IdentificationResult {
        // 1. Validate Customer Status
        if (customer.isDeleted) {
            return IdentificationResult.Failure(
                "Customer ${customer.farmerCode} is deleted and cannot deliver milk",
                "CUSTOMER_DELETED"
            )
        }
        if (customer.status != CustomerStatus.ACTIVE) {
            return IdentificationResult.Failure(
                "Customer ${customer.farmerCode} is not in ACTIVE status (current: ${customer.status})",
                "CUSTOMER_NOT_ACTIVE"
            )
        }

        // 2. Validate Organization
        if (customer.organizationId != expectedOrganizationId) {
            return IdentificationResult.Failure(
                "Customer belongs to another organization",
                "ORGANIZATION_MISMATCH"
            )
        }

        // 3. Validate Center assignment
        if (customer.primaryCenterId != expectedCenterId) {
            return IdentificationResult.Failure(
                "Customer is registered at another center (${customer.primaryCenterId})",
                "CENTER_MISMATCH"
            )
        }

        // 4. Validate Milk Category Permission
        if (customer.permittedCategories.isEmpty()) {
            return IdentificationResult.Failure(
                "Customer has no approved milk category permissions",
                "NO_CATEGORY_PERMISSION"
            )
        }

        // 5. Validate Offline Authorization Freshness
        if (maxOfflineHours == null) {
            return IdentificationResult.Failure(
                "Offline authorization policy is unapproved and unconfigured. Contact dairy owner for policy approval.",
                "OFFLINE_POLICY_UNAPPROVED"
            )
        }
        val hoursSinceSync = (System.currentTimeMillis() - lastSyncTimestamp) / (1000 * 3600)
        if (hoursSinceSync > maxOfflineHours) {
            return IdentificationResult.Failure(
                "Device offline freshness expired ($hoursSinceSync hours > $maxOfflineHours hours). Sync required.",
                "OFFLINE_FRESHNESS_EXPIRED"
            )
        }

        return IdentificationResult.Success(
            customer = customer,
            canonicalUuid = customer.id,
            method = method,
            confidenceScore = confidence
        )
    }
}
