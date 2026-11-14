package com.dfarm.registration.ui.management

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.repository.AuthRepository
import com.dfarm.registration.data.repository.CustomerRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CustomerListUiState(
    val customers: List<CustomerDto> = emptyList(),
    val totalCount: Int = 0,
    val isLoading: Boolean = false,
    val searchQuery: String = "",
    val selectedStatusFilter: String? = null,
    val selectedCategoryFilter: String? = null,
    val errorMessage: String? = null
)

class CustomerListViewModel(
    private val customerRepository: CustomerRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CustomerListUiState())
    val uiState: StateFlow<CustomerListUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadCustomers()
    }

    fun loadCustomers() {
        val state = _uiState.value
        val activeCenterId = authRepository.getActiveCenterId()

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val result = customerRepository.listCustomers(
                page = 1,
                limit = 50,
                search = if (state.searchQuery.isBlank()) null else state.searchQuery.trim(),
                centerId = activeCenterId,
                status = state.selectedStatusFilter
            )

            result.onSuccess { response ->
                val filtered = if (!state.selectedCategoryFilter.isNullOrBlank()) {
                    response.items.filter { it.permittedCategories.contains(state.selectedCategoryFilter) }
                } else {
                    response.items
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        customers = filtered,
                        totalCount = response.total
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Failed to load customers"
                    )
                }
            }
        }
    }

    fun onSearchQueryChanged(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350) // Debounce search input
            loadCustomers()
        }
    }

    fun onStatusFilterChanged(status: String?) {
        _uiState.update { it.copy(selectedStatusFilter = status) }
        loadCustomers()
    }

    fun onCategoryFilterChanged(category: String?) {
        _uiState.update { it.copy(selectedCategoryFilter = category) }
        loadCustomers()
    }
}
