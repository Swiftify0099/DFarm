package com.dfarm.registration.ui.management

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dfarm.registration.ui.components.ErrorView
import com.dfarm.registration.ui.components.FormInput
import com.dfarm.registration.ui.components.LoadingIndicator
import com.dfarm.registration.ui.components.PrimaryButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerEditScreen(
    customerId: String,
    viewModel: CustomerEditViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    LaunchedEffect(customerId) {
        viewModel.loadCustomer(customerId)
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Edit Farmer Details", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when {
                state.isLoading -> {
                    LoadingIndicator(message = "Loading customer for editing...")
                }

                state.errorMessage != null && state.fullName.isBlank() -> {
                    ErrorView(
                        message = state.errorMessage ?: "",
                        onRetry = { viewModel.loadCustomer(customerId) }
                    )
                }

                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Protected Identifiers Card
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.Lock,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.outline,
                                        modifier = Modifier.padding(end = 6.dp)
                                    )
                                    Text(
                                        text = "Protected Identity Keys (Immutable)",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                }
                                Text(
                                    text = "Mobile: ${state.mobileNumber}  •  Code: ${state.farmerCode.ifBlank { "Pending" }}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        if (!state.errorMessage.isNullOrBlank()) {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(12.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = state.errorMessage ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onErrorContainer
                                    )
                                }
                            }
                        }

                        Text(
                            text = "Personal Details",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )

                        FormInput(
                            value = state.fullName,
                            onValueChange = { viewModel.onFullNameChanged(it) },
                            label = "Farmer Full Name *",
                            leadingIcon = Icons.Default.Person
                        )

                        Text(
                            text = "Address & Location",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )

                        FormInput(
                            value = state.village,
                            onValueChange = { viewModel.onVillageChanged(it) },
                            label = "Village *",
                            leadingIcon = Icons.Default.LocationOn
                        )

                        FormInput(
                            value = state.taluka,
                            onValueChange = { viewModel.onTalukaChanged(it) },
                            label = "Taluka / Subdistrict"
                        )

                        FormInput(
                            value = state.district,
                            onValueChange = { viewModel.onDistrictChanged(it) },
                            label = "District *"
                        )

                        FormInput(
                            value = state.postalCode,
                            onValueChange = { viewModel.onPostalCodeChanged(it) },
                            label = "Postal PIN Code",
                            keyboardType = KeyboardType.Number
                        )

                        Text(
                            text = "Bank Information",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )

                        FormInput(
                            value = state.bankName,
                            onValueChange = { viewModel.onBankNameChanged(it) },
                            label = "Bank Name",
                            leadingIcon = Icons.Default.AccountBalance
                        )

                        FormInput(
                            value = state.bankAccountNumber,
                            onValueChange = { viewModel.onBankAccountNumberChanged(it) },
                            label = "Account Number",
                            keyboardType = KeyboardType.Number
                        )

                        FormInput(
                            value = state.bankIfscCode,
                            onValueChange = { viewModel.onBankIfscCodeChanged(it) },
                            label = "IFSC Code"
                        )

                        FormInput(
                            value = state.bankAccountHolderName,
                            onValueChange = { viewModel.onBankAccountHolderChanged(it) },
                            label = "Account Holder Name",
                            imeAction = ImeAction.Done
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        PrimaryButton(
                            text = "Save Profile Changes",
                            onClick = { viewModel.saveChanges(onSuccess = onNavigateBack) },
                            isLoading = state.isSaving,
                            leadingIcon = Icons.Default.Save
                        )

                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}
