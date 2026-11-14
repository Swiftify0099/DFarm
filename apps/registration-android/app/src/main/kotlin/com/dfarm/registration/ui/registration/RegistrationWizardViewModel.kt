package com.dfarm.registration.ui.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.data.models.CreateCustomerRequest
import com.dfarm.registration.data.models.CustomerAddress
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.repository.AuthRepository
import com.dfarm.registration.data.repository.CustomerRepository
import com.dfarm.registration.data.repository.DuplicateMobileException
import com.dfarm.registration.ui.components.MilkCategoryOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class WizardStep(val stepNumber: Int, val title: String) {
    PERSONAL_DETAILS(1, "Personal Details"),
    MOBILE_VALIDATION(2, "Mobile & Identity"),
    MILK_CATEGORY(3, "Milk Permissions"),
    REVIEW_DETAILS(4, "Review & Submit"),
    REGISTRATION_STATUS(5, "Registration Status")
}

data class RegistrationWizardUiState(
    val currentStep: WizardStep = WizardStep.PERSONAL_DETAILS,
    // Step 1: Personal Details
    val fullName: String = "",
    val village: String = "",
    val district: String = "Kolhapur",
    val taluka: String = "",
    val postalCode: String = "",
    // Step 2: Mobile Number
    val mobileDigits: String = "", // 10 digits
    val normalizedMobile: String = "", // E.164 (+91...)
    // Step 3: Milk Categories
    val selectedCategoryOption: MilkCategoryOption = MilkCategoryOption.BOTH,
    // Bank Details (Optional - Minimization: not collected at registration)
    val bankName: String = "",
    val bankAccountNumber: String = "",
    val bankIfscCode: String = "",
    val bankAccountHolderName: String = "",
    // Validation Errors
    val fullNameError: String? = null,
    val villageError: String? = null,
    val districtError: String? = null,
    val mobileError: String? = null,
    val generalError: String? = null,
    // Processing & Server Confirmation
    val isSubmitting: Boolean = false,
    val createdCustomer: CustomerDto? = null
)

class RegistrationWizardViewModel(
    private val customerRepository: CustomerRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationWizardUiState())
    val uiState: StateFlow<RegistrationWizardUiState> = _uiState.asStateFlow()

    fun onFullNameChanged(value: String) {
        _uiState.update { it.copy(fullName = value, fullNameError = null, generalError = null) }
    }

    fun onVillageChanged(value: String) {
        _uiState.update { it.copy(village = value, villageError = null, generalError = null) }
    }

    fun onDistrictChanged(value: String) {
        _uiState.update { it.copy(district = value, districtError = null, generalError = null) }
    }

    fun onTalukaChanged(value: String) {
        _uiState.update { it.copy(taluka = value, generalError = null) }
    }

    fun onPostalCodeChanged(value: String) {
        val filtered = value.filter { it.isDigit() }.take(6)
        _uiState.update { it.copy(postalCode = filtered, generalError = null) }
    }

    fun onMobileDigitsChanged(value: String) {
        val filtered = value.filter { it.isDigit() }.take(10)
        val normalized = if (filtered.length == 10) "+91$filtered" else ""
        _uiState.update {
            it.copy(
                mobileDigits = filtered,
                normalizedMobile = normalized,
                mobileError = null,
                generalError = null
            )
        }
    }

    fun onCategoryOptionSelected(option: MilkCategoryOption) {
        _uiState.update { it.copy(selectedCategoryOption = option, generalError = null) }
    }

    fun onBankNameChanged(value: String) {
        _uiState.update { it.copy(bankName = value) }
    }

    fun onBankAccountNumberChanged(value: String) {
        val digits = value.filter { it.isDigit() }
        _uiState.update { it.copy(bankAccountNumber = digits) }
    }

    fun onBankIfscCodeChanged(value: String) {
        _uiState.update { it.copy(bankIfscCode = value.uppercase().take(11)) }
    }

    fun onBankAccountHolderChanged(value: String) {
        _uiState.update { it.copy(bankAccountHolderName = value) }
    }

    fun goToNextStep(): Boolean {
        val state = _uiState.value
        when (state.currentStep) {
            WizardStep.PERSONAL_DETAILS -> {
                var hasError = false
                if (state.fullName.trim().length < 2) {
                    _uiState.update { it.copy(fullNameError = "Enter farmer's full name (min 2 characters)") }
                    hasError = true
                }
                if (state.village.trim().isEmpty()) {
                    _uiState.update { it.copy(villageError = "Village is required") }
                    hasError = true
                }
                if (state.district.trim().isEmpty()) {
                    _uiState.update { it.copy(districtError = "District is required") }
                    hasError = true
                }
                if (hasError) return false
                _uiState.update { it.copy(currentStep = WizardStep.MOBILE_VALIDATION) }
                return true
            }

            WizardStep.MOBILE_VALIDATION -> {
                val digits = state.mobileDigits.trim()
                if (digits.length != 10) {
                    _uiState.update { it.copy(mobileError = "Mobile number must be exactly 10 digits") }
                    return false
                }
                if (!digits.matches(Regex("^[6-9]\\d{9}$"))) {
                    _uiState.update { it.copy(mobileError = "Enter a valid Indian mobile number starting with 6-9") }
                    return false
                }
                _uiState.update {
                    it.copy(
                        normalizedMobile = "+91$digits",
                        currentStep = WizardStep.MILK_CATEGORY
                    )
                }
                return true
            }

            WizardStep.MILK_CATEGORY -> {
                _uiState.update { it.copy(currentStep = WizardStep.REVIEW_DETAILS) }
                return true
            }

            WizardStep.REVIEW_DETAILS -> {
                submitRegistration()
                return true
            }

            WizardStep.REGISTRATION_STATUS -> {
                return true
            }
        }
    }

    fun goToPreviousStep() {
        val prev = when (_uiState.value.currentStep) {
            WizardStep.PERSONAL_DETAILS -> null
            WizardStep.MOBILE_VALIDATION -> WizardStep.PERSONAL_DETAILS
            WizardStep.MILK_CATEGORY -> WizardStep.MOBILE_VALIDATION
            WizardStep.REVIEW_DETAILS -> WizardStep.MILK_CATEGORY
            WizardStep.REGISTRATION_STATUS -> null
        }
        if (prev != null) {
            _uiState.update { it.copy(currentStep = prev, generalError = null) }
        }
    }

    fun submitRegistration() {
        val state = _uiState.value
        val activeCenterId = authRepository.getActiveCenterId()

        val request = CreateCustomerRequest(
            fullName = state.fullName.trim(),
            normalizedMobileNumber = state.normalizedMobile,
            permittedCategories = state.selectedCategoryOption.categories,
            primaryCenterId = activeCenterId,
            address = CustomerAddress(
                village = state.village.trim(),
                district = state.district.trim(),
                talukaSubdistrict = if (state.taluka.isBlank()) null else state.taluka.trim(),
                postalCode = if (state.postalCode.isBlank()) null else state.postalCode.trim(),
                state = "Maharashtra"
            ),
            bankName = null,
            bankAccountNumber = null,
            bankIfscCode = null,
            bankAccountHolderName = null
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, generalError = null) }
            val result = customerRepository.createCustomer(request)
            result.onSuccess { customer ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        createdCustomer = customer,
                        currentStep = WizardStep.REGISTRATION_STATUS
                    )
                }
            }.onFailure { error ->
                val errorMsg = when (error) {
                    is DuplicateMobileException -> {
                        "Mobile number ${state.normalizedMobile} is already registered in this organization. Duplicate registration is rejected."
                    }
                    else -> error.localizedMessage ?: "Failed to create customer record on server"
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        generalError = errorMsg
                    )
                }
            }
        }
    }

    fun resetWizard() {
        _uiState.value = RegistrationWizardUiState()
    }
}
