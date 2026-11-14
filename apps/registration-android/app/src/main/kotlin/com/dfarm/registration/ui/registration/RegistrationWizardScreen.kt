package com.dfarm.registration.ui.registration

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.ui.components.FormInput
import com.dfarm.registration.ui.components.MilkCategoryBadge
import com.dfarm.registration.ui.components.MilkCategorySelector
import com.dfarm.registration.ui.components.PhoneInput
import com.dfarm.registration.ui.components.PrimaryButton
import com.dfarm.registration.ui.components.StatusBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationWizardScreen(
    viewModel: RegistrationWizardViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToCustomerList: () -> Unit,
    onProceedToFaceEnrollment: (customerId: String, customerName: String, farmerCode: String) -> Unit = { _, _, _ -> },
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "Customer Registration",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        if (state.currentStep != WizardStep.REGISTRATION_STATUS) {
                            Text(
                                text = "Step ${state.currentStep.stepNumber} of 4: ${state.currentStep.title}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    if (state.currentStep != WizardStep.REGISTRATION_STATUS) {
                        IconButton(onClick = {
                            if (state.currentStep == WizardStep.PERSONAL_DETAILS) {
                                onNavigateBack()
                            } else {
                                viewModel.goToPreviousStep()
                            }
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Step Progress Bar
            if (state.currentStep != WizardStep.REGISTRATION_STATUS) {
                LinearProgressIndicator(
                    progress = state.currentStep.stepNumber / 4f,
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // General error banner (e.g. duplicate mobile 409 from server)
                if (!state.generalError.isNullOrBlank()) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(14.dp)
                        ) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = state.generalError ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }
                }

                when (state.currentStep) {
                    WizardStep.PERSONAL_DETAILS -> {
                        PersonalDetailsStep(viewModel = viewModel, state = state)
                    }

                    WizardStep.MOBILE_VALIDATION -> {
                        MobileValidationStep(viewModel = viewModel, state = state)
                    }

                    WizardStep.MILK_CATEGORY -> {
                        MilkCategoryStep(viewModel = viewModel, state = state)
                    }

                    WizardStep.REVIEW_DETAILS -> {
                        ReviewDetailsStep(state = state)
                    }

                    WizardStep.REGISTRATION_STATUS -> {
                        RegistrationStatusStep(
                            customer = state.createdCustomer,
                            onRegisterAnother = { viewModel.resetWizard() },
                            onGoToList = onNavigateToCustomerList,
                            onProceedToFaceEnrollment = onProceedToFaceEnrollment
                        )
                    }
                }
            }

            // Bottom Navigation Actions
            if (state.currentStep != WizardStep.REGISTRATION_STATUS) {
                Surface(
                    tonalElevation = 4.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (state.currentStep != WizardStep.PERSONAL_DETAILS) {
                            OutlinedButton(
                                onClick = { viewModel.goToPreviousStep() },
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(50.dp)
                            ) {
                                Text("Previous")
                            }
                        }

                        val nextButtonText = when (state.currentStep) {
                            WizardStep.REVIEW_DETAILS -> "Submit Registration"
                            else -> "Continue"
                        }

                        PrimaryButton(
                            text = nextButtonText,
                            onClick = { viewModel.goToNextStep() },
                            isLoading = state.isSubmitting,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonalDetailsStep(
    viewModel: RegistrationWizardViewModel,
    state: RegistrationWizardUiState
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(
            text = "Farmer Personal Information",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Enter authoritative farmer identity as registered with local center.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(4.dp))

        FormInput(
            value = state.fullName,
            onValueChange = { viewModel.onFullNameChanged(it) },
            label = "Farmer Full Name *",
            placeholder = "e.g. Pandurang Tukaram Patil",
            leadingIcon = Icons.Default.Person,
            isError = state.fullNameError != null,
            errorMessage = state.fullNameError,
            imeAction = ImeAction.Next
        )

        FormInput(
            value = state.village,
            onValueChange = { viewModel.onVillageChanged(it) },
            label = "Village *",
            placeholder = "e.g. Wadgaon",
            leadingIcon = Icons.Default.LocationOn,
            isError = state.villageError != null,
            errorMessage = state.villageError,
            imeAction = ImeAction.Next
        )

        FormInput(
            value = state.taluka,
            onValueChange = { viewModel.onTalukaChanged(it) },
            label = "Taluka / Subdistrict",
            placeholder = "e.g. Karveer",
            imeAction = ImeAction.Next
        )

        FormInput(
            value = state.district,
            onValueChange = { viewModel.onDistrictChanged(it) },
            label = "District *",
            placeholder = "e.g. Kolhapur",
            isError = state.districtError != null,
            errorMessage = state.districtError,
            imeAction = ImeAction.Next
        )

        FormInput(
            value = state.postalCode,
            onValueChange = { viewModel.onPostalCodeChanged(it) },
            label = "Postal PIN Code",
            placeholder = "e.g. 416001",
            keyboardType = KeyboardType.Number,
            imeAction = ImeAction.Done
        )
    }
}

@Composable
private fun MobileValidationStep(
    viewModel: RegistrationWizardViewModel,
    state: RegistrationWizardUiState
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(
            text = "Primary Mobile & Verification",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "The mobile number serves as the primary unique communication key. It must be unique within the dairy organization.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(8.dp))

        PhoneInput(
            rawDigits = state.mobileDigits,
            onValueChange = { viewModel.onMobileDigitsChanged(it) },
            isError = state.mobileError != null,
            errorMessage = state.mobileError,
            imeAction = ImeAction.Done
        )

        // E.164 Normalization Preview
        if (state.normalizedMobile.isNotBlank()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(14.dp)
                ) {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Normalized E.164 Format",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = state.normalizedMobile,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MilkCategoryStep(
    viewModel: RegistrationWizardViewModel,
    state: RegistrationWizardUiState
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MilkCategorySelector(
            selectedOption = state.selectedCategoryOption,
            onOptionSelected = { viewModel.onCategoryOptionSelected(it) }
        )
    }
}

@Composable
private fun ReviewDetailsStep(
    state: RegistrationWizardUiState
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Review Registration Details",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Verify all details carefully before submitting to the canonical dairy ledger.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ReviewRow(label = "Full Name", value = state.fullName)
                ReviewRow(label = "Normalized Mobile", value = state.normalizedMobile)
                ReviewRow(label = "Village", value = state.village)
                ReviewRow(label = "Taluka", value = if (state.taluka.isNotBlank()) state.taluka else "—")
                ReviewRow(label = "District", value = state.district)
                ReviewRow(label = "PIN Code", value = if (state.postalCode.isNotBlank()) state.postalCode else "—")

                Divider(modifier = Modifier.padding(vertical = 4.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Milk Categories",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.selectedCategoryOption.categories.forEach { cat ->
                            MilkCategoryBadge(category = cat)
                        }
                    }
                }
            }
        }

        // Officer consent declaration
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.FactCheck,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "I verify that the farmer has provided valid physical KYC documentation and consent for dairy registration.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun RegistrationStatusStep(
    customer: CustomerDto?,
    onRegisterAnother: () -> Unit,
    onGoToList: () -> Unit,
    onProceedToFaceEnrollment: (customerId: String, customerName: String, farmerCode: String) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            shape = CircleShape,
            color = Color(0xFFE6F4EA),
            modifier = Modifier.size(72.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = Color(0xFF137333),
                    modifier = Modifier.size(40.dp)
                )
            }
        }

        Text(
            text = "Registration Created!",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Text(
            text = "Customer record created in authoritative PostgreSQL database.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (customer != null) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ReviewRow(label = "Customer Name", value = customer.fullName)
                    ReviewRow(label = "Mobile Number", value = customer.normalizedMobileNumber)
                    ReviewRow(label = "Farmer Code", value = customer.farmerCode ?: "Pending Assignment")

                    Divider()

                    Column {
                        Text(
                            text = "Server Canonical UUID",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = customer.id,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Current Status",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        StatusBadge(status = customer.status)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Permitted Milk",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            customer.permittedCategories.forEach { cat ->
                                MilkCategoryBadge(category = cat)
                            }
                        }
                    }
                }
            }

            // Pending Next Steps Banner
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Required Lifecycle Next Steps:",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = "👉 ", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = "Step 2: Biometric Face Enrollment (MobileFaceNet-ArcFace v1.0.0)",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = "👉 ", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = "Step 3: RFID Assignment (Software Manual Entry / Physical Deferred)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            PrimaryButton(
                text = "Proceed to Biometric Face Enrollment",
                onClick = {
                    onProceedToFaceEnrollment(customer.id, customer.fullName, customer.farmerCode ?: "")
                }
            )
        }

        OutlinedButton(
            onClick = onGoToList,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
        ) {
            Text("View in Customer List")
        }

        OutlinedButton(
            onClick = onRegisterAnother,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
        ) {
            Text("Register Another Customer")
        }
    }
}
