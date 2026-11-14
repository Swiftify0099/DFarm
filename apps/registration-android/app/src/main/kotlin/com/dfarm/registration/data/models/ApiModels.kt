package com.dfarm.registration.data.models

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
data class CustomerAddress(
    val village: String = "",
    val hamletArea: String? = null,
    val talukaSubdistrict: String? = null,
    val district: String = "",
    val state: String = "Maharashtra",
    val postalCode: String? = null
)

@Serializable
data class CustomerDto(
    val id: String, // Server-generated canonical UUID
    val organizationId: String,
    val primaryCenterId: String,
    val farmerCode: String? = null,
    val fullName: String,
    val normalizedMobileNumber: String,
    val status: String = "DRAFT",
    val registrationStatus: String = "IN_PROGRESS",
    val address: CustomerAddress? = null,
    val permittedCategories: List<String> = emptyList(),
    val bankName: String? = null,
    val bankAccountNumber: String? = null,
    val bankIfscCode: String? = null,
    val bankAccountHolderName: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class CustomerListResponse(
    val items: List<CustomerDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1
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
data class CreateCustomerRequest(
    val fullName: String,
    val normalizedMobileNumber: String,
    val permittedCategories: List<String>,
    val primaryCenterId: String? = null,
    val farmerCode: String? = null,
    val address: CustomerAddress? = null,
    val bankName: String? = null,
    val bankAccountNumber: String? = null,
    val bankIfscCode: String? = null,
    val bankAccountHolderName: String? = null
)

@Serializable
data class UpdateCustomerRequest(
    val fullName: String? = null,
    val address: CustomerAddress? = null,
    val bankName: String? = null,
    val bankAccountNumber: String? = null,
    val bankIfscCode: String? = null,
    val bankAccountHolderName: String? = null
)

@Serializable
data class RfidAssignRequest(
    val cardUid: String
)

@Serializable
data class RfidReplaceRequest(
    val newCardUid: String,
    val reason: String
)

@Serializable
data class RfidRevokeRequest(
    val reason: String
)

@Serializable
data class RfidBlockRequest(
    val reason: String
)

@Serializable
data class RfidAssignmentDto(
    val id: String,
    val rfidCardId: String,
    val customerId: String,
    val centerId: String,
    val isActive: Boolean = true,
    val assignedAt: String,
    val assignedBy: String,
    val cardUid: String? = null,
    val cardType: String? = null,
    val revokedAt: String? = null,
    val revocationReason: String? = null
)

@Serializable
data class CustomerRfidStatusDto(
    val customerId: String,
    val farmerCode: String? = null,
    val fullName: String? = null,
    val status: String? = null,
    val hasActiveCard: Boolean = false,
    val activeCard: RfidCardDetailDto? = null,
    val assignmentHistory: List<RfidAssignmentHistoryItemDto> = emptyList()
)

@Serializable
data class RfidCardDetailDto(
    val cardId: String,
    val cardUid: String,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val assignedAt: String? = null
)

@Serializable
data class RfidAssignmentHistoryItemDto(
    val id: String,
    val cardId: String,
    val cardUid: String,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val assignedAt: String,
    val assignedBy: String,
    val isActive: Boolean = false,
    val revokedAt: String? = null,
    val revocationReason: String? = null
)
