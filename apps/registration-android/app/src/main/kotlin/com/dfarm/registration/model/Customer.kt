package com.dfarm.registration.model

enum class CustomerStatus {
  DRAFT,
  PENDING_FACE_ENROLLMENT,
  PENDING_RFID_ASSIGNMENT,
  PENDING_SYNC,
  ACTIVE,
  SUSPENDED,
  SOFT_DELETED
}

data class Customer(
  val id: String, // Canonical UUID
  val farmerCode: String,
  val fullName: String,
  val mobileNumber: String,
  val status: CustomerStatus,
  val registrationStatus: String = "IN_PROGRESS",
  val isFaceEnrolled: Boolean = false,
  val activeCardUid: String? = null
)

