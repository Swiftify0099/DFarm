package com.dfarm.registration.ui.management

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.repository.CustomerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CustomerDetailUiState(
    val customerId: String = "",
    val customer: CustomerDto? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val actionSuccessMessage: String? = null
)

class CustomerDetailViewModel(
    private val customerRepository: CustomerRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CustomerDetailUiState())
    val uiState: StateFlow<CustomerDetailUiState> = _uiState.asStateFlow()

    fun loadCustomer(customerId: String) {
        _uiState.update { it.copy(customerId = customerId, isLoading = true, errorMessage = null, actionSuccessMessage = null) }
        viewModelScope.launch {
            val result = customerRepository.getCustomer(customerId)
            result.onSuccess { customer ->
                _uiState.update { it.copy(customer = customer, isLoading = false) }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Failed to load customer details"
                    )
                }
            }
        }
    }

    fun deactivateCustomer(reason: String, onComplete: (Boolean) -> Unit = {}) {
        val cid = _uiState.value.customerId
        if (cid.isBlank()) return
        _uiState.update { it.copy(isLoading = true, errorMessage = null, actionSuccessMessage = null) }
        viewModelScope.launch {
            val result = customerRepository.deleteCustomer(cid, reason)
            result.onSuccess { updated ->
                _uiState.update {
                    it.copy(
                        customer = updated,
                        isLoading = false,
                        actionSuccessMessage = "Customer successfully deactivated."
                    )
                }
                onComplete(true)
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Failed to deactivate customer"
                    )
                }
                onComplete(false)
            }
        }
    }

    fun restoreCustomer(reason: String, onComplete: (Boolean) -> Unit = {}) {
        val cid = _uiState.value.customerId
        if (cid.isBlank()) return
        _uiState.update { it.copy(isLoading = true, errorMessage = null, actionSuccessMessage = null) }
        viewModelScope.launch {
            val result = customerRepository.restoreCustomer(cid, reason)
            result.onSuccess { updated ->
                _uiState.update {
                    it.copy(
                        customer = updated,
                        isLoading = false,
                        actionSuccessMessage = "Customer successfully restored."
                    )
                }
                onComplete(true)
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Failed to restore customer"
                    )
                }
                onComplete(false)
            }
        }
    }
}
