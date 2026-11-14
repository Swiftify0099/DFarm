package com.dfarm.registration.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val username: String = email
)

@Serializable
data class AssignedCenter(
    val centerId: String,
    val centerName: String,
    val centerCode: String
)

@Serializable
data class CenterDto(
    val id: String,
    val code: String? = null,
    val name: String? = null,
    val isPrimary: Boolean = false
) {
    fun toAssignedCenter(): AssignedCenter =
        AssignedCenter(
            centerId = id,
            centerName = name ?: code ?: id,
            centerCode = code ?: ""
        )
}

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
data class LoginUserData(
    val id: String? = null,
    val organizationId: String? = null,
    val role: String? = null,
    val primaryCenterId: String? = null,
    val fullName: String? = null,
    val username: String? = null,
    val email: String? = null,
    val phoneNumber: String? = null,
    val assignedCenters: List<CenterDto> = emptyList()
)

@Serializable
data class LoginData(
    val token: String? = null,
    val user: LoginUserData? = null
)

@Serializable
data class LoginResponse(
    val success: Boolean,
    val data: LoginData? = null,
    val token: String? = null,
    val officer: OfficerProfile? = null,
    val message: String? = null
) {
    val effectiveToken: String?
        get() = token ?: data?.token

    val effectiveOfficer: OfficerProfile?
        get() = officer ?: data?.user?.let { u ->
            OfficerProfile(
                id = u.id ?: "",
                email = u.email ?: u.username ?: "",
                fullName = u.fullName ?: u.username ?: "Staff Officer",
                role = u.role ?: "REGISTRATION_OFFICER",
                organizationId = u.organizationId ?: "",
                centerId = u.primaryCenterId,
                assignedCenters = u.assignedCenters.map { it.toAssignedCenter() }
            )
        }
}

@Serializable
data class UserMeData(
    val authUserId: String? = null,
    val internalId: String? = null,
    val actorType: String? = null,
    val role: String? = null,
    val organizationId: String? = null,
    val authorizedCenterIds: List<String> = emptyList(),
    val primaryCenterId: String? = null,
    val officer: OfficerProfile? = null
)

@Serializable
data class UserMeResponse(
    val success: Boolean,
    val data: UserMeData? = null,
    val officer: OfficerProfile? = null,
    val message: String? = null
) {
    val effectiveOfficer: OfficerProfile?
        get() = officer ?: data?.officer ?: data?.let { d ->
            OfficerProfile(
                id = d.internalId ?: d.authUserId ?: "",
                email = "",
                fullName = "Staff Officer",
                role = d.role ?: "REGISTRATION_OFFICER",
                organizationId = d.organizationId ?: "",
                centerId = d.primaryCenterId,
                assignedCenters = d.authorizedCenterIds.map { id ->
                    AssignedCenter(centerId = id, centerName = id, centerCode = "")
                }
            )
        }
}

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
    val mobileNumber: String = normalizedMobileNumber,
    val permittedCategories: List<String>,
    val primaryCenterId: String? = null,
    val centerId: String? = primaryCenterId,
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
data class CustomerDeleteRequest(
    val reason: String
)

@Serializable
data class CustomerRestoreRequest(
    val reason: String
)

@Serializable
data class RfidAssignRequest(
    val cardUid: String,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val deviceId: String = "REGISTRATION_APP"
)

@Serializable
data class RfidReplaceRequest(
    val newCardUid: String,
    val reason: String,
    val reasonCategory: String = "CARD_DAMAGED",
    val justificationNotes: String = reason,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val deviceId: String = "REGISTRATION_APP"
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
    val id: String? = null,
    val assignmentId: String? = null,
    val rfidCardId: String? = null,
    val customerId: String? = null,
    val centerId: String? = null,
    val isActive: Boolean = true,
    val assignedAt: String? = null,
    val assignedBy: String? = null,
    val cardUid: String? = null,
    val cardType: String? = null,
    val revokedAt: String? = null,
    val revocationReason: String? = null,
    val status: String? = null
) {
    val effectiveId: String
        get() = id ?: assignmentId ?: ""
}

@Serializable
data class CustomerRfidStatusDto(
    val customerId: String,
    val farmerCode: String? = null,
    val fullName: String? = null,
    val status: String? = null,
    val customerStatus: String? = null,
    val registrationStatus: String? = null,
    val hasActiveCard: Boolean = false,
    val activeCard: RfidCardDetailDto? = null,
    val assignmentHistory: List<RfidAssignmentHistoryItemDto> = emptyList()
)

@Serializable
data class RfidCardDetailDto(
    val cardId: String? = null,
    val rfidCardId: String? = null,
    val cardUid: String,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val assignedAt: String? = null
) {
    val effectiveCardId: String
        get() = cardId ?: rfidCardId ?: ""
}

@Serializable
data class RfidAssignmentHistoryItemDto(
    val id: String? = null,
    val assignmentId: String? = null,
    val cardId: String? = null,
    val rfidCardId: String? = null,
    val cardUid: String,
    val cardType: String = "MIFARE_CLASSIC_1K",
    val assignedAt: String? = null,
    val assignedBy: String? = null,
    val isActive: Boolean = false,
    val revokedAt: String? = null,
    val revocationReason: String? = null
) {
    val effectiveId: String
        get() = id ?: assignmentId ?: ""
    val effectiveCardId: String
        get() = cardId ?: rfidCardId ?: ""
}
