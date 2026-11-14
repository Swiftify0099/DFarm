package com.dfarm.registration.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.models.AssignedCenter
import com.dfarm.registration.data.models.OfficerProfile
import com.dfarm.registration.data.repository.AuthRepository
import com.dfarm.registration.data.repository.AuthState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "officer.kolhapur@dfarm.local",
    val password: String = "Officer@12345",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val officer: OfficerProfile? = null,
    val showCenterSelectionDialog: Boolean = false,
    val availableCenters: List<AssignedCenter> = emptyList(),
    val selectedCenterId: String? = null
)

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        val currentOfficer = authRepository.getCurrentOfficer()
        if (currentOfficer != null) {
            _uiState.update {
                it.copy(
                    officer = currentOfficer,
                    selectedCenterId = currentOfficer.centerId ?: currentOfficer.assignedCenters.firstOrNull()?.centerId
                )
            }
        }
    }

    fun onEmailChanged(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
    }

    fun onPasswordChanged(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.email.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Email cannot be empty") }
            return
        }
        if (state.password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Password cannot be empty") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val result = authRepository.login(state.email, state.password)
            result.onSuccess { officer ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        officer = officer,
                        availableCenters = officer.assignedCenters,
                        selectedCenterId = officer.centerId ?: officer.assignedCenters.firstOrNull()?.centerId
                    )
                }
                if (officer.assignedCenters.size > 1 && officer.centerId == null) {
                    _uiState.update { it.copy(showCenterSelectionDialog = true) }
                } else {
                    onSuccess()
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.localizedMessage ?: "Login failed. Please check credentials."
                    )
                }
            }
        }
    }

    fun selectCenter(centerId: String, onComplete: () -> Unit) {
        authRepository.selectCenter(centerId)
        _uiState.update {
            it.copy(
                selectedCenterId = centerId,
                showCenterSelectionDialog = false
            )
        }
        onComplete()
    }

    fun dismissCenterDialog(onComplete: () -> Unit) {
        _uiState.update { it.copy(showCenterSelectionDialog = false) }
        onComplete()
    }
}
