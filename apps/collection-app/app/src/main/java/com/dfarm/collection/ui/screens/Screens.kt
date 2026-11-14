package com.dfarm.collection.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.dfarm.collection.data.models.CollectionHistoryItemDto
import com.dfarm.collection.data.models.ShiftSummaryDto
import com.dfarm.collection.data.repository.CollectionRepository
import com.dfarm.collection.domain.identification.IdentificationResult
import com.dfarm.collection.domain.measurement.*
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.receipt.ReceiptFormatter
import com.dfarm.collection.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: CollectionRepository,
    onLoginSuccess: () -> Unit
) {
    var username by remember { mutableStateOf("operator_tasgaon@test.dfarm.com") }
    var password by remember { mutableStateOf("Password@123") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("DFARM INTAKE COUNTER", style = MaterialTheme.typography.headlineLarge, color = PrimaryLight)
        Text("Dairy Milk Collection Terminal", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(32.dp))

        Card(
            modifier = Modifier.width(450.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("Operator Authentication", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(16.dp))

                if (errorMessage != null) {
                    Surface(
                        color = StatusError.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = StatusError,
                            modifier = Modifier.padding(12.dp),
                            fontSize = 13.sp
                        )
                    }
                }

                OutlinedTextField(
                    value = username,
                    onValueChange = {
                        username = it
                        errorMessage = null
                    },
                    label = { Text("Operator Email or Username") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = {
                        password = it
                        errorMessage = null
                    },
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        if (username.isBlank() || password.isBlank()) {
                            errorMessage = "Please enter username and password"
                            return@Button
                        }
                        isLoading = true
                        errorMessage = null
                        coroutineScope.launch {
                            val res = repository.login(username, password)
                            isLoading = false
                            if (res.isSuccess) {
                                onLoginSuccess()
                            } else {
                                errorMessage = res.exceptionOrNull()?.message ?: "Login failed"
                            }
                        }
                    },
                    enabled = !isLoading,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = TextPrimary, modifier = Modifier.size(24.dp))
                    } else {
                        Text("START COUNTER SESSION", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun DashboardScreen(
    operatorName: String,
    centerName: String,
    shift: Shift,
    pendingSyncCount: Int,
    onStartCollection: () -> Unit,
    onViewHistory: () -> Unit,
    onSyncNow: () -> Unit,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(24.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("DFarm Collection Terminal", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
                Text("Center: $centerName | Shift: $shift | Operator: $operatorName", style = MaterialTheme.typography.bodyMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = if (pendingSyncCount == 0) StatusValid.copy(alpha = 0.2f) else StatusWarning.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.border(1.dp, if (pendingSyncCount == 0) StatusValid else StatusWarning, RoundedCornerShape(8.dp))
                ) {
                    Text(
                        text = if (pendingSyncCount == 0) "SYNCED (ONLINE)" else "OFFLINE ($pendingSyncCount PENDING)",
                        color = if (pendingSyncCount == 0) StatusValid else StatusWarning,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        fontWeight = FontWeight.Bold
                    )
                }

                OutlinedButton(onClick = onSyncNow) {
                    Text("SYNC NOW")
                }

                IconButton(onClick = onLogout) {
                    Icon(Icons.Default.ExitToApp, contentDescription = "Logout", tint = StatusError)
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Card(
                modifier = Modifier.weight(1f).height(180.dp),
                colors = CardDefaults.cardColors(containerColor = PrimaryGreen),
                onClick = onStartCollection
            ) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("NEW MILK INTAKE", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("RFID Tap / Supervisor Manual / Face", style = MaterialTheme.typography.bodyMedium, color = TextPrimary)
                }
            }

            Card(
                modifier = Modifier.weight(1f).height(180.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                onClick = onViewHistory
            ) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("SHIFT TRANSACTIONS", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Shift Summary, Receipts & History", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                }
            }
        }
    }
}

@Composable
fun IdentificationScreen(
    repository: CollectionRepository,
    onIdentified: (customer: Customer, method: IdentificationMethod) -> Unit,
    onCancel: () -> Unit
) {
    var selectedMethod by remember { mutableStateOf(IdentificationMethod.RFID) }
    var rfidInput by remember { mutableStateOf("") }
    var searchCode by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<Customer>>(emptyList()) }
    var selectedCandidate by remember { mutableStateOf<Customer?>(null) }
    var showSupervisorDialog by remember { mutableStateOf(false) }
    var supervisorReason by remember { mutableStateOf("FACE_RECOGNITION_FAILED") }
    var supervisorNotes by remember { mutableStateOf("Face recognition uncalibrated, verified farmer identity manually") }
    var supervisorPin by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("CUSTOMER IDENTIFICATION", style = MaterialTheme.typography.headlineMedium)
        Text("Approved Methods: 1. Face (Fail-Safe Guard) -> 2. RFID Card -> 3. Supervisor Manual", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(20.dp))

        Row(modifier = Modifier.fillMaxWidth(0.85f), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FilterChip(
                selected = selectedMethod == IdentificationMethod.FACE,
                onClick = {
                    selectedMethod = IdentificationMethod.FACE
                    errorMessage = null
                },
                label = { Text("1. FACE RECOGNITION") }
            )
            FilterChip(
                selected = selectedMethod == IdentificationMethod.RFID,
                onClick = {
                    selectedMethod = IdentificationMethod.RFID
                    errorMessage = null
                },
                label = { Text("2. RFID CARD TAP") }
            )
            FilterChip(
                selected = selectedMethod == IdentificationMethod.SUPERVISOR_MANUAL,
                onClick = {
                    selectedMethod = IdentificationMethod.SUPERVISOR_MANUAL
                    errorMessage = null
                },
                label = { Text("3. SUPERVISOR MANUAL") }
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (errorMessage != null) {
            Surface(
                color = StatusError.copy(alpha = 0.15f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.width(550.dp).padding(bottom = 16.dp)
            ) {
                Text(
                    text = errorMessage ?: "",
                    color = StatusError,
                    modifier = Modifier.padding(12.dp),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        Card(
            modifier = Modifier.width(550.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                when (selectedMethod) {
                    IdentificationMethod.FACE -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(160.dp)
                                .background(CardBackground, RoundedCornerShape(12.dp))
                                .border(2.dp, AccentAmber, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                                Icon(Icons.Default.Warning, contentDescription = "Notice", tint = AccentAmber, modifier = Modifier.size(36.dp))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "FAIL-SAFE ACTIVE: Face recognition ONNX model is uncalibrated / unapproved for production.\nAutomatic matching is disabled to prevent fake identity matches.",
                                    textAlign = TextAlign.Center,
                                    fontSize = 13.sp,
                                    color = TextPrimary
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(20.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = { selectedMethod = IdentificationMethod.RFID },
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                                modifier = Modifier.weight(1f).height(48.dp)
                            ) {
                                Text("USE RFID CARD TAP")
                            }
                            Button(
                                onClick = { selectedMethod = IdentificationMethod.SUPERVISOR_MANUAL },
                                colors = ButtonDefaults.buttonColors(containerColor = CardBackground),
                                modifier = Modifier.weight(1f).height(48.dp)
                            ) {
                                Text("SUPERVISOR MANUAL")
                            }
                        }
                    }

                    IdentificationMethod.RFID -> {
                        Text("Hold or enter customer RFID card UID:", style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedTextField(
                            value = rfidInput,
                            onValueChange = {
                                rfidInput = it
                                errorMessage = null
                            },
                            label = { Text("RFID Card UID (e.g. RFID-COW-1001 or 04A1B2C3)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(20.dp))

                        Button(
                            onClick = {
                                if (rfidInput.isBlank()) {
                                    errorMessage = "Please enter or scan an RFID card UID"
                                    return@Button
                                }
                                isLoading = true
                                errorMessage = null
                                coroutineScope.launch {
                                    val result = repository.identifyByRfid(rfidInput)
                                    isLoading = false
                                    when (result) {
                                        is IdentificationResult.Success -> {
                                            onIdentified(result.customer, IdentificationMethod.RFID)
                                        }
                                        is IdentificationResult.Failure -> {
                                            errorMessage = "${result.reason} [${result.errorCode}]"
                                        }
                                    }
                                }
                            },
                            enabled = !isLoading,
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(color = TextPrimary, modifier = Modifier.size(24.dp))
                            } else {
                                Text("VERIFY RFID CARD")
                            }
                        }
                    }

                    IdentificationMethod.SUPERVISOR_MANUAL -> {
                        Text("Search Registered Customer by Farmer Code, Name, or Mobile:", style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(12.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = searchCode,
                                onValueChange = {
                                    searchCode = it
                                    errorMessage = null
                                },
                                label = { Text("Farmer Code, Name, or Mobile") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                            Button(
                                onClick = {
                                    isLoading = true
                                    errorMessage = null
                                    coroutineScope.launch {
                                        val list = repository.searchCustomers(searchCode)
                                        isLoading = false
                                        searchResults = list
                                        if (list.isEmpty()) {
                                            errorMessage = "No active customers matching '$searchCode' found"
                                        }
                                    }
                                },
                                modifier = Modifier.height(56.dp)
                            ) {
                                Text("SEARCH")
                            }
                        }

                        if (searchResults.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Select Customer for Supervisor Verification:", style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(8.dp))

                            Box(modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp)) {
                                LazyColumn(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(searchResults) { cust ->
                                        Surface(
                                            color = CardBackground,
                                            shape = RoundedCornerShape(8.dp),
                                            modifier = Modifier.fillMaxWidth().clickable {
                                                selectedCandidate = cust
                                                showSupervisorDialog = true
                                            }
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(12.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column {
                                                    Text(cust.fullName, fontWeight = FontWeight.Bold)
                                                    Text("Code: ${cust.farmerCode} | Permitted: ${cust.permittedCategories.joinToString()}", fontSize = 12.sp, color = TextSecondary)
                                                }
                                                Icon(Icons.Default.CheckCircle, contentDescription = "Select", tint = PrimaryLight)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                    Text("CANCEL")
                }
            }
        }
    }

    if (showSupervisorDialog && selectedCandidate != null) {
        val cust = selectedCandidate!!
        Dialog(onDismissRequest = { showSupervisorDialog = false }) {
            Card(
                modifier = Modifier.width(480.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text("Supervisor Identity Verification", style = MaterialTheme.typography.titleLarge)
                    Text("Customer: ${cust.fullName} (${cust.farmerCode})", style = MaterialTheme.typography.bodyMedium, color = AccentAmber)
                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Reason Category:", fontSize = 13.sp, color = TextSecondary)
                    var reasonExpanded by remember { mutableStateOf(false) }
                    val reasons = listOf("FACE_RECOGNITION_FAILED", "DAMAGED_RFID", "LOST_RFID", "UNREGISTERED_BIOMETRIC", "OTHER")

                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { reasonExpanded = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(supervisorReason)
                        }
                        DropdownMenu(
                            expanded = reasonExpanded,
                            onDismissRequest = { reasonExpanded = false }
                        ) {
                            reasons.forEach { r ->
                                DropdownMenuItem(
                                    text = { Text(r) },
                                    onClick = {
                                        supervisorReason = r
                                        reasonExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = supervisorNotes,
                        onValueChange = { supervisorNotes = it },
                        label = { Text("Audit Justification Notes (min 5 chars)") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = supervisorPin,
                        onValueChange = { supervisorPin = it },
                        label = { Text("Supervisor PIN (Optional)") },
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    Spacer(modifier = Modifier.height(20.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(
                            onClick = { showSupervisorDialog = false },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("CANCEL")
                        }
                        Button(
                            onClick = {
                                if (supervisorNotes.trim().length < 5) {
                                    errorMessage = "Supervisor notes must be at least 5 characters"
                                    showSupervisorDialog = false
                                    return@Button
                                }
                                isLoading = true
                                showSupervisorDialog = false
                                coroutineScope.launch {
                                    val result = repository.verifyBySupervisor(
                                        targetCustomerUuid = cust.id,
                                        reasonCategory = supervisorReason,
                                        justificationNotes = supervisorNotes,
                                        supervisorPin = supervisorPin.ifBlank { null }
                                    )
                                    isLoading = false
                                    when (result) {
                                        is IdentificationResult.Success -> {
                                            onIdentified(result.customer, IdentificationMethod.SUPERVISOR_MANUAL)
                                        }
                                        is IdentificationResult.Failure -> {
                                            errorMessage = "${result.reason} [${result.errorCode}]"
                                        }
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("CONFIRM")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CustomerInfoScreen(
    customer: Customer,
    method: IdentificationMethod,
    onProceed: () -> Unit,
    onReject: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("VERIFIED CUSTOMER DETAILS", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(24.dp))

        Card(
            modifier = Modifier.width(550.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("Farmer Code: ${customer.farmerCode}", style = MaterialTheme.typography.titleLarge, color = AccentAmber)
                Text("Customer: ${customer.fullName}", style = MaterialTheme.typography.headlineMedium)
                if (customer.mobileNumber.isNotBlank()) {
                    Text("Mobile: ${customer.mobileNumber}", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                }
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider(color = CardBackground)
                Spacer(modifier = Modifier.height(12.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Auth Method:", color = TextSecondary)
                    Text(method.name, fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Account Status:", color = TextSecondary)
                    Text(customer.status.name, color = StatusValid, fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Authorized Milk:", color = TextSecondary)
                    Text(customer.permittedCategories.joinToString(", "), fontWeight = FontWeight.Bold, color = PrimaryLight)
                }

                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedButton(onClick = onReject, modifier = Modifier.weight(1f)) {
                        Text("NOT THIS FARMER")
                    }
                    Button(
                        onClick = onProceed,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        Text("PROCEED")
                    }
                }
            }
        }
    }
}

@Composable
fun CategorySelectionScreen(
    customer: Customer,
    onCategoryChosen: (MilkCategory) -> Unit,
    onCancel: () -> Unit
) {
    val cowPermitted = customer.permittedCategories.contains(MilkCategory.COW)
    val bufPermitted = customer.permittedCategories.contains(MilkCategory.BUFFALO)

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("SELECT MILK CATEGORY", style = MaterialTheme.typography.headlineMedium)
        Text("Choose from the categories authorized for ${customer.fullName}", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(32.dp))

        Row(modifier = Modifier.width(550.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Card(
                modifier = Modifier.weight(1f).height(160.dp),
                colors = CardDefaults.cardColors(containerColor = if (cowPermitted) PrimaryGreen else CardBackground.copy(alpha = 0.5f)),
                onClick = { if (cowPermitted) onCategoryChosen(MilkCategory.COW) }
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("COW MILK", style = MaterialTheme.typography.headlineMedium, color = if (cowPermitted) TextPrimary else TextSecondary)
                    if (!cowPermitted) {
                        Text("(Not Authorized)", fontSize = 12.sp, color = StatusError)
                    }
                }
            }

            Card(
                modifier = Modifier.weight(1f).height(160.dp),
                colors = CardDefaults.cardColors(containerColor = if (bufPermitted) SurfaceDark else CardBackground.copy(alpha = 0.5f)),
                onClick = { if (bufPermitted) onCategoryChosen(MilkCategory.BUFFALO) }
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("BUFFALO MILK", style = MaterialTheme.typography.headlineMedium, color = if (bufPermitted) TextPrimary else TextSecondary)
                    if (!bufPermitted) {
                        Text("(Not Authorized)", fontSize = 12.sp, color = StatusError)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        OutlinedButton(onClick = onCancel, modifier = Modifier.width(550.dp)) {
            Text("CANCEL")
        }
    }
}

@Composable
fun MeasurementScreen(
    customer: Customer,
    category: MilkCategory,
    repository: CollectionRepository,
    onRateCalculated: (weightKg: Double, fat: Double, snf: Double, rateResult: RateCalculationResult) -> Unit,
    onCancel: () -> Unit
) {
    var weightText by remember { mutableStateOf("15.5") }
    var fatText by remember { mutableStateOf(if (category == MilkCategory.COW) "4.2" else "6.5") }
    var snfText by remember { mutableStateOf(if (category == MilkCategory.COW) "8.5" else "9.0") }
    var isLoading by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    val isCow = category == MilkCategory.COW
    val minFat = if (isCow) 2.8 else 5.0
    val maxFat = if (isCow) 6.0 else 12.0
    val minSnf = if (isCow) 7.8 else 8.2
    val maxSnf = if (isCow) 10.2 else 11.5

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("RECORD MEASUREMENTS: $category MILK", style = MaterialTheme.typography.headlineMedium)
        Text("Customer: ${customer.fullName} (${customer.farmerCode})", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(16.dp))

        Surface(
            color = CardBackground,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth(0.7f).padding(bottom = 16.dp)
        ) {
            Text(
                "Biological Bounds for $category: Fat: $minFat - $maxFat% | SNF: $minSnf - $maxSnf% | Canonical Unit: KG",
                color = AccentAmber,
                modifier = Modifier.padding(12.dp),
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )
        }

        if (validationError != null) {
            Surface(
                color = StatusError.copy(alpha = 0.15f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.width(500.dp).padding(bottom = 16.dp)
            ) {
                Text(
                    text = validationError ?: "",
                    color = StatusError,
                    modifier = Modifier.padding(12.dp),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        Card(
            modifier = Modifier.width(500.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = {
                        weightText = it
                        validationError = null
                    },
                    label = { Text("Net Weight (KG)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = fatText,
                    onValueChange = {
                        fatText = it
                        validationError = null
                    },
                    label = { Text("Fat Percentage (%)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = snfText,
                    onValueChange = {
                        snfText = it
                        validationError = null
                    },
                    label = { Text("SNF Percentage (%)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) {
                        Text("CANCEL")
                    }
                    Button(
                        onClick = {
                            val w = weightText.toDoubleOrNull()
                            val f = fatText.toDoubleOrNull()
                            val s = snfText.toDoubleOrNull()

                            if (w == null || w <= 0 || w > 500.0) {
                                validationError = "Net weight must be between 0.01 and 500.00 KG"
                                return@Button
                            }
                            if (f == null || f < minFat || f > maxFat) {
                                validationError = "Fat $f% is outside biological bounds [$minFat - $maxFat%]"
                                return@Button
                            }
                            if (s == null || s < minSnf || s > maxSnf) {
                                validationError = "SNF $s% is outside biological bounds [$minSnf - $maxSnf%]"
                                return@Button
                            }

                            isLoading = true
                            validationError = null
                            coroutineScope.launch {
                                val rateResult = repository.calculateRate(category, f, s, w)
                                isLoading = false
                                if (rateResult.isSuccess) {
                                    onRateCalculated(w, f, s, rateResult.getOrThrow())
                                } else {
                                    validationError = rateResult.exceptionOrNull()?.message ?: "Failed to calculate rate"
                                }
                            }
                        },
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = TextPrimary, modifier = Modifier.size(24.dp))
                        } else {
                            Text("VALIDATE & REVIEW")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TransactionReviewScreen(
    customer: Customer,
    category: MilkCategory,
    netWeight: Double,
    fat: Double,
    snf: Double,
    rateCalculation: RateCalculationResult,
    isLoading: Boolean,
    errorMessage: String?,
    onConfirmCommit: () -> Unit,
    onCancelSession: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("TRANSACTION REVIEW & PRICING", style = MaterialTheme.typography.headlineMedium)
        Text("Customer: ${customer.fullName} (${customer.farmerCode})", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(16.dp))

        if (errorMessage != null) {
            Surface(
                color = StatusError.copy(alpha = 0.15f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.width(550.dp).padding(bottom = 16.dp)
            ) {
                Text(
                    text = errorMessage,
                    color = StatusError,
                    modifier = Modifier.padding(12.dp),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        Card(
            modifier = Modifier.width(550.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Milk Category:", color = TextSecondary)
                    Text(category.name, fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Net Quantity:", color = TextSecondary)
                    Text("$netWeight KG", fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Fat / SNF:", color = TextSecondary)
                    Text("$fat% / $snf%", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = CardBackground)
                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Applied Rate:", color = TextSecondary)
                    Text("INR ${rateCalculation.appliedRate} / KG", fontWeight = FontWeight.Bold, color = AccentAmber)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Calculation Rule:", color = TextSecondary)
                    Text(rateCalculation.calculationRule, fontSize = 12.sp)
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("TOTAL AMOUNT:", style = MaterialTheme.typography.titleLarge)
                    Text("INR ${rateCalculation.totalAmount}", style = MaterialTheme.typography.headlineMedium, color = StatusValid)
                }

                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedButton(onClick = onCancelSession, enabled = !isLoading, modifier = Modifier.weight(1f)) {
                        Text("CANCEL SESSION")
                    }
                    Button(
                        onClick = onConfirmCommit,
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = TextPrimary, modifier = Modifier.size(24.dp))
                        } else {
                            Text("COMMIT & PRINT")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ReceiptScreen(
    receiptText: String,
    onDone: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("INTAKE RECEIPT (40-COL THERMAL SLIP)", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.width(420.dp),
            colors = CardDefaults.cardColors(containerColor = CardBackground)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = receiptText,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = TextPrimary
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onDone,
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
            modifier = Modifier.width(420.dp).height(48.dp)
        ) {
            Text("DONE (NEXT CUSTOMER)")
        }
    }
}

@Composable
fun HistoryScreen(
    repository: CollectionRepository,
    currentShift: Shift,
    onDone: () -> Unit
) {
    var historyItems by remember { mutableStateOf<List<CollectionHistoryItemDto>>(emptyList()) }
    var shiftSummary by remember { mutableStateOf<ShiftSummaryDto?>(null) }
    var selectedShiftFilter by remember { mutableStateOf("ALL") }
    var selectedCategoryFilter by remember { mutableStateOf("ALL") }
    var searchQuery by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }
    var selectedReceiptText by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isLoading = true
        historyItems = repository.getCollectionHistory()
        shiftSummary = repository.getShiftSummary(currentShift, "")
        isLoading = false
    }

    val filteredItems = historyItems.filter { item ->
        val matchesShift = selectedShiftFilter == "ALL" || item.shiftType.equals(selectedShiftFilter, true)
        val matchesCategory = selectedCategoryFilter == "ALL" || item.selectedMilkCategory.equals(selectedCategoryFilter, true)
        val q = searchQuery.trim()
        val matchesSearch = q.isBlank() || (item.farmerCode?.contains(q, true) == true) || (item.customerName?.contains(q, true) == true)
        matchesShift && matchesCategory && matchesSearch
    }

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("SHIFT COLLECTIONS & HISTORY", style = MaterialTheme.typography.headlineMedium)
                Text("Center: ${repository.getActiveCenterName()} | Shift: $currentShift", style = MaterialTheme.typography.bodyMedium)
            }
            Button(onClick = onDone, colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)) {
                Text("BACK TO DASHBOARD")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Shift summary banner
        shiftSummary?.let { s ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Collections", fontSize = 12.sp, color = TextSecondary)
                        Text("${s.totalCollections}", style = MaterialTheme.typography.titleLarge)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Total Weight", fontSize = 12.sp, color = TextSecondary)
                        Text("${s.totalWeightKg} KG", style = MaterialTheme.typography.titleLarge)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Avg Fat / SNF", fontSize = 12.sp, color = TextSecondary)
                        Text("${s.averageFat}% / ${s.averageSnf}%", style = MaterialTheme.typography.titleLarge)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Total Payable", fontSize = 12.sp, color = TextSecondary)
                        Text("INR ${s.totalAmount}", style = MaterialTheme.typography.titleLarge, color = StatusValid)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Search & Filter controls
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search Farmer Code or Name") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = selectedShiftFilter == "ALL",
                    onClick = { selectedShiftFilter = "ALL" },
                    label = { Text("ALL SHIFTS") }
                )
                FilterChip(
                    selected = selectedShiftFilter == "MORNING",
                    onClick = { selectedShiftFilter = "MORNING" },
                    label = { Text("MORNING") }
                )
                FilterChip(
                    selected = selectedShiftFilter == "EVENING",
                    onClick = { selectedShiftFilter = "EVENING" },
                    label = { Text("EVENING") }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PrimaryLight)
            }
        } else if (filteredItems.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No collections found matching criteria.", color = TextSecondary)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(filteredItems) { col ->
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable {
                            // Generate receipt view
                            val dummyReceipt = CollectionReceipt(
                                receiptNumber = "RCP-${col.id.take(8).uppercase()}",
                                sessionUuid = col.id,
                                businessDate = col.businessDate,
                                shift = try { Shift.valueOf(col.shiftType) } catch (_: Exception) { Shift.MORNING },
                                centerName = repository.getActiveCenterName(),
                                operatorName = repository.getOfficerName(),
                                customerCode = col.farmerCode ?: "FARMER",
                                customerName = col.customerName ?: "Farmer",
                                identificationMethod = IdentificationMethod.RFID,
                                milkCategory = try { MilkCategory.valueOf(col.selectedMilkCategory) } catch (_: Exception) { MilkCategory.COW },
                                weightKg = col.netWeight ?: 0.0,
                                fatPercentage = col.fatPercentage ?: 0.0,
                                snfPercentage = col.snfPercentage ?: 0.0,
                                ratePerUnit = col.appliedRatePerUnit ?: 0.0,
                                totalAmount = col.totalAmount ?: 0.0,
                                verificationHash = "VERIFIED-" + col.id.take(8)
                            )
                            selectedReceiptText = ReceiptFormatter.generateReceiptText(dummyReceipt)
                        },
                        colors = CardDefaults.cardColors(containerColor = SurfaceDark)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("${col.customerName} (${col.farmerCode})", fontWeight = FontWeight.Bold, color = TextPrimary)
                                Text("${col.selectedMilkCategory} | ${col.shiftType} | ${col.businessDate}", fontSize = 12.sp, color = TextSecondary)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("${col.netWeight ?: 0.0} KG @ INR ${col.appliedRatePerUnit ?: 0.0}", fontSize = 13.sp)
                                Text("INR ${col.totalAmount ?: 0.0}", fontWeight = FontWeight.Bold, color = StatusValid)
                            }
                        }
                    }
                }
            }
        }
    }

    if (selectedReceiptText != null) {
        Dialog(onDismissRequest = { selectedReceiptText = null }) {
            Card(
                modifier = Modifier.width(420.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = selectedReceiptText ?: "",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { selectedReceiptText = null },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("CLOSE")
                    }
                }
            }
        }
    }
}
