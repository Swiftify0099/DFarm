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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.ui.components.ErrorView
import com.dfarm.registration.ui.components.LoadingIndicator
import com.dfarm.registration.ui.components.MilkCategoryBadge
import com.dfarm.registration.ui.components.PrimaryButton
import com.dfarm.registration.ui.components.StatusBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerDetailScreen(
    customerId: String,
    viewModel: CustomerDetailViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    var showDeactivateDialog by remember { mutableStateOf(false) }
    var showRestoreDialog by remember { mutableStateOf(false) }
    var actionReason by remember { mutableStateOf("") }

    LaunchedEffect(customerId) {
        viewModel.loadCustomer(customerId)
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Farmer Profile", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { onNavigateToEdit(customerId) }) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit Customer")
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
                    LoadingIndicator(message = "Loading customer profile...")
                }

                state.errorMessage != null -> {
                    ErrorView(
                        message = state.errorMessage ?: "",
                        onRetry = { viewModel.loadCustomer(customerId) }
                    )
                }

                state.customer != null -> {
                    val customer = state.customer!!
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Header Card
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(18.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = customer.fullName,
                                            style = MaterialTheme.typography.titleLarge,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        if (!customer.farmerCode.isNullOrBlank()) {
                                            Text(
                                                text = "Farmer Code: ${customer.farmerCode}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }
                                    StatusBadge(status = customer.status)
                                }

                                Divider()

                                Column {
                                    Text(
                                        text = "Server Canonical Customer UUID:",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                    Text(
                                        text = customer.id,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }

                        // Identity & Contact Card
                        DetailSectionCard(title = "Contact & Identity", icon = Icons.Default.Phone) {
                            DetailRow(label = "Mobile (E.164)", value = customer.normalizedMobileNumber)
                            DetailRow(label = "Primary Center ID", value = customer.primaryCenterId)
                            DetailRow(label = "Registration Status", value = customer.registrationStatus)
                        }

                        // Geographic Address Card
                        DetailSectionCard(title = "Address & Location", icon = Icons.Default.LocationOn) {
                            DetailRow(label = "Village", value = customer.address?.village ?: "—")
                            DetailRow(label = "Taluka", value = customer.address?.talukaSubdistrict ?: "—")
                            DetailRow(label = "District", value = customer.address?.district ?: "—")
                            DetailRow(label = "State", value = customer.address?.state ?: "Maharashtra")
                            DetailRow(label = "PIN Code", value = customer.address?.postalCode ?: "—")
                        }

                        // Milk Category Permissions Card
                        DetailSectionCard(title = "Milk Delivery Permissions", icon = Icons.Default.Badge) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Permitted Categories",
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

                        // Financial & Bank Card
                        if (!customer.bankAccountNumber.isNullOrBlank() || !customer.bankName.isNullOrBlank()) {
                            DetailSectionCard(title = "Banking Information", icon = Icons.Default.AccountBalance) {
                                DetailRow(label = "Bank Name", value = customer.bankName ?: "—")
                                DetailRow(
                                    label = "Account Number",
                                    value = if (customer.bankAccountNumber != null) "•••• •••• " + customer.bankAccountNumber.takeLast(4) else "—"
                                )
                                DetailRow(label = "IFSC Code", value = customer.bankIfscCode ?: "—")
                                DetailRow(label = "Account Holder", value = customer.bankAccountHolderName ?: customer.fullName)
                            }
                        }

                        // KYC Progress Tracker Card
                        Card(
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "KYC & Hardware Readiness Checklist",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )

                                KycStepItem(
                                    stepName = "Personal Details & Canonical UUID",
                                    isCompleted = true,
                                    note = "Verified in PostgreSQL ledger"
                                )
                                KycStepItem(
                                    stepName = "Unique Mobile Validation",
                                    isCompleted = true,
                                    note = customer.normalizedMobileNumber
                                )
                                KycStepItem(
                                    stepName = "Facial Biometric Enrollment",
                                    isCompleted = false,
                                    note = "Scheduled for Phase 07"
                                )
                                KycStepItem(
                                    stepName = "Physical RFID Card Assignment",
                                    isCompleted = false,
                                    note = "Scheduled for Phase 08"
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        if (state.actionSuccessMessage != null) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFE6F4EA),
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, tint = Color(0xFF137333))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = state.actionSuccessMessage ?: "",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color(0xFF137333),
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }

                        PrimaryButton(
                            text = "Edit Farmer Details",
                            onClick = { onNavigateToEdit(customerId) },
                            leadingIcon = Icons.Default.Edit
                        )

                        val isSoftDeleted = customer.status == "SOFT_DELETED" || customer.status == "INACTIVE"
                        if (isSoftDeleted) {
                            Button(
                                onClick = {
                                    actionReason = ""
                                    showRestoreDialog = true
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF137333)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth().height(50.dp)
                            ) {
                                Icon(Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Restore Customer Profile", fontWeight = FontWeight.SemiBold)
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    actionReason = ""
                                    showDeactivateDialog = true
                                },
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth().height(50.dp)
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Deactivate Customer (Soft-Delete)", fontWeight = FontWeight.SemiBold)
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }
            }
        }

        if (showDeactivateDialog) {
            AlertDialog(
                onDismissRequest = { showDeactivateDialog = false },
                title = { Text("Deactivate Customer") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("This customer will be soft-deleted. Historical milk collections, ledger, and payouts are permanently preserved in the PostgreSQL ledger.")
                        OutlinedTextField(
                            value = actionReason,
                            onValueChange = { actionReason = it },
                            label = { Text("Reason (min 5 characters)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (actionReason.trim().length >= 5) {
                                viewModel.deactivateCustomer(actionReason.trim()) { success ->
                                    if (success) {
                                        showDeactivateDialog = false
                                        actionReason = ""
                                    }
                                }
                            }
                        },
                        enabled = actionReason.trim().length >= 5
                    ) {
                        Text("Deactivate")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeactivateDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        if (showRestoreDialog) {
            AlertDialog(
                onDismissRequest = { showRestoreDialog = false },
                title = { Text("Restore Customer") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("This customer will be restored back to ACTIVE status.")
                        OutlinedTextField(
                            value = actionReason,
                            onValueChange = { actionReason = it },
                            label = { Text("Reason (min 5 characters)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (actionReason.trim().length >= 5) {
                                viewModel.restoreCustomer(actionReason.trim()) { success ->
                                    if (success) {
                                        showRestoreDialog = false
                                        actionReason = ""
                                    }
                                }
                            }
                        },
                        enabled = actionReason.trim().length >= 5
                    ) {
                        Text("Restore")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showRestoreDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

@Composable
private fun DetailSectionCard(
    title: String,
    icon: ImageVector,
    content: @Composable () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Divider()
            content()
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
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
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun KycStepItem(
    stepName: String,
    isCompleted: Boolean,
    note: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = if (isCompleted) Color(0xFFE6F4EA) else Color(0xFFFEF7E0),
            modifier = Modifier.size(24.dp)
        ) {
            Icon(
                if (isCompleted) Icons.Default.Check else Icons.Default.HourglassEmpty,
                contentDescription = null,
                tint = if (isCompleted) Color(0xFF137333) else Color(0xFFB06000),
                modifier = Modifier.padding(3.dp)
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(
                text = stepName,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = note,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
