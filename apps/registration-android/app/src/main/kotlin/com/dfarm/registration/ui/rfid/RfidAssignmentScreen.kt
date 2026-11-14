package com.dfarm.registration.ui.rfid

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dfarm.registration.model.Customer
import com.dfarm.registration.model.RfidCardAssignment

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RfidAssignmentScreen(
  onBackClick: () -> Unit,
  modifier: Modifier = Modifier,
  viewModel: RfidAssignmentViewModel = viewModel()
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  var showRevokeDialog by remember { mutableStateOf(false) }
  var showBlockDialog by remember { mutableStateOf(false) }
  var dialogReason by remember { mutableStateOf("") }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    topBar = {
      CenterAlignedTopAppBar(
        title = { Text("RFID Assignment & Management", fontSize = 18.sp, fontWeight = FontWeight.Bold) },
        navigationIcon = {
          IconButton(onClick = onBackClick) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
          }
        },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
          containerColor = MaterialTheme.colorScheme.primaryContainer,
          titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
        )
      )
    }
  ) { paddingValues ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(paddingValues)
        .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      // 1. Hardware Boundary Banner
      item {
        HardwareBoundaryBanner(label = state.hardwareSourceLabel)
      }

      // 2. Feedback Banners
      state.errorMessage?.let { error ->
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
              Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
              Spacer(modifier = Modifier.width(8.dp))
              Text(error, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
              TextButton(onClick = { viewModel.dismissMessage() }) {
                Text("Dismiss", color = MaterialTheme.colorScheme.error)
              }
            }
          }
        }
      }

      state.successMessage?.let { success ->
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
              Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
              Spacer(modifier = Modifier.width(8.dp))
              Text(success, color = Color(0xFF1B5E20), modifier = Modifier.weight(1f))
              TextButton(onClick = { viewModel.dismissMessage() }) {
                Text("OK", color = Color(0xFF2E7D32))
              }
            }
          }
        }
      }

      // 3. Customer Selection Section
      item {
        CustomerSelectorSection(
          customers = state.customers,
          selectedCustomer = state.selectedCustomer,
          onCustomerSelected = { viewModel.selectCustomer(it) }
        )
      }

      // 4. Selected Customer Details & Canonical UUID
      state.selectedCustomer?.let { customer ->
        item {
          CustomerDetailsCard(customer = customer)
        }

        // 5. Active Card Status or Assignment Form
        if (state.activeAssignment != null && !state.isReplacing) {
          item {
            ActiveCardDisplayCard(
              assignment = state.activeAssignment!!,
              onReplaceClicked = { viewModel.startReplacement() },
              onRevokeClicked = {
                dialogReason = ""
                showRevokeDialog = true
              },
              onBlockClicked = {
                dialogReason = ""
                showBlockDialog = true
              }
            )
          }
        } else {
          // Assignment or Replacement Form
          item {
            Card(
              modifier = Modifier.fillMaxWidth(),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                  text = if (state.isReplacing) "Replace Active RFID Card" else "Assign New RFID Card",
                  style = MaterialTheme.typography.titleMedium,
                  fontWeight = FontWeight.Bold
                )

                if (state.isReplacing) {
                  Spacer(modifier = Modifier.height(8.dp))
                  Text("Select Replacement Reason:", style = MaterialTheme.typography.bodySmall)
                  val reasons = listOf("DAMAGED", "LOST", "STOLEN", "DEFECTIVE")
                  Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    reasons.forEach { reason ->
                      Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                          selected = state.replacementReason == reason,
                          onClick = { viewModel.onReplacementReasonChanged(reason) }
                        )
                        Text(reason, fontSize = 12.sp)
                      }
                    }
                  }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                  value = state.rawUidInput,
                  onValueChange = { viewModel.onUidInputChanged(it) },
                  label = { Text("SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED") },
                  placeholder = { Text("e.g. 04:A1:B2:C3:D4 or 04A1B2C3D4") },
                  modifier = Modifier.fillMaxWidth(),
                  singleLine = true,
                  supportingText = {
                    if (state.normalizedUid.isNotBlank()) {
                      Text(
                        "Normalized UID: ${state.normalizedUid} (${if (state.isValidUid) "Valid Hex" else "Invalid"})",
                        color = if (state.isValidUid) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                        fontFamily = FontFamily.Monospace
                      )
                    }
                  }
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                  if (state.isReplacing) {
                    Button(
                      onClick = { viewModel.confirmReplacement() },
                      enabled = state.isValidUid && !state.isLoading,
                      colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                      if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White)
                      } else {
                        Text("Confirm Replacement")
                      }
                    }
                    OutlinedButton(onClick = { viewModel.cancelReplacement() }) {
                      Text("Cancel")
                    }
                  } else {
                    Button(
                      onClick = { viewModel.assignCard() },
                      enabled = state.isValidUid && !state.isLoading && customer.activeCardUid == null,
                      modifier = Modifier.fillMaxWidth()
                    ) {
                      if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White)
                      } else {
                        Icon(Icons.Default.CreditCard, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Assign RFID Card")
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // 6. Assignment History
        item {
          Text(
            text = "Assignment History (${state.assignmentHistory.size})",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
          )
        }

        if (state.assignmentHistory.isEmpty()) {
          item {
            Text("No prior RFID card history recorded for this customer.", style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
          }
        } else {
          items(state.assignmentHistory) { assignment ->
            AssignmentHistoryItem(assignment = assignment)
          }
        }
      }
    }
  }

  // Revoke Dialog
  if (showRevokeDialog) {
    AlertDialog(
      onDismissRequest = { showRevokeDialog = false },
      title = { Text("Revoke RFID Card") },
      text = {
        Column {
          Text("Are you sure you want to revoke active card ${state.activeAssignment?.cardUid}?")
          Spacer(modifier = Modifier.height(8.dp))
          OutlinedTextField(
            value = dialogReason,
            onValueChange = { dialogReason = it },
            label = { Text("Revocation Reason") },
            placeholder = { Text("e.g. Farmer requested deactivation") },
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.revokeActiveCard(dialogReason.ifBlank { "MANUAL_REVOCATION" })
            showRevokeDialog = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
          Text("Revoke")
        }
      },
      dismissButton = {
        TextButton(onClick = { showRevokeDialog = false }) { Text("Cancel") }
      }
    )
  }

  // Block Dialog
  if (showBlockDialog) {
    AlertDialog(
      onDismissRequest = { showBlockDialog = false },
      title = { Text("Block RFID Card") },
      text = {
        Column {
          Text("Card ${state.activeAssignment?.cardUid} will be placed into BLOCKED status.")
          Spacer(modifier = Modifier.height(8.dp))
          OutlinedTextField(
            value = dialogReason,
            onValueChange = { dialogReason = it },
            label = { Text("Reason for Blocking") },
            placeholder = { Text("e.g. Suspected fraudulent presentation") },
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.blockActiveCard(dialogReason.ifBlank { "SECURITY_BLOCK" })
            showBlockDialog = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
          Text("Block Card")
        }
      },
      dismissButton = {
        TextButton(onClick = { showBlockDialog = false }) { Text("Cancel") }
      }
    )
  }
}

@Composable
fun HardwareBoundaryBanner(label: String) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1)),
    border = CardDefaults.outlinedCardBorder()
  ) {
    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
      Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFF57F17))
      Spacer(modifier = Modifier.width(10.dp))
      Column {
        Text(
          text = "HARDWARE BOUNDARY: $label",
          fontSize = 12.sp,
          fontWeight = FontWeight.Bold,
          color = Color(0xFFB78103)
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
          text = "Physical reader hardware integration is deferred. Enter hexadecimal UID manually for testing and registration.",
          fontSize = 11.sp,
          color = Color(0xFF5D4037)
        )
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerSelectorSection(
  customers: List<Customer>,
  selectedCustomer: Customer?,
  onCustomerSelected: (Customer) -> Unit
) {
  var expanded by remember { mutableStateOf(false) }

  ExposedDropdownMenuBox(
    expanded = expanded,
    onExpandedChange = { expanded = it },
    modifier = Modifier.fillMaxWidth()
  ) {
    OutlinedTextField(
      value = selectedCustomer?.let { "${it.farmerCode} - ${it.fullName}" } ?: "Select Customer",
      onValueChange = {},
      readOnly = true,
      label = { Text("Customer") },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
      modifier = Modifier
        .fillMaxWidth()
        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
    )

    ExposedDropdownMenu(
      expanded = expanded,
      onDismissRequest = { expanded = false }
    ) {
      customers.forEach { customer ->
        DropdownMenuItem(
          text = {
            Column {
              Text("${customer.farmerCode} - ${customer.fullName}", fontWeight = FontWeight.Bold)
              Text("Status: ${customer.status} | Face: ${if (customer.isFaceEnrolled) "Enrolled" else "Pending"}", fontSize = 11.sp, color = Color.Gray)
            }
          },
          onClick = {
            onCustomerSelected(customer)
            expanded = false
          }
        )
      }
    }
  }
}

@Composable
fun CustomerDetailsCard(customer: Customer) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("Customer Profile", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
      Spacer(modifier = Modifier.height(4.dp))
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Canonical UUID:", fontSize = 12.sp, color = Color.Gray)
        Text(customer.id, fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Farmer Code:", fontSize = 12.sp, color = Color.Gray)
        Text(customer.farmerCode, fontSize = 12.sp, fontWeight = FontWeight.Bold)
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Customer Name:", fontSize = 12.sp, color = Color.Gray)
        Text(customer.fullName, fontSize = 12.sp)
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Account Status:", fontSize = 12.sp, color = Color.Gray)
        Text(customer.status.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (customer.status.name == "ACTIVE") Color(0xFF2E7D32) else Color(0xFFE65100))
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Biometric Face Status:", fontSize = 12.sp, color = Color.Gray)
        Text(
          if (customer.isFaceEnrolled) "ENROLLED" else "PENDING",
          fontSize = 12.sp,
          fontWeight = FontWeight.Bold,
          color = if (customer.isFaceEnrolled) Color(0xFF2E7D32) else Color(0xFFC62828)
        )
      }
    }
  }
}

@Composable
fun ActiveCardDisplayCard(
  assignment: RfidCardAssignment,
  onReplaceClicked: () -> Unit,
  onRevokeClicked: () -> Unit,
  onBlockClicked: () -> Unit
) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD))
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.CreditCard, contentDescription = null, tint = Color(0xFF1565C0))
        Spacer(modifier = Modifier.width(8.dp))
        Text("Active RFID Card", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF0D47A1))
      }
      Spacer(modifier = Modifier.height(8.dp))
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Card UID:", fontSize = 12.sp)
        Text(assignment.cardUid, fontSize = 14.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Assigned At:", fontSize = 12.sp)
        Text(assignment.assignedAt, fontSize = 12.sp)
      }
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Assigned By:", fontSize = 12.sp)
        Text(assignment.assignedBy, fontSize = 12.sp)
      }

      Spacer(modifier = Modifier.height(12.dp))

      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
          onClick = onReplaceClicked,
          colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1565C0)),
          modifier = Modifier.weight(1f)
        ) {
          Text("Replace Card", fontSize = 12.sp)
        }
        OutlinedButton(
          onClick = onRevokeClicked,
          modifier = Modifier.weight(1f)
        ) {
          Text("Revoke", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
        }
        OutlinedButton(
          onClick = onBlockClicked,
          modifier = Modifier.weight(1f)
        ) {
          Text("Block", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
        }
      }
    }
  }
}

@Composable
fun AssignmentHistoryItem(assignment: RfidCardAssignment) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(
      containerColor = if (assignment.isActive) Color(0xFFE8F5E9) else Color(0xFFF5F5F5)
    )
  ) {
    Column(modifier = Modifier.padding(12.dp)) {
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(assignment.cardUid, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        Text(
          if (assignment.isActive) "ACTIVE" else "DEACTIVATED",
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          color = if (assignment.isActive) Color(0xFF2E7D32) else Color.Gray
        )
      }
      Text("Assigned: ${assignment.assignedAt} by ${assignment.assignedBy}", fontSize = 11.sp, color = Color.Gray)
      if (assignment.revokedAt != null) {
        Text("Revoked: ${assignment.revokedAt} - Reason: ${assignment.revocationReason ?: "None"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
      }
    }
  }
}

