package com.dfarm.registration.model

enum class RfidCardStatus {
  UNASSIGNED,
  ACTIVE,
  BLOCKED,
  REVOKED,
  LOST
}

data class RfidCard(
  val id: String,
  val cardUid: String,
  val cardType: String = "MIFARE_CLASSIC_1K",
  val status: RfidCardStatus = RfidCardStatus.UNASSIGNED
)

data class RfidCardAssignment(
  val id: String,
  val rfidCardId: String,
  val customerId: String,
  val cardUid: String,
  val isActive: Boolean = true,
  val assignedAt: String,
  val assignedBy: String,
  val revokedAt: String? = null,
  val revocationReason: String? = null
)

