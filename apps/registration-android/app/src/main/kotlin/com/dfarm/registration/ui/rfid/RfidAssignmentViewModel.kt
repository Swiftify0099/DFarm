package com.dfarm.registration.ui.rfid

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.InMemoryRfidRepository
import com.dfarm.registration.data.RfidRepository
import com.dfarm.registration.hardware.RfidReaderAdapter
import com.dfarm.registration.hardware.SoftwareManualEntryRfidAdapter
import com.dfarm.registration.model.Customer
import com.dfarm.registration.model.RfidCardAssignment
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RfidAssignmentUiState(
  val customers: List<Customer> = emptyList(),
  val selectedCustomer: Customer? = null,
  val rawUidInput: String = "",
  val normalizedUid: String = "",
  val isValidUid: Boolean = false,
  val activeAssignment: RfidCardAssignment? = null,
  val assignmentHistory: List<RfidCardAssignment> = emptyList(),
  val isReplacing: Boolean = false,
  val replacementReason: String = "DAMAGED",
  val isRevokeDialogOpen: Boolean = false,
  val isBlockDialogOpen: Boolean = false,
  val actionReason: String = "",
  val isLoading: Boolean = false,
  val errorMessage: String? = null,
  val successMessage: String? = null,
  val hardwareSourceLabel: String = "SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"
)

class RfidAssignmentViewModel(
  private val repository: RfidRepository = InMemoryRfidRepository(),
  private val rfidAdapter: RfidReaderAdapter = SoftwareManualEntryRfidAdapter()
) : ViewModel() {

  private val _uiState = MutableStateFlow(
    RfidAssignmentUiState(hardwareSourceLabel = rfidAdapter.sourceLabel)
  )
  val uiState: StateFlow<RfidAssignmentUiState> = _uiState.asStateFlow()

  init {
    loadCustomers()
  }

  private fun loadCustomers() {
    viewModelScope.launch {
      repository.customers.collect { customerList ->
        _uiState.update { state ->
          val updatedSelected = customerList.find { it.id == state.selectedCustomer?.id }
            ?: customerList.firstOrNull()
          state.copy(customers = customerList, selectedCustomer = updatedSelected)
        }
        _uiState.value.selectedCustomer?.let { refreshCustomerAssignments(it.id) }
      }
    }
  }

  fun selectCustomer(customer: Customer) {
    _uiState.update {
      it.copy(
        selectedCustomer = customer,
        rawUidInput = "",
        normalizedUid = "",
        isValidUid = false,
        isReplacing = false,
        errorMessage = null,
        successMessage = null
      )
    }
    refreshCustomerAssignments(customer.id)
  }

  private fun refreshCustomerAssignments(customerId: String) {
    viewModelScope.launch {
      repository.getAssignments(customerId).collect { assignments ->
        val active = assignments.find { it.isActive }
        _uiState.update {
          it.copy(
            activeAssignment = active,
            assignmentHistory = assignments.sortedByDescending { a -> a.assignedAt }
          )
        }
      }
    }
  }

  fun onUidInputChanged(input: String) {
    val normalized = rfidAdapter.normalizeUid(input)
    val valid = rfidAdapter.isValidHexUid(normalized)
    _uiState.update {
      it.copy(
        rawUidInput = input,
        normalizedUid = normalized,
        isValidUid = valid,
        errorMessage = null
      )
    }
  }

  fun assignCard(assignedBy: String = "officer-01") {
    val state = _uiState.value
    val customer = state.selectedCustomer ?: return
    if (!state.isValidUid) {
      _uiState.update { it.copy(errorMessage = "Enter a valid hexadecimal RFID UID") }
      return
    }

    _uiState.update { it.copy(isLoading = true, errorMessage = null) }
    viewModelScope.launch {
      val result = repository.assignCard(customer.id, state.normalizedUid, assignedBy)
      result.fold(
        onSuccess = { assignment ->
          _uiState.update {
            it.copy(
              isLoading = false,
              rawUidInput = "",
              normalizedUid = "",
              isValidUid = false,
              successMessage = "Card ${assignment.cardUid} successfully assigned! Registration status updated."
            )
          }
          refreshCustomerAssignments(customer.id)
        },
        onFailure = { error ->
          _uiState.update {
            it.copy(isLoading = false, errorMessage = error.message ?: "Assignment failed")
          }
        }
      )
    }
  }

  fun startReplacement() {
    _uiState.update {
      it.copy(
        isReplacing = true,
        rawUidInput = "",
        normalizedUid = "",
        isValidUid = false,
        errorMessage = null
      )
    }
  }

  fun cancelReplacement() {
    _uiState.update { it.copy(isReplacing = false, errorMessage = null) }
  }

  fun onReplacementReasonChanged(reason: String) {
    _uiState.update { it.copy(replacementReason = reason) }
  }

  fun confirmReplacement(assignedBy: String = "officer-01") {
    val state = _uiState.value
    val customer = state.selectedCustomer ?: return
    if (!state.isValidUid) {
      _uiState.update { it.copy(errorMessage = "Enter valid replacement RFID UID") }
      return
    }

    _uiState.update { it.copy(isLoading = true, errorMessage = null) }
    viewModelScope.launch {
      val result = repository.replaceCard(customer.id, state.normalizedUid, state.replacementReason, assignedBy)
      result.fold(
        onSuccess = { assignment ->
          _uiState.update {
            it.copy(
              isLoading = false,
              isReplacing = false,
              rawUidInput = "",
              normalizedUid = "",
              isValidUid = false,
              successMessage = "Card replaced with ${assignment.cardUid} successfully."
            )
          }
          refreshCustomerAssignments(customer.id)
        },
        onFailure = { error ->
          _uiState.update {
            it.copy(isLoading = false, errorMessage = error.message ?: "Card replacement failed")
          }
        }
      )
    }
  }

  fun revokeActiveCard(reason: String, revokedBy: String = "officer-01") {
    val state = _uiState.value
    val customer = state.selectedCustomer ?: return
    val active = state.activeAssignment ?: return

    _uiState.update { it.copy(isLoading = true, errorMessage = null) }
    viewModelScope.launch {
      val result = repository.revokeCard(customer.id, active.id, reason, revokedBy)
      result.fold(
        onSuccess = {
          _uiState.update {
            it.copy(
              isLoading = false,
              successMessage = "Card ${active.cardUid} revoked successfully."
            )
          }
          refreshCustomerAssignments(customer.id)
        },
        onFailure = { error ->
          _uiState.update {
            it.copy(isLoading = false, errorMessage = error.message ?: "Card revocation failed")
          }
        }
      )
    }
  }

  fun blockActiveCard(reason: String, blockedBy: String = "officer-01") {
    val state = _uiState.value
    val customer = state.selectedCustomer ?: return
    val active = state.activeAssignment ?: return

    _uiState.update { it.copy(isLoading = true, errorMessage = null) }
    viewModelScope.launch {
      val result = repository.blockCard(customer.id, active.id, reason, blockedBy)
      result.fold(
        onSuccess = {
          _uiState.update {
            it.copy(
              isLoading = false,
              successMessage = "Card ${active.cardUid} blocked successfully."
            )
          }
          refreshCustomerAssignments(customer.id)
        },
        onFailure = { error ->
          _uiState.update {
            it.copy(isLoading = false, errorMessage = error.message ?: "Card blocking failed")
          }
        }
      )
    }
  }

  fun dismissMessage() {
    _uiState.update { it.copy(errorMessage = null, successMessage = null) }
  }
}

