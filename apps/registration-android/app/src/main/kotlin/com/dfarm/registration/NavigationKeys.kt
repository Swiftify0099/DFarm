package com.dfarm.registration

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
data object LoginNavKey : NavKey

@Serializable
data object CustomerListNavKey : NavKey

@Serializable
data object RegistrationWizardNavKey : NavKey

@Serializable
data class CustomerDetailNavKey(
    val customerId: String
) : NavKey

@Serializable
data class CustomerEditNavKey(
    val customerId: String
) : NavKey

// Retain compatibility keys for future phases
@Serializable
data object Main : NavKey

@Serializable
data class FaceEnrollment(
    val customerId: String,
    val customerName: String,
    val farmerCode: String
) : NavKey

@Serializable
data object RfidAssignment : NavKey
