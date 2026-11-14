package com.dfarm.registration

import com.dfarm.registration.data.api.DFarmApiService
import com.dfarm.registration.data.models.ApiResponse
import com.dfarm.registration.data.models.CreateCustomerRequest
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.models.CustomerListResponse
import com.dfarm.registration.data.models.LoginRequest
import com.dfarm.registration.data.models.LoginResponse
import com.dfarm.registration.data.models.OfficerProfile
import com.dfarm.registration.data.models.UpdateCustomerRequest
import com.dfarm.registration.data.models.UserMeResponse
import com.dfarm.registration.data.repository.AuthRepository
import com.dfarm.registration.data.repository.CustomerRepository
import com.dfarm.registration.data.storage.ISessionManager
import com.dfarm.registration.ui.components.MilkCategoryOption
import com.dfarm.registration.ui.registration.RegistrationWizardViewModel
import com.dfarm.registration.ui.registration.WizardStep
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class FakeSessionManager(
    private var token: String? = "mock-jwt-token",
    private var officer: OfficerProfile? = null,
    private var activeCenterId: String? = "center-kolhapur-01",
    private var orgId: String? = "org-dfarm-01"
) : ISessionManager {
    override fun saveSession(token: String, officer: OfficerProfile) {
        this.token = token
        this.officer = officer
        this.orgId = officer.organizationId
        this.activeCenterId = officer.centerId
    }

    override fun getToken(): String? = token
    override fun getOfficer(): OfficerProfile? = officer
    override fun getActiveCenterId(): String? = activeCenterId
    override fun setActiveCenterId(centerId: String) { this.activeCenterId = centerId }
    override fun getOrganizationId(): String? = orgId
    override fun isLoggedIn(): Boolean = !token.isNullOrBlank()
    override fun clearSession() {
        token = null
        officer = null
        activeCenterId = null
        orgId = null
    }
}

class FakeApiService : DFarmApiService {
    override suspend fun login(request: LoginRequest): Response<LoginResponse> {
        return Response.success(LoginResponse(success = true, token = "dummy-token"))
    }

    override suspend fun getMe(): Response<UserMeResponse> {
        return Response.success(UserMeResponse(success = true))
    }

    override suspend fun listCustomers(
        page: Int,
        limit: Int,
        search: String?,
        centerId: String?,
        status: String?
    ): Response<ApiResponse<CustomerListResponse>> {
        return Response.success(ApiResponse(success = true, data = CustomerListResponse()))
    }

    override suspend fun createCustomer(request: CreateCustomerRequest): Response<ApiResponse<CustomerDto>> {
        val created = CustomerDto(
            id = "mock-uuid-12345",
            organizationId = "org-dfarm-01",
            primaryCenterId = request.primaryCenterId ?: "center-kolhapur-01",
            farmerCode = "F-KOL-001",
            fullName = request.fullName,
            normalizedMobileNumber = request.normalizedMobileNumber,
            status = "DRAFT",
            registrationStatus = "IN_PROGRESS",
            permittedCategories = request.permittedCategories
        )
        return Response.success(ApiResponse(success = true, data = created))
    }

    override suspend fun getCustomerById(customerId: String): Response<ApiResponse<CustomerDto>> {
        val customer = CustomerDto(
            id = customerId,
            organizationId = "org-dfarm-01",
            primaryCenterId = "center-kolhapur-01",
            fullName = "Pandurang Patil",
            normalizedMobileNumber = "+919876543210"
        )
        return Response.success(ApiResponse(success = true, data = customer))
    }

    override suspend fun updateCustomer(
        customerId: String,
        request: UpdateCustomerRequest
    ): Response<ApiResponse<CustomerDto>> {
        val updated = CustomerDto(
            id = customerId,
            organizationId = "org-dfarm-01",
            primaryCenterId = "center-kolhapur-01",
            fullName = request.fullName ?: "Pandurang Patil",
            normalizedMobileNumber = "+919876543210"
        )
        return Response.success(ApiResponse(success = true, data = updated))
    }

    override suspend fun assignRfid(
        customerId: String,
        request: com.dfarm.registration.data.models.RfidAssignRequest
    ): Response<ApiResponse<com.dfarm.registration.data.models.RfidAssignmentDto>> {
        return Response.success(ApiResponse(success = true))
    }

    override suspend fun replaceRfid(
        customerId: String,
        request: com.dfarm.registration.data.models.RfidReplaceRequest
    ): Response<ApiResponse<com.dfarm.registration.data.models.RfidAssignmentDto>> {
        return Response.success(ApiResponse(success = true))
    }

    override suspend fun getRfidStatus(
        customerId: String
    ): Response<ApiResponse<com.dfarm.registration.data.models.CustomerRfidStatusDto>> {
        return Response.success(ApiResponse(success = true, data = com.dfarm.registration.data.models.CustomerRfidStatusDto(customerId = customerId)))
    }

    override suspend fun revokeRfid(
        cardId: String,
        request: com.dfarm.registration.data.models.RfidRevokeRequest
    ): Response<ApiResponse<Map<String, String>>> {
        return Response.success(ApiResponse(success = true))
    }

    override suspend fun blockRfid(
        cardId: String,
        request: com.dfarm.registration.data.models.RfidBlockRequest
    ): Response<ApiResponse<Map<String, String>>> {
        return Response.success(ApiResponse(success = true))
    }
}

class CustomerRegistrationWizardTest {

    @Test
    fun testWizardStepProgressionAndValidation() {
        val fakeSession = FakeSessionManager()
        val fakeApi = FakeApiService()
        val customerRepo = CustomerRepository(fakeApi)
        val authRepo = AuthRepository(fakeApi, fakeSession)

        val viewModel = RegistrationWizardViewModel(customerRepo, authRepo)

        // Step 1: Initial state
        assertEquals(WizardStep.PERSONAL_DETAILS, viewModel.uiState.value.currentStep)

        // Attempting to advance with empty details must fail
        val advanceWithoutDetails = viewModel.goToNextStep()
        assertFalse(advanceWithoutDetails)
        assertEquals(WizardStep.PERSONAL_DETAILS, viewModel.uiState.value.currentStep)
        assertNotNull(viewModel.uiState.value.fullNameError)
        assertNotNull(viewModel.uiState.value.villageError)

        // Fill Personal Details
        viewModel.onFullNameChanged("Pandurang Patil")
        viewModel.onVillageChanged("Wadgaon")
        viewModel.onDistrictChanged("Kolhapur")
        viewModel.onTalukaChanged("Karveer")
        viewModel.onPostalCodeChanged("416001")

        // Advance to Step 2
        val advanceToStep2 = viewModel.goToNextStep()
        assertTrue(advanceToStep2)
        assertEquals(WizardStep.MOBILE_VALIDATION, viewModel.uiState.value.currentStep)

        // Step 2: Attempting to advance with invalid mobile must fail
        viewModel.onMobileDigitsChanged("12345") // Too short and starts with 1
        val advanceWithInvalidMobile = viewModel.goToNextStep()
        assertFalse(advanceWithInvalidMobile)
        assertEquals(WizardStep.MOBILE_VALIDATION, viewModel.uiState.value.currentStep)
        assertNotNull(viewModel.uiState.value.mobileError)

        // Enter valid 10-digit mobile starting with 6-9
        viewModel.onMobileDigitsChanged("9876543210")
        assertEquals("+919876543210", viewModel.uiState.value.normalizedMobile)

        // Advance to Step 3 (Milk Category)
        val advanceToStep3 = viewModel.goToNextStep()
        assertTrue(advanceToStep3)
        assertEquals(WizardStep.MILK_CATEGORY, viewModel.uiState.value.currentStep)

        // Select Milk Category Option
        viewModel.onCategoryOptionSelected(MilkCategoryOption.BOTH)
        assertEquals(listOf("COW", "BUFFALO"), viewModel.uiState.value.selectedCategoryOption.categories)

        // Advance to Step 4 (Review)
        val advanceToStep4 = viewModel.goToNextStep()
        assertTrue(advanceToStep4)
        assertEquals(WizardStep.REVIEW_DETAILS, viewModel.uiState.value.currentStep)

        // Test Step Backwards Navigation
        viewModel.goToPreviousStep()
        assertEquals(WizardStep.MILK_CATEGORY, viewModel.uiState.value.currentStep)

        viewModel.goToPreviousStep()
        assertEquals(WizardStep.MOBILE_VALIDATION, viewModel.uiState.value.currentStep)

        viewModel.goToPreviousStep()
        assertEquals(WizardStep.PERSONAL_DETAILS, viewModel.uiState.value.currentStep)
    }
}
