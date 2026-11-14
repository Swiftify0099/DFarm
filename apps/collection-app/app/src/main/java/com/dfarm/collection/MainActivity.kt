package com.dfarm.collection

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.dfarm.collection.data.api.ApiClient
import com.dfarm.collection.data.repository.CollectionRepository
import com.dfarm.collection.data.storage.SessionManager
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.storage.CollectionDatabaseHelper
import com.dfarm.collection.domain.sync.DFarmSyncEngine
import com.dfarm.collection.domain.sync.OfflineRevocationGuard
import com.dfarm.collection.ui.screens.*
import com.dfarm.collection.ui.theme.BackgroundDark
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

enum class CurrentScreen {
    LOGIN,
    DASHBOARD,
    IDENTIFICATION,
    CUSTOMER_INFO,
    CATEGORY_SELECTION,
    MEASUREMENTS,
    REVIEW,
    RECEIPT,
    HISTORY
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Surface(modifier = Modifier.fillMaxSize(), color = BackgroundDark) {
                CollectionAppRoot()
            }
        }
    }
}

@Composable
fun CollectionAppRoot() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val sessionManager = remember { SessionManager(context) }
    val apiService = remember { ApiClient.createService(sessionManager) }
    val database = remember { CollectionDatabaseHelper(context) }
    val revocationGuard = remember { OfflineRevocationGuard(database) }
    val syncEngine = remember { DFarmSyncEngine(database, revocationGuard) }
    val repository = remember { CollectionRepository(apiService, sessionManager, database, syncEngine) }

    var currentScreen by remember {
        mutableStateOf(if (sessionManager.isLoggedIn()) CurrentScreen.DASHBOARD else CurrentScreen.LOGIN)
    }

    val currentShift = remember {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        if (hour < 15) Shift.MORNING else Shift.EVENING
    }

    val businessDate = remember {
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }

    var pendingSyncCount by remember { mutableStateOf(repository.getPendingSyncCount()) }
    var identifiedCustomer by remember { mutableStateOf<Customer?>(null) }
    var identificationMethod by remember { mutableStateOf(IdentificationMethod.RFID) }
    var selectedCategory by remember { mutableStateOf(MilkCategory.COW) }

    var netWeight by remember { mutableDoubleStateOf(0.0) }
    var fatPercentage by remember { mutableDoubleStateOf(0.0) }
    var snfPercentage by remember { mutableDoubleStateOf(0.0) }
    var rateResult by remember { mutableStateOf<RateCalculationResult?>(null) }

    var isCommitting by remember { mutableStateOf(false) }
    var commitErrorMessage by remember { mutableStateOf<String?>(null) }
    var generatedReceiptText by remember { mutableStateOf("") }

    when (currentScreen) {
        CurrentScreen.LOGIN -> {
            LoginScreen(
                repository = repository,
                onLoginSuccess = {
                    pendingSyncCount = repository.getPendingSyncCount()
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.DASHBOARD -> {
            DashboardScreen(
                operatorName = repository.getOfficerName(),
                centerName = repository.getActiveCenterName(),
                shift = currentShift,
                pendingSyncCount = pendingSyncCount,
                onStartCollection = {
                    identifiedCustomer = null
                    commitErrorMessage = null
                    currentScreen = CurrentScreen.IDENTIFICATION
                },
                onViewHistory = {
                    currentScreen = CurrentScreen.HISTORY
                },
                onSyncNow = {
                    coroutineScope.launch {
                        try {
                            syncEngine.pushPendingJournal(
                                deviceId = repository.getDeviceId(),
                                centerId = repository.getActiveCenterId()
                            ) { url, body ->
                                val res = apiService.pushSyncEvents(
                                    kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString(body)
                                )
                                Pair(res.code(), res.raw().body?.string())
                            }
                        } catch (_: Exception) {}
                        pendingSyncCount = repository.getPendingSyncCount()
                    }
                },
                onLogout = {
                    repository.logout()
                    currentScreen = CurrentScreen.LOGIN
                }
            )
        }

        CurrentScreen.IDENTIFICATION -> {
            IdentificationScreen(
                repository = repository,
                onIdentified = { cust, method ->
                    identifiedCustomer = cust
                    identificationMethod = method
                    currentScreen = CurrentScreen.CUSTOMER_INFO
                },
                onCancel = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.CUSTOMER_INFO -> {
            val customer = identifiedCustomer ?: return
            CustomerInfoScreen(
                customer = customer,
                method = identificationMethod,
                onProceed = {
                    if (customer.permittedCategories.size == 1) {
                        selectedCategory = customer.permittedCategories.first()
                        currentScreen = CurrentScreen.MEASUREMENTS
                    } else {
                        currentScreen = CurrentScreen.CATEGORY_SELECTION
                    }
                },
                onReject = {
                    currentScreen = CurrentScreen.IDENTIFICATION
                }
            )
        }

        CurrentScreen.CATEGORY_SELECTION -> {
            val customer = identifiedCustomer ?: return
            CategorySelectionScreen(
                customer = customer,
                onCategoryChosen = { category ->
                    selectedCategory = category
                    currentScreen = CurrentScreen.MEASUREMENTS
                },
                onCancel = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.MEASUREMENTS -> {
            val customer = identifiedCustomer ?: return
            MeasurementScreen(
                customer = customer,
                category = selectedCategory,
                repository = repository,
                onRateCalculated = { w, f, s, rr ->
                    netWeight = w
                    fatPercentage = f
                    snfPercentage = s
                    rateResult = rr
                    commitErrorMessage = null
                    currentScreen = CurrentScreen.REVIEW
                },
                onCancel = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.REVIEW -> {
            val customer = identifiedCustomer ?: return
            val rr = rateResult ?: return

            TransactionReviewScreen(
                customer = customer,
                category = selectedCategory,
                netWeight = netWeight,
                fat = fatPercentage,
                snf = snfPercentage,
                rateCalculation = rr,
                isLoading = isCommitting,
                errorMessage = commitErrorMessage,
                onConfirmCommit = {
                    isCommitting = true
                    commitErrorMessage = null
                    coroutineScope.launch {
                        val idempotencyKey = "IDEMP-COL-${UUID.randomUUID()}"
                        val res = repository.commitMilkCollection(
                            customer = customer,
                            category = selectedCategory,
                            method = identificationMethod,
                            shift = currentShift,
                            businessDate = businessDate,
                            netWeight = netWeight,
                            fat = fatPercentage,
                            snf = snfPercentage,
                            appliedRate = rr.appliedRate,
                            totalAmount = rr.totalAmount,
                            idempotencyKey = idempotencyKey
                        )
                        isCommitting = false
                        if (res.isSuccess) {
                            val result = res.getOrThrow()
                            generatedReceiptText = result.receiptText
                            pendingSyncCount = repository.getPendingSyncCount()
                            currentScreen = CurrentScreen.RECEIPT
                        } else {
                            commitErrorMessage = res.exceptionOrNull()?.message ?: "Transaction commit failed"
                        }
                    }
                },
                onCancelSession = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.RECEIPT -> {
            ReceiptScreen(
                receiptText = generatedReceiptText,
                onDone = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.HISTORY -> {
            HistoryScreen(
                repository = repository,
                currentShift = currentShift,
                onDone = {
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }
    }
}
