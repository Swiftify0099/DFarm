package com.dfarm.collection.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class AssignedCenter(
    val centerId: String,
    val centerName: String,
    val centerCode: String
)

@Serializable
data class OfficerProfile(
    val id: String,
    val email: String,
    val fullName: String,
    val role: String,
    val organizationId: String,
    val centerId: String? = null,
    val assignedCenters: List<AssignedCenter> = emptyList()
)

@Serializable
data class LoginResponse(
    val success: Boolean,
    val token: String? = null,
    val officer: OfficerProfile? = null,
    val message: String? = null
)

@Serializable
data class UserMeResponse(
    val success: Boolean,
    val officer: OfficerProfile? = null,
    val message: String? = null
)

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val data: T? = null,
    val message: String? = null,
    val error: ApiErrorDetail? = null
)

@Serializable
data class ApiErrorDetail(
    val code: String? = null,
    val message: String? = null,
    val details: String? = null
)

@Serializable
data class CustomerDto(
    val id: String,
    val organizationId: String? = null,
    val primaryCenterId: String? = null,
    val farmerCode: String? = null,
    val fullName: String,
    val mobileNumber: String? = null,
    val normalizedMobileNumber: String? = null,
    val status: String = "ACTIVE",
    val permittedCategories: List<String> = emptyList(),
    val isDeleted: Boolean = false
)

@Serializable
data class CustomerListResponse(
    val items: List<CustomerDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1
)

// Identification DTOs
@Serializable
data class RfidIdentificationRequest(
    val cardUid: String,
    val centerId: String,
    val deviceId: String = "COUNTER_TERMINAL",
    val sessionId: String? = null
)

@Serializable
data class SupervisorVerificationRequest(
    val targetCustomerUuid: String,
    val reasonCategory: String = "OTHER",
    val justificationNotes: String,
    val authenticatedVia: String = "PIN",
    val centerId: String,
    val deviceId: String = "COUNTER_TERMINAL",
    val supervisorId: String? = null,
    val supervisorPin: String? = null,
    val sessionId: String? = null
)

@Serializable
data class FaceIdentificationRequest(
    val centerId: String,
    val deviceId: String = "COUNTER_TERMINAL",
    val sessionId: String? = null,
    val probeEmbedding: List<Double>? = null,
    val qualityScore: Double? = null
)

@Serializable
data class IdentificationCustomerDto(
    val id: String,
    val fullName: String,
    val farmerCode: String? = null,
    val status: String,
    val permittedCategories: List<String> = emptyList()
)

@Serializable
data class IdentificationResponseDto(
    val success: Boolean,
    val sessionId: String? = null,
    val currentState: String? = null,
    val customerUuid: String? = null,
    val method: String? = null,
    val message: String? = null,
    val rejectionReason: String? = null,
    val customer: IdentificationCustomerDto? = null
)

// Collection Session DTOs
@Serializable
data class CreateSessionRequest(
    val customerId: String,
    val centerId: String,
    val identificationMethod: String,
    val milkCategory: String,
    val shift: String? = null,
    val businessDate: String? = null,
    val deviceId: String = "COUNTER_TERMINAL",
    val intakeSequenceUuid: String? = null
)

@Serializable
data class CreateSessionResponseDto(
    val sessionId: String,
    val centerId: String,
    val customerId: String,
    val customerName: String? = null,
    val farmerCode: String? = null,
    val businessDate: String? = null,
    val shiftType: String? = null,
    val selectedMilkCategory: String,
    val identificationMethod: String,
    val sessionState: String,
    val intakeSequenceUuid: String? = null
)

// Rate Calculation DTOs
@Serializable
data class CalculateRateRequest(
    val centerId: String? = null,
    val milkCategory: String,
    val fat: Double,
    val snf: Double,
    val netWeight: Double,
    val businessDate: String? = null,
    val measurementUnit: String = "KG"
)

@Serializable
data class CalculateRateResponseDto(
    val rateVersionId: String? = null,
    val rateVersionNumber: Int? = null,
    val rateChartId: String? = null,
    val appliedRate: Double,
    val quantity: Double,
    val totalAmount: Double,
    val calculationRule: String = "MATRIX_EXACT_MATCH",
    val roundingMode: String = "HALF_EVEN_2_DECIMALS"
)

// Measurement & Session Completion DTOs
@Serializable
data class RecordMeasurementsRequest(
    val fatPercentage: Double? = null,
    val snfPercentage: Double? = null,
    val clr: Double? = null,
    val netWeight: Double? = null,
    val source: String = "MANUAL_ENTRY"
)

@Serializable
data class CompleteSessionRequest(
    val clientIntakeUuid: String,
    val idempotencyKey: String,
    val netWeight: Double,
    val fatPercentage: Double,
    val snfPercentage: Double,
    val source: String = "MANUAL_ENTRY",
    val deviceId: String = "COUNTER_TERMINAL"
)

@Serializable
data class CompletedSessionDto(
    val id: String,
    val session_state: String
)

@Serializable
data class CompletedCollectionDto(
    val id: String,
    val total_amount: Double
)

@Serializable
data class CompletedLedgerDto(
    val newBalance: Double? = null,
    val previousBalance: Double? = null
)

@Serializable
data class CompletedReceiptDto(
    val receiptNumber: String
)

@Serializable
data class CompleteSessionResponseDto(
    val session: CompletedSessionDto? = null,
    val collection: CompletedCollectionDto? = null,
    val ledger: CompletedLedgerDto? = null,
    val receipt: CompletedReceiptDto? = null,
    val status: String = "COMPLETED"
)

@Serializable
data class CancelSessionRequest(
    val reason: String
)

@Serializable
data class ReceiptResponseDto(
    val receiptText: String
)

// Collection History and Shift Summary
@Serializable
data class CollectionHistoryItemDto(
    val id: String,
    @SerialName("customer_id")
    val customerId: String,
    @SerialName("farmer_code")
    val farmerCode: String? = null,
    @SerialName("customer_name")
    val customerName: String? = null,
    @SerialName("selected_milk_category")
    val selectedMilkCategory: String,
    @SerialName("shift_type")
    val shiftType: String,
    @SerialName("business_date")
    val businessDate: String,
    @SerialName("session_state")
    val sessionState: String,
    @SerialName("net_weight")
    val netWeight: Double? = null,
    @SerialName("fat_percentage")
    val fatPercentage: Double? = null,
    @SerialName("snf_percentage")
    val snfPercentage: Double? = null,
    @SerialName("applied_rate_per_unit")
    val appliedRatePerUnit: Double? = null,
    @SerialName("total_amount")
    val totalAmount: Double? = null,
    @SerialName("started_at")
    val startedAt: String? = null,
    @SerialName("completed_at")
    val completedAt: String? = null
)

@Serializable
data class ShiftSummaryDto(
    val centerId: String? = null,
    val shift: String,
    val businessDate: String,
    val totalCollections: Int = 0,
    val totalWeightKg: Double = 0.0,
    val averageFat: Double = 0.0,
    val averageSnf: Double = 0.0,
    val totalAmount: Double = 0.0
)

// Sync DTOs
@Serializable
data class SyncPushEventDto(
    val id: String,
    val entityType: String,
    val entityId: String,
    val action: String = "INSERT",
    val idempotencyKey: String,
    val createdAt: String,
    val payload: kotlinx.serialization.json.JsonObject
)

@Serializable
data class SyncPushRequest(
    val deviceId: String,
    val centerId: String,
    val events: List<SyncPushEventDto>
)

@Serializable
data class SyncPushResultDto(
    val eventId: String,
    val status: String,
    val entityId: String? = null,
    val message: String? = null
)

@Serializable
data class SyncPushResponseDto(
    val applied: List<String> = emptyList(),
    val conflicts: List<String> = emptyList(),
    val results: List<SyncPushResultDto> = emptyList()
)

@Serializable
data class SyncAcknowledgeRequest(
    val downstreamCursor: Long? = null,
    val downstreamTombstoneCursor: Long? = null,
    val cursor: Long? = null,
    val clientAppVersion: String = "1.0.0"
)
