package com.dfarm.collection.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.ui.theme.*

@Composable
fun LoginScreen(
    onLoginSuccess: (operatorName: String, centerId: String) -> Unit
) {
    var username by remember { mutableStateOf("operator_tasgaon") }
    var password by remember { mutableStateOf("••••••••") }
    var selectedCenter by remember { mutableStateOf("Tasgaon Center 01") }

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
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Operator Username") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = selectedCenter,
                    onValueChange = { selectedCenter = it },
                    label = { Text("Assigned Dairy Center") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = false
                )
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { onLoginSuccess(username, "center_tasgaon_01") },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                ) {
                    Text("START COUNTER SESSION", fontSize = 16.sp, fontWeight = FontWeight.Bold)
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
    onViewHistory: () -> Unit
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
                    Text("Face / RFID / Manual Identification", style = MaterialTheme.typography.bodyMedium, color = TextPrimary)
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
                    Text("View History & Corrections", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                }
            }
        }
    }
}

@Composable
fun IdentificationScreen(
    onIdentified: (customer: Customer, method: IdentificationMethod) -> Unit,
    onCancel: () -> Unit
) {
    var searchCode by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf(IdentificationMethod.FACE) }

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("CUSTOMER IDENTIFICATION", style = MaterialTheme.typography.headlineMedium)
        Text("Priority: 1. Face -> 2. RFID -> 3. Supervisor Manual", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(0.8f), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FilterChip(
                selected = selectedMethod == IdentificationMethod.FACE,
                onClick = { selectedMethod = IdentificationMethod.FACE },
                label = { Text("1. FACE RECOGNITION") }
            )
            FilterChip(
                selected = selectedMethod == IdentificationMethod.RFID,
                onClick = { selectedMethod = IdentificationMethod.RFID },
                label = { Text("2. RFID CARD TAP") }
            )
            FilterChip(
                selected = selectedMethod == IdentificationMethod.SUPERVISOR_MANUAL,
                onClick = { selectedMethod = IdentificationMethod.SUPERVISOR_MANUAL },
                label = { Text("3. SUPERVISOR MANUAL") }
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        Card(
            modifier = Modifier.width(500.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                when (selectedMethod) {
                    IdentificationMethod.FACE -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp)
                                .background(CardBackground, RoundedCornerShape(12.dp))
                                .border(2.dp, PrimaryLight, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("CAMERA VIEWFINDER\nPosition Farmer Face Inside Frame", textAlign = TextAlign.Center)
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                val dummyCustomer = Customer(
                                    id = "c1111111-1111-1111-1111-111111111111",
                                    organizationId = "org_sangli",
                                    primaryCenterId = "center_tasgaon_01",
                                    farmerCode = "FARMER-001",
                                    fullName = "Pandurang Patil",
                                    mobileNumber = "+919876543210",
                                    status = CustomerStatus.ACTIVE,
                                    permittedCategories = listOf(MilkCategory.COW)
                                )
                                onIdentified(dummyCustomer, IdentificationMethod.FACE)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("SIMULATE FACE MATCH (0.94 CONFIDENCE)")
                        }
                    }

                    IdentificationMethod.RFID -> {
                        Text("Hold RFID card near contactless reader...", style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = {
                                val dummyCustomer = Customer(
                                    id = "c2222222-2222-2222-2222-222222222222",
                                    organizationId = "org_sangli",
                                    primaryCenterId = "center_tasgaon_01",
                                    farmerCode = "FARMER-002",
                                    fullName = "Ananda Shinde",
                                    mobileNumber = "+919876543211",
                                    status = CustomerStatus.ACTIVE,
                                    permittedCategories = listOf(MilkCategory.BUFFALO),
                                    rfidCardId = "RFID-889900"
                                )
                                onIdentified(dummyCustomer, IdentificationMethod.RFID)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("SIMULATE RFID CARD TAP (RFID-889900)")
                        }
                    }

                    IdentificationMethod.SUPERVISOR_MANUAL -> {
                        OutlinedTextField(
                            value = searchCode,
                            onValueChange = { searchCode = it },
                            label = { Text("Farmer Code or Mobile") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                val dummyCustomer = Customer(
                                    id = "c3333333-3333-3333-3333-333333333333",
                                    organizationId = "org_sangli",
                                    primaryCenterId = "center_tasgaon_01",
                                    farmerCode = searchCode.ifBlank { "FARMER-003" },
                                    fullName = "Sambhaji Kadam",
                                    mobileNumber = "+919876543212",
                                    status = CustomerStatus.ACTIVE,
                                    permittedCategories = listOf(MilkCategory.COW, MilkCategory.BUFFALO)
                                )
                                onIdentified(dummyCustomer, IdentificationMethod.SUPERVISOR_MANUAL)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text("SUPERVISOR VERIFY & SELECT")
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
                    Text(customer.permittedCategories.joinToString(", "), fontWeight = FontWeight.Bold)
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
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("SELECT MILK CATEGORY", style = MaterialTheme.typography.headlineMedium)
        Text("Customer is authorized for both Cow & Buffalo milk", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(32.dp))

        Row(modifier = Modifier.width(550.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Card(
                modifier = Modifier.weight(1f).height(160.dp),
                colors = CardDefaults.cardColors(containerColor = PrimaryGreen),
                onClick = { onCategoryChosen(MilkCategory.COW) }
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("COW MILK", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
                }
            }

            Card(
                modifier = Modifier.weight(1f).height(160.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                onClick = { onCategoryChosen(MilkCategory.BUFFALO) }
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("BUFFALO MILK", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
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
    onMeasurementsSubmitted: (weightKg: Double, fat: Double, snf: Double) -> Unit,
    onCancel: () -> Unit
) {
    var weightText by remember { mutableStateOf("15.5") }
    var fatText by remember { mutableStateOf("4.2") }
    var snfText by remember { mutableStateOf("8.5") }

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("RECORD MEASUREMENTS: $category MILK", style = MaterialTheme.typography.headlineMedium)
        Text("Customer: ${customer.fullName} (${customer.farmerCode})", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(16.dp))

        // Hardware boundary status notice
        Surface(
            color = CardBackground,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth(0.7f).padding(bottom = 16.dp)
        ) {
            Text(
                "NOTE: Physical serial analyzers deferred. Software data boundary active (Manual Entry / Test Fixture).",
                color = AccentAmber,
                modifier = Modifier.padding(12.dp),
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )
        }

        Card(
            modifier = Modifier.width(500.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text("Net Weight (KG)") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = fatText,
                    onValueChange = { fatText = it },
                    label = { Text("Fat Percentage (%)") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = snfText,
                    onValueChange = { snfText = it },
                    label = { Text("SNF Percentage (%)") },
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) {
                        Text("CANCEL")
                    }
                    Button(
                        onClick = {
                            val w = weightText.toDoubleOrNull() ?: 0.0
                            val f = fatText.toDoubleOrNull() ?: 0.0
                            val s = snfText.toDoubleOrNull() ?: 0.0
                            onMeasurementsSubmitted(w, f, s)
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        Text("VALIDATE & REVIEW")
                    }
                }
            }
        }
    }
}

@Composable
fun TransactionReviewScreen(
    session: CollectionSession,
    onConfirmCommit: () -> Unit,
    onCancelSession: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("TRANSACTION REVIEW & PRICING", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.width(550.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Milk Category:", color = TextSecondary)
                    Text(session.milkCategory.name, fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Net Quantity:", color = TextSecondary)
                    Text("${session.weightMeasurement?.netWeight} KG", fontWeight = FontWeight.Bold)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Fat / SNF:", color = TextSecondary)
                    Text("${session.qualityMeasurement?.fatPercentage}% / ${session.qualityMeasurement?.snfPercentage}%", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = CardBackground)
                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Applied Rate:", color = TextSecondary)
                    Text("INR ${session.rateCalculation?.appliedRate} / KG", fontWeight = FontWeight.Bold, color = AccentAmber)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Calculation Rule:", color = TextSecondary)
                    Text("EXACT_FAT_SNF_MATRIX", fontSize = 12.sp)
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("TOTAL AMOUNT:", style = MaterialTheme.typography.titleLarge)
                    Text("INR ${session.rateCalculation?.totalAmount}", style = MaterialTheme.typography.headlineMedium, color = StatusValid)
                }

                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedButton(onClick = onCancelSession, modifier = Modifier.weight(1f)) {
                        Text("CANCEL SESSION")
                    }
                    Button(
                        onClick = onConfirmCommit,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        Text("COMMIT & PRINT")
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
