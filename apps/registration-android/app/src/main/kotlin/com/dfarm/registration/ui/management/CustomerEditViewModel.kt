package com.dfarm.registration.ui.management

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.models.CustomerAddress
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.models.UpdateCustomerRequest
import com.dfarm.registration.data.repository.CustomerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CustomerEditUiState(
    val customerId: String = "",
    val fullName: String = "",
    val mobileNumber: String = "", // Read-only
    val farmerCode: String = "", // Read-only
    val village: String = "",
    val district: String = "",
    val taluka: String = "",
    val postalCode: String = "",
    val bankName: String = "",
    val bankAccountNumber: String = "",
    val bankIfscCode: String = "",
    val bankAccountHolderName: String = "",
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val isSaveSuccess: Boolean = false
)

class CustomerEditViewModel(
    private val customerRepository: CustomerRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CustomerEditUiState())
    val uiState: StateFlow<CustomerEditUiState> = _uiState.asStateFlow()

    fun loadCustomer(customerId: String) {
        _uiState.update { it.copy(customerId = customerId, isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            val result = customerRepository.getCustomer(customerId)
            result.onSuccess { customer ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        fullName = customer.fullName,
                        mobileNumber = customer.normalizedMobileNumber,
                        farmerCode = customer.farmerCode ?: "",
                        village = customer.address?.village ?: "",
                        district = customer.address?.district ?: "",
                        taluka = customer.address?.talukaSubdistrict ?: "",
                        postalCode = customer.address?.postalCode ?: "",
                        bankName = customer.bankName ?: "",
                        bankAccountNumber = customer.bankAccountNumber ?: "",
                        bankIfscCode = customer.bankIfscCode ?: "",
                        bankAccountHolderName = customer.bankAccountHolderName ?: ""
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Failed to load customer profile for editing"
                    )
                }
            }
        }
    }

    fun onFullNameChanged(value: String) {
        _uiState.update { it.copy(fullName = value, errorMessage = null) }
    }

    fun onVillageChanged(value: String) {
        _uiState.update { it.copy(village = value, errorMessage = null) }
    }

    fun onDistrictChanged(value: String) {
        _uiState.update { it.copy(district = value, errorMessage = null) }
    }

    fun onTalukaChanged(value: String) {
        _uiState.update { it.copy(taluka = value) }
    }

    fun onPostalCodeChanged(value: String) {
        val filtered = value.filter { it.isDigit() }.take(6)
        _uiState.update { it.copy(postalCode = filtered) }
    }

    fun onBankNameChanged(value: String) {
        _uiState.update { it.copy(bankName = value) }
    }

    fun onBankAccountNumberChanged(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.update { it.copy(bankAccountNumber = filtered) }
    }

    fun onBankIfscCodeChanged(value: String) {
        _uiState.update { it.copy(bankIfscCode = value.uppercase().take(11)) }
    }

    fun onBankAccountHolderChanged(value: String) {
        _uiState.update { it.copy(bankAccountHolderName = value) }
    }

    fun saveChanges(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.fullName.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "Full name must be at least 2 characters") }
            return
        }
        if (state.village.trim().isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Village cannot be empty") }
            return
        }
        if (state.district.trim().isEmpty()) {
            _uiState.update { it.copy(errorMessage = "District cannot be empty") }
            return
        }

        val request = UpdateCustomerRequest(
            fullName = state.fullName.trim(),
            address = CustomerAddress(
                village = state.village.trim(),
                district = state.district.trim(),
                talukaSubdistrict = if (state.taluka.isBlank()) null else state.taluka.trim(),
                postalCode = if (state.postalCode.isBlank()) null else state.postalCode.trim(),
                state = "Maharashtra"
            ),
            bankName = if (state.bankName.isBlank()) null else state.bankName.trim(),
            bankAccountNumber = if (state.bankAccountNumber.isBlank()) null else state.bankAccountNumber.trim(),
            bankIfscCode = if (state.bankIfscCode.isBlank()) null else state.bankIfscCode.trim(),
            bankAccountHolderName = if (state.bankAccountHolderName.isBlank()) null else state.bankAccountHolderName.trim()
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            val result = customerRepository.updateCustomer(state.customerId, request)
            result.onSuccess {
                _uiState.update { it.copy(isSaving = false, isSaveSuccess = true) }
                onSuccess()
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errorMessage = error.localizedMessage ?: "Failed to update customer"
                    )
                }
            }
        }
    }
}
