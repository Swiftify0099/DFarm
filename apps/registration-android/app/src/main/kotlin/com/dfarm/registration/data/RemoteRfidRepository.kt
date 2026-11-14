package com.dfarm.registration.data

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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

/**
 * Remote PostgreSQL-backed implementation of RfidRepository.
 * Delegates all card assignment, replacement, revocation, and status
 * queries to the authoritative DFarm backend API.
 */
class RemoteRfidRepository(
    private val apiService: DFarmApiService,
    private val adapter: RfidReaderAdapter = SoftwareManualEntryRfidAdapter()
) : RfidRepository {

    private val _customers = MutableStateFlow<List<Customer>>(emptyList())
    override val customers: Flow<List<Customer>> = _customers.asStateFlow()

    private val _assignmentsCache = MutableStateFlow<Map<String, List<RfidCardAssignment>>>(emptyMap())

    suspend fun refreshCustomers(centerId: String? = null): Result<List<Customer>> {
        return try {
            val response = apiService.listCustomers(page = 1, limit = 100, centerId = centerId)
            if (response.isSuccessful && response.body()?.success == true) {
                val items = response.body()?.data?.items ?: emptyList()
                val mapped = items.map { dto ->
                    Customer(
                        id = dto.id,
                        farmerCode = dto.farmerCode ?: "",
                        fullName = dto.fullName,
                        mobileNumber = dto.normalizedMobileNumber,
                        status = try {
                            CustomerStatus.valueOf(dto.status)
                        } catch (_: Exception) {
                            CustomerStatus.DRAFT
                        },
                        registrationStatus = dto.registrationStatus,
                        isFaceEnrolled = dto.registrationStatus == "FACE_ENROLLED" || dto.registrationStatus == "COMPLETED",
                        activeCardUid = null
                    )
                }
                _customers.value = mapped
                Result.success(mapped)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Failed to fetch customers"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override fun getCustomer(customerId: String): Flow<Customer?> =
        _customers.map { list -> list.find { it.id == customerId } }

    override fun getAssignments(customerId: String): Flow<List<RfidCardAssignment>> =
        _assignmentsCache.map { cache -> cache[customerId] ?: emptyList() }

    suspend fun fetchCustomerRfidStatus(customerId: String): Result<List<RfidCardAssignment>> {
        return try {
            val response = apiService.getRfidStatus(customerId)
            if (response.isSuccessful && response.body()?.success == true) {
                val statusDto = response.body()?.data
                val list = mutableListOf<RfidCardAssignment>()

                statusDto?.assignmentHistory?.forEach { item ->
                    list.add(
                        RfidCardAssignment(
                            id = item.effectiveId,
                            rfidCardId = item.effectiveCardId,
                            customerId = customerId,
                            cardUid = item.cardUid,
                            isActive = item.isActive,
                            assignedAt = item.assignedAt ?: "",
                            assignedBy = item.assignedBy ?: "",
                            revokedAt = item.revokedAt,
                            revocationReason = item.revocationReason
                        )
                    )
                }

                _assignmentsCache.value = _assignmentsCache.value.toMutableMap().apply {
                    put(customerId, list)
                }
                Result.success(list)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Failed to fetch RFID status"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun assignCard(
        customerId: String,
        rawCardUid: String,
        assignedBy: String
    ): Result<RfidCardAssignment> {
        val normalizedUid = adapter.normalizeUid(rawCardUid)
        if (!adapter.isValidHexUid(normalizedUid)) {
            return Result.failure(IllegalArgumentException("Invalid hexadecimal RFID UID: $normalizedUid"))
        }

        return try {
            val response = apiService.assignRfid(customerId, RfidAssignRequest(cardUid = normalizedUid))
            if (response.isSuccessful && response.body()?.success == true) {
                val dto = response.body()?.data
                    ?: return Result.failure(Exception("Assignment succeeded but no data returned"))
                val assignment = RfidCardAssignment(
                    id = dto.effectiveId,
                    rfidCardId = dto.rfidCardId ?: dto.effectiveId,
                    customerId = dto.customerId ?: customerId,
                    cardUid = dto.cardUid ?: normalizedUid,
                    isActive = dto.isActive,
                    assignedAt = dto.assignedAt ?: "",
                    assignedBy = dto.assignedBy ?: assignedBy
                )

                // Update cache
                val current = _assignmentsCache.value[customerId] ?: emptyList()
                val updated = listOf(assignment) + current.map { it.copy(isActive = false) }
                _assignmentsCache.value = _assignmentsCache.value.toMutableMap().apply {
                    put(customerId, updated)
                }

                // Update customer status to ACTIVE if face was enrolled
                _customers.value = _customers.value.map { c ->
                    if (c.id == customerId) {
                        c.copy(
                            status = if (c.isFaceEnrolled) CustomerStatus.ACTIVE else CustomerStatus.PENDING_FACE_ENROLLMENT,
                            registrationStatus = if (c.isFaceEnrolled) "COMPLETED" else "RFID_ASSIGNED",
                            activeCardUid = normalizedUid
                        )
                    } else c
                }

                Result.success(assignment)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "RFID assignment failed"))
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
        val normalizedUid = adapter.normalizeUid(newRawCardUid)
        if (!adapter.isValidHexUid(normalizedUid)) {
            return Result.failure(IllegalArgumentException("Invalid hexadecimal RFID UID: $normalizedUid"))
        }

        return try {
            val response = apiService.replaceRfid(
                customerId,
                RfidReplaceRequest(newCardUid = normalizedUid, reason = reason)
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val dto = response.body()?.data
                    ?: return Result.failure(Exception("Card replacement succeeded but no data returned"))
                val assignment = RfidCardAssignment(
                    id = dto.effectiveId,
                    rfidCardId = dto.rfidCardId ?: dto.effectiveId,
                    customerId = dto.customerId ?: customerId,
                    cardUid = dto.cardUid ?: normalizedUid,
                    isActive = dto.isActive,
                    assignedAt = dto.assignedAt ?: "",
                    assignedBy = dto.assignedBy ?: assignedBy
                )

                // Refresh full status from backend to preserve historical record
                fetchCustomerRfidStatus(customerId)

                Result.success(assignment)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "RFID replacement failed"))
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
                fetchCustomerRfidStatus(customerId)
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Revoke failed"))
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
                fetchCustomerRfidStatus(customerId)
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Block failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

