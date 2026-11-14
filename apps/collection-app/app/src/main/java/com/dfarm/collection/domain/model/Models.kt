package com.dfarm.collection.domain.model

import java.util.UUID

enum class CustomerStatus {
    DRAFT,
    PENDING_FACE_ENROLLMENT,
    PENDING_RFID_ASSIGNMENT,
    PENDING_SYNC,
    ACTIVE,
    SUSPENDED,
    INACTIVE,
    REJECTED,
    SOFT_DELETED
}

enum class MilkCategory {
    COW,
    BUFFALO
}

enum class IdentificationMethod {
    FACE,
    RFID,
    SUPERVISOR_MANUAL
}

enum class Shift {
    MORNING,
    EVENING
}

enum class SessionState {
    WAITING_FOR_CUSTOMER,
    CUSTOMER_IDENTIFIED,
    CUSTOMER_VERIFIED,
    CATEGORY_PENDING,
    CATEGORY_SELECTED,
    SESSION_CREATED,
    WAITING_FOR_MEASUREMENTS,
    MEASUREMENTS_RECEIVED,
    VALIDATING,
    READY_FOR_REVIEW,
    COMMITTING,
    COMPLETED,
    INCOMPLETE,
    FAILED,
    CANCELLED,
    PENDING_SYNC
}

enum class ReadingSource {
    MANUAL_ENTRY,
    AUTOMATED_ANALYZER,
    AUTOMATED_SCALE,
    TEST_FIXTURE
}

enum class ValidationStatus {
    PENDING,
    VALID,
    INVALID,
    OVERRIDDEN
}

enum class MeasurementUnit {
    KG,
    LITRE
}

enum class AdjustmentType {
    CORRECTION,
    FULL_REVERSAL
}

data class Customer(
    val id: String,
    val organizationId: String,
    val primaryCenterId: String,
    val farmerCode: String,
    val fullName: String,
    val mobileNumber: String,
    val status: CustomerStatus,
    val permittedCategories: List<MilkCategory>,
    val rfidCardId: String? = null,
    val isDeleted: Boolean = false
)

data class MilkQualityMeasurement(
    val fatPercentage: Double,
    val snfPercentage: Double,
    val clr: Double? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val source: ReadingSource = ReadingSource.MANUAL_ENTRY,
    val validationStatus: ValidationStatus = ValidationStatus.PENDING,
    val sessionUuid: String
)

data class MilkWeightMeasurement(
    val grossWeight: Double? = null,
    val tareWeight: Double? = null,
    val netWeight: Double,
    val unit: MeasurementUnit = MeasurementUnit.KG,
    val timestamp: Long = System.currentTimeMillis(),
    val source: ReadingSource = ReadingSource.MANUAL_ENTRY,
    val validationStatus: ValidationStatus = ValidationStatus.PENDING,
    val sessionUuid: String
)

data class RateCalculationResult(
    val rateVersionId: String,
    val rateVersionNumber: Int,
    val rateChartId: String,
    val appliedRate: Double,
    val quantity: Double,
    val totalAmount: Double,
    val calculationRule: String = "MATRIX_EXACT_MATCH",
    val roundingMode: String = "HALF_EVEN_2_DECIMALS"
)

data class CollectionSession(
    val sessionUuid: String = UUID.randomUUID().toString(),
    val customerUuid: String,
    val organizationId: String,
    val centerId: String,
    val deviceId: String,
    val identificationMethod: IdentificationMethod,
    val milkCategory: MilkCategory,
    val shift: Shift,
    val businessDate: String,
    val startedAt: Long = System.currentTimeMillis(),
    var completedAt: Long? = null,
    var state: SessionState = SessionState.SESSION_CREATED,
    val idempotencyReference: String = UUID.randomUUID().toString(),
    var qualityMeasurement: MilkQualityMeasurement? = null,
    var weightMeasurement: MilkWeightMeasurement? = null,
    var rateCalculation: RateCalculationResult? = null,
    var cancellationReason: String? = null
)

data class CollectionReceipt(
    val receiptNumber: String,
    val sessionUuid: String,
    val businessDate: String,
    val shift: Shift,
    val centerName: String,
    val operatorName: String,
    val customerCode: String,
    val customerName: String,
    val identificationMethod: IdentificationMethod,
    val milkCategory: MilkCategory,
    val weightKg: Double,
    val fatPercentage: Double,
    val snfPercentage: Double,
    val ratePerUnit: Double,
    val totalAmount: Double,
    val timestamp: Long = System.currentTimeMillis(),
    val verificationHash: String
)

data class CenterValidationLimits(
    val cowFatMin: Double = 2.8,
    val cowFatMax: Double = 6.0,
    val cowSnfMin: Double = 7.8,
    val cowSnfMax: Double = 10.2,
    val buffaloFatMin: Double = 5.0,
    val buffaloFatMax: Double = 12.0,
    val buffaloSnfMin: Double = 8.2,
    val buffaloSnfMax: Double = 11.5,
    val minWeightKg: Double = 0.5,
    val maxWeightKg: Double = 200.0,
    val isApproved: Boolean = false,
    val configurationStatus: String = "PENDING_OWNER_APPROVAL",
    val limitsVersion: String = "v1.0-draft"
)
