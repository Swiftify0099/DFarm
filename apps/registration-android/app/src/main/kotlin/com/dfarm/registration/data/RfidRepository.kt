package com.dfarm.registration.data

import com.dfarm.registration.hardware.RfidReaderAdapter
import com.dfarm.registration.hardware.SoftwareManualEntryRfidAdapter
import com.dfarm.registration.model.Customer
import com.dfarm.registration.model.CustomerStatus
import com.dfarm.registration.model.RfidCardAssignment
import com.dfarm.registration.model.RfidCardStatus
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

interface RfidRepository {
  val customers: Flow<List<Customer>>
  fun getCustomer(customerId: String): Flow<Customer?>
  fun getAssignments(customerId: String): Flow<List<RfidCardAssignment>>
  suspend fun assignCard(customerId: String, rawCardUid: String, assignedBy: String): Result<RfidCardAssignment>
  suspend fun replaceCard(customerId: String, newRawCardUid: String, reason: String, assignedBy: String): Result<RfidCardAssignment>
  suspend fun revokeCard(customerId: String, cardId: String, reason: String, revokedBy: String): Result<Unit>
  suspend fun blockCard(customerId: String, cardId: String, reason: String, blockedBy: String): Result<Unit>
}

class InMemoryRfidRepository(
  private val adapter: RfidReaderAdapter = SoftwareManualEntryRfidAdapter()
) : RfidRepository {

  private val _customers = MutableStateFlow(
    listOf(
      Customer(
        id = "c1000000-0000-0000-0000-000000000001",
        farmerCode = "FARM-1001",
        fullName = "Ramesh Kumar Patel",
        mobileNumber = "9876543210",
        status = CustomerStatus.PENDING_RFID_ASSIGNMENT,
        registrationStatus = "FACE_ENROLLED",
        isFaceEnrolled = true,
        activeCardUid = null
      ),
      Customer(
        id = "c1000000-0000-0000-0000-000000000002",
        farmerCode = "FARM-1002",
        fullName = "Sita Devi Sharma",
        mobileNumber = "9876543211",
        status = CustomerStatus.ACTIVE,
        registrationStatus = "COMPLETED",
        isFaceEnrolled = true,
        activeCardUid = "04A1B2C3D4"
      ),
      Customer(
        id = "c1000000-0000-0000-0000-000000000003",
        farmerCode = "FARM-1003",
        fullName = "Anil Vikram Singh",
        mobileNumber = "9876543212",
        status = CustomerStatus.PENDING_FACE_ENROLLMENT,
        registrationStatus = "IN_PROGRESS",
        isFaceEnrolled = false,
        activeCardUid = null
      )
    )
  )

  private val _assignments = MutableStateFlow<List<RfidCardAssignment>>(
    listOf(
      RfidCardAssignment(
        id = "assign-0001",
        rfidCardId = "card-0001",
        customerId = "c1000000-0000-0000-0000-000000000002",
        cardUid = "04A1B2C3D4",
        isActive = true,
        assignedAt = "2026-11-10T10:00:00Z",
        assignedBy = "reg-officer-01"
      )
    )
  )

  override val customers: Flow<List<Customer>> = _customers.asStateFlow()

  override fun getCustomer(customerId: String): Flow<Customer?> =
    _customers.map { list -> list.find { it.id == customerId } }

  override fun getAssignments(customerId: String): Flow<List<RfidCardAssignment>> =
    _assignments.map { list -> list.filter { it.customerId == customerId } }

  override suspend fun assignCard(
    customerId: String,
    rawCardUid: String,
    assignedBy: String
  ): Result<RfidCardAssignment> {
    val normalizedUid = adapter.normalizeUid(rawCardUid)
    if (!adapter.isValidHexUid(normalizedUid)) {
      return Result.failure(IllegalArgumentException("Invalid hexadecimal RFID UID: $normalizedUid"))
    }

    val customerList = _customers.value
    val customer = customerList.find { it.id == customerId }
      ?: return Result.failure(NoSuchElementException("Customer $customerId not found"))

    if (customer.status == CustomerStatus.SOFT_DELETED || customer.status == CustomerStatus.SUSPENDED) {
      return Result.failure(IllegalStateException("Cannot assign RFID to customer in status: ${customer.status}"))
    }

    val currentAssignments = _assignments.value
    // Check if card is already actively assigned to anyone
    val existingActiveCard = currentAssignments.find { it.cardUid == normalizedUid && it.isActive }
    if (existingActiveCard != null) {
      return Result.failure(
        IllegalStateException("RFID Card UID $normalizedUid is already actively assigned to customer ${existingActiveCard.customerId}")
      )
    }

    // Check if customer already has an active card
    val customerActiveCard = currentAssignments.find { it.customerId == customerId && it.isActive }
    if (customerActiveCard != null) {
      return Result.failure(
        IllegalStateException("Customer already has an active RFID Card (${customerActiveCard.cardUid}). Use Replace Card workflow.")
      )
    }

    val assignment = RfidCardAssignment(
      id = UUID.randomUUID().toString(),
      rfidCardId = UUID.randomUUID().toString(),
      customerId = customerId,
      cardUid = normalizedUid,
      isActive = true,
      assignedAt = Instant.now().toString(),
      assignedBy = assignedBy
    )

    val updatedAssignments = ArrayList(currentAssignments).apply { add(assignment) }
    _assignments.value = updatedAssignments

    // Update customer status to ACTIVE if face enrollment is completed
    val updatedStatus = if (customer.isFaceEnrolled) CustomerStatus.ACTIVE else customer.status
    val updatedRegStatus = if (customer.isFaceEnrolled) "COMPLETED" else "RFID_ASSIGNED"

    _customers.value = customerList.map {
      if (it.id == customerId) {
        it.copy(
          activeCardUid = normalizedUid,
          status = updatedStatus,
          registrationStatus = updatedRegStatus
        )
      } else it
    }

    return Result.success(assignment)
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

    val customerList = _customers.value
    val customer = customerList.find { it.id == customerId }
      ?: return Result.failure(NoSuchElementException("Customer $customerId not found"))

    val currentAssignments = _assignments.value
    val activeAssignment = currentAssignments.find { it.customerId == customerId && it.isActive }
      ?: return Result.failure(IllegalStateException("Customer does not have an active card to replace"))

    // Check if new card is already active
    val conflict = currentAssignments.find { it.cardUid == normalizedUid && it.isActive }
    if (conflict != null) {
      return Result.failure(IllegalStateException("Target card UID $normalizedUid is already in active use"))
    }

    val now = Instant.now().toString()
    val updatedAssignments = currentAssignments.map {
      if (it.id == activeAssignment.id) {
        it.copy(isActive = false, revokedAt = now, revocationReason = "REPLACED: $reason")
      } else it
    }.toMutableList()

    val newAssignment = RfidCardAssignment(
      id = UUID.randomUUID().toString(),
      rfidCardId = UUID.randomUUID().toString(),
      customerId = customerId,
      cardUid = normalizedUid,
      isActive = true,
      assignedAt = now,
      assignedBy = assignedBy
    )
    updatedAssignments.add(newAssignment)
    _assignments.value = updatedAssignments

    _customers.value = customerList.map {
      if (it.id == customerId) it.copy(activeCardUid = normalizedUid) else it
    }

    return Result.success(newAssignment)
  }

  override suspend fun revokeCard(
    customerId: String,
    cardId: String,
    reason: String,
    revokedBy: String
  ): Result<Unit> {
    val currentAssignments = _assignments.value
    val assignment = currentAssignments.find { it.id == cardId && it.customerId == customerId }
      ?: return Result.failure(NoSuchElementException("Assignment $cardId not found for customer $customerId"))

    val now = Instant.now().toString()
    _assignments.value = currentAssignments.map {
      if (it.id == cardId) {
        it.copy(isActive = false, revokedAt = now, revocationReason = "REVOKED: $reason")
      } else it
    }

    _customers.value = _customers.value.map {
      if (it.id == customerId && it.activeCardUid == assignment.cardUid) {
        it.copy(activeCardUid = null)
      } else it
    }

    return Result.success(Unit)
  }

  override suspend fun blockCard(
    customerId: String,
    cardId: String,
    reason: String,
    blockedBy: String
  ): Result<Unit> {
    return revokeCard(customerId, cardId, "BLOCKED: $reason", blockedBy)
  }
}
