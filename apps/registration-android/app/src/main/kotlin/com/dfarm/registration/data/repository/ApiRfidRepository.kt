package com.dfarm.registration.data.repository

import com.dfarm.registration.data.RfidRepository
import com.dfarm.registration.data.api.DFarmApiService
import com.dfarm.registration.data.models.RfidAssignRequest
import com.dfarm.registration.data.models.RfidBlockRequest
import com.dfarm.registration.data.models.RfidReplaceRequest
import com.dfarm.registration.data.models.RfidRevokeRequest
import com.dfarm.registration.hardware.RfidReaderAdapter
import com.dfarm.registration.hardware.SoftwareManualEntryRfidAdapter
import com.dfarm.registration.model.Customer
import com.dfarm.registration.model.CustomerStatus
import com.dfarm.registration.model.RfidCardAssignment
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class ApiRfidRepository(
    private val apiService: DFarmApiService,
    private val customerRepository: CustomerRepository,
    private val adapter: RfidReaderAdapter = SoftwareManualEntryRfidAdapter()
) : RfidRepository {

    override val customers: Flow<List<Customer>> = flow {
        val result = customerRepository.listCustomers(page = 1, limit = 100)
        result.onSuccess { response ->
            val domainCustomers = response.items.map { dto ->
                Customer(
                    id = dto.id,
                    farmerCode = dto.farmerCode ?: "PENDING",
                    fullName = dto.fullName,
                    mobileNumber = dto.normalizedMobileNumber,
                    status = mapStatus(dto.status),
                    registrationStatus = dto.registrationStatus,
                    isFaceEnrolled = dto.status != "DRAFT" && dto.status != "PENDING_FACE_ENROLLMENT",
                    activeCardUid = null
                )
            }
            emit(domainCustomers)
        }.onFailure {
            emit(emptyList())
        }
    }

    override fun getCustomer(customerId: String): Flow<Customer?> = flow {
        val result = customerRepository.getCustomer(customerId)
        result.onSuccess { dto ->
            emit(
                Customer(
                    id = dto.id,
                    farmerCode = dto.farmerCode ?: "PENDING",
                    fullName = dto.fullName,
                    mobileNumber = dto.normalizedMobileNumber,
                    status = mapStatus(dto.status),
                    registrationStatus = dto.registrationStatus,
                    isFaceEnrolled = dto.status != "DRAFT" && dto.status != "PENDING_FACE_ENROLLMENT",
                    activeCardUid = null
                )
            )
        }.onFailure {
            emit(null)
        }
    }

    override fun getAssignments(customerId: String): Flow<List<RfidCardAssignment>> = flow {
        try {
            val response = apiService.getRfidStatus(customerId)
            if (response.isSuccessful && response.body()?.data != null) {
                val data = response.body()!!.data!!
                val assignments = mutableListOf<RfidCardAssignment>()

                // Add active card if present
                data.activeCard?.let { active ->
                    assignments.add(
                        RfidCardAssignment(
                            id = active.effectiveCardId,
                            rfidCardId = active.effectiveCardId,
                            customerId = customerId,
                            cardUid = active.cardUid,
                            isActive = true,
                            assignedAt = active.assignedAt ?: "",
                            assignedBy = ""
                        )
                    )
                }

                // Add past assignment history items
                data.assignmentHistory.forEach { hist ->
                    if (hist.effectiveCardId != data.activeCard?.effectiveCardId) {
                        assignments.add(
                            RfidCardAssignment(
                                id = hist.effectiveId,
                                rfidCardId = hist.effectiveCardId,
                                customerId = customerId,
                                cardUid = hist.cardUid,
                                isActive = hist.isActive,
                                assignedAt = hist.assignedAt ?: "",
                                assignedBy = hist.assignedBy ?: "",
                                revokedAt = hist.revokedAt,
                                revocationReason = hist.revocationReason
                            )
                        )
                    }
                }
                emit(assignments)
            } else {
                emit(emptyList())
            }
        } catch (e: Exception) {
            emit(emptyList())
        }
    }

    override suspend fun assignCard(
        customerId: String,
        rawCardUid: String,
        assignedBy: String
    ): Result<RfidCardAssignment> {
        return try {
            val normalizedUid = adapter.normalizeUid(rawCardUid)
            val response = apiService.assignRfid(customerId, RfidAssignRequest(cardUid = normalizedUid))
            if (response.isSuccessful && response.body()?.data != null) {
                val dto = response.body()!!.data!!
                Result.success(
                    RfidCardAssignment(
                        id = dto.effectiveId,
                        rfidCardId = dto.rfidCardId ?: dto.effectiveId,
                        customerId = dto.customerId ?: customerId,
                        cardUid = dto.cardUid ?: normalizedUid,
                        isActive = dto.isActive,
                        assignedAt = dto.assignedAt ?: "",
                        assignedBy = dto.assignedBy ?: assignedBy
                    )
                )
            } else {
                val err = response.body()?.message ?: "Server rejected RFID assignment (${response.code()})"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun replaceCard(
        customerId: String,
        newRawCardUid: String,
        reason: String,
        assignedBy: String
    ): Result<RfidCardAssignment> {
        return try {
            val normalizedUid = adapter.normalizeUid(newRawCardUid)
            val response = apiService.replaceRfid(
                customerId,
                RfidReplaceRequest(newCardUid = normalizedUid, reason = reason)
            )
            if (response.isSuccessful && response.body()?.data != null) {
                val dto = response.body()!!.data!!
                Result.success(
                    RfidCardAssignment(
                        id = dto.effectiveId,
                        rfidCardId = dto.rfidCardId ?: dto.effectiveId,
                        customerId = dto.customerId ?: customerId,
                        cardUid = dto.cardUid ?: normalizedUid,
                        isActive = dto.isActive,
                        assignedAt = dto.assignedAt ?: "",
                        assignedBy = dto.assignedBy ?: assignedBy
                    )
                )
            } else {
                val err = response.body()?.message ?: "Server rejected RFID replacement (${response.code()})"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun revokeCard(
        customerId: String,
        cardId: String,
        reason: String,
        revokedBy: String
    ): Result<Unit> {
        return try {
            val response = apiService.revokeRfid(cardId, RfidRevokeRequest(reason = reason))
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val err = response.body()?.message ?: "Server rejected RFID revocation (${response.code()})"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun blockCard(
        customerId: String,
        cardId: String,
        reason: String,
        blockedBy: String
    ): Result<Unit> {
        return try {
            val response = apiService.blockRfid(cardId, RfidBlockRequest(reason = reason))
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val err = response.body()?.message ?: "Server rejected RFID blocking (${response.code()})"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun mapStatus(statusStr: String): CustomerStatus {
        return try {
            CustomerStatus.valueOf(statusStr)
        } catch (e: Exception) {
            CustomerStatus.DRAFT
        }
    }
}
