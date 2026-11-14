package com.dfarm.registration

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.dfarm.registration.data.api.ApiClient
import com.dfarm.registration.data.repository.ApiRfidRepository
import com.dfarm.registration.data.repository.AuthRepository
import com.dfarm.registration.data.repository.CustomerRepository
import com.dfarm.registration.data.storage.SessionManager
import com.dfarm.registration.ui.auth.LoginScreen
import com.dfarm.registration.ui.auth.LoginViewModel
import com.dfarm.registration.ui.enrollment.FaceEnrollmentScreen
import com.dfarm.registration.ui.enrollment.FaceEnrollmentViewModel
import com.dfarm.registration.ui.management.CustomerDetailScreen
import com.dfarm.registration.ui.management.CustomerDetailViewModel
import com.dfarm.registration.ui.management.CustomerEditScreen
import com.dfarm.registration.ui.management.CustomerEditViewModel
import com.dfarm.registration.ui.management.CustomerListScreen
import com.dfarm.registration.ui.management.CustomerListViewModel
import com.dfarm.registration.ui.registration.RegistrationWizardScreen
import com.dfarm.registration.ui.registration.RegistrationWizardViewModel
import com.dfarm.registration.ui.rfid.RfidAssignmentScreen
import com.dfarm.registration.ui.rfid.RfidAssignmentViewModel

@Composable
fun MainNavigation() {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val apiService = remember { ApiClient.createService(sessionManager) }
    val authRepository = remember { AuthRepository(apiService, sessionManager) }
    val customerRepository = remember { CustomerRepository(apiService) }

    val startKey = if (sessionManager.isLoggedIn()) CustomerListNavKey else LoginNavKey
    val backStack = rememberNavBackStack(startKey)

    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<LoginNavKey> {
                val loginVm = viewModel { LoginViewModel(authRepository) }
                LoginScreen(
                    viewModel = loginVm,
                    onLoginSuccess = {
                        backStack.clear()
                        backStack.add(CustomerListNavKey)
                    }
                )
            }

            entry<CustomerListNavKey> {
                val listVm = viewModel { CustomerListViewModel(customerRepository, authRepository) }
                CustomerListScreen(
                    viewModel = listVm,
                    officer = authRepository.getCurrentOfficer(),
                    onNavigateToRegistration = {
                        backStack.add(RegistrationWizardNavKey)
                    },
                    onNavigateToDetail = { customerId ->
                        backStack.add(CustomerDetailNavKey(customerId))
                    },
                    onLogout = {
                        authRepository.logout()
                        backStack.clear()
                        backStack.add(LoginNavKey)
                    }
                )
            }

            entry<RegistrationWizardNavKey> {
                val wizardVm = viewModel { RegistrationWizardViewModel(customerRepository, authRepository) }
                RegistrationWizardScreen(
                    viewModel = wizardVm,
                    onNavigateBack = { backStack.removeLastOrNull() },
                    onNavigateToCustomerList = {
                        backStack.removeLastOrNull()
                    },
                    onProceedToFaceEnrollment = { customerId, name, code ->
                        backStack.add(FaceEnrollment(customerId = customerId, customerName = name, farmerCode = code))
                    }
                )
            }

            entry<FaceEnrollment> { key ->
                val faceVm = viewModel(key = key.customerId) { FaceEnrollmentViewModel() }
                val currentToken = sessionManager.getToken() ?: ""
                FaceEnrollmentScreen(
                    customerId = key.customerId,
                    customerName = key.customerName,
                    farmerCode = key.farmerCode,
                    viewModel = faceVm,
                    token = currentToken,
                    onEnrollmentComplete = { _ ->
                        backStack.add(RfidAssignment)
                    },
                    onNavigateBack = { backStack.removeLastOrNull() }
                )
            }

            entry<RfidAssignment> {
                val rfidRepository = remember { ApiRfidRepository(apiService, customerRepository) }
                val rfidVm = viewModel { RfidAssignmentViewModel(repository = rfidRepository) }
                RfidAssignmentScreen(
                    viewModel = rfidVm,
                    onBackClick = { backStack.removeLastOrNull() }
                )
            }

            entry<CustomerDetailNavKey> { key ->
                val detailVm = viewModel(key = key.customerId) {
                    CustomerDetailViewModel(customerRepository)
                }
                CustomerDetailScreen(
                    customerId = key.customerId,
                    viewModel = detailVm,
                    onNavigateBack = { backStack.removeLastOrNull() },
                    onNavigateToEdit = { id ->
                        backStack.add(CustomerEditNavKey(id))
                    }
                )
            }

            entry<CustomerEditNavKey> { key ->
                val editVm = viewModel(key = key.customerId) {
                    CustomerEditViewModel(customerRepository)
                }
                CustomerEditScreen(
                    customerId = key.customerId,
                    viewModel = editVm,
                    onNavigateBack = { backStack.removeLastOrNull() }
                )
            }
        }
    )
}
