package com.dfarm.collection

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.dfarm.collection.domain.measurement.*
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.pricing.*
import com.dfarm.collection.domain.receipt.ReceiptFormatter
import com.dfarm.collection.domain.statemachine.*
import com.dfarm.collection.domain.sync.OfflineSyncQueue
import com.dfarm.collection.ui.screens.*
import com.dfarm.collection.ui.theme.BackgroundDark

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
    var currentScreen by remember { mutableStateOf(CurrentScreen.LOGIN) }
    var operatorName by remember { mutableStateOf("operator_tasgaon") }
    var centerId by remember { mutableStateOf("center_tasgaon_01") }
    val centerName = "Tasgaon Center 01"
    val shift = Shift.MORNING
    val syncQueue = remember { OfflineSyncQueue() }
    val stateMachine = remember { CollectionStateMachine() }
    val pricingEngine = remember { RateCalculationEngine() }

    // Seed approved rate version for local calculation
    val cowApprovedVersion = remember {
        RateChartVersion(
            id = "rate_ver_cow_01",
            rateChartId = "rc_cow_01",
            versionNumber = 1,
            milkCategory = MilkCategory.COW,
            isApproved = true,
            effectiveFrom = System.currentTimeMillis() - 86400000,
            cells = listOf(
                RateCell(fatPercentage = 3.5, snfPercentage = 8.5, ratePerUnit = 34.00),
                RateCell(fatPercentage = 4.0, snfPercentage = 8.5, ratePerUnit = 36.50),
                RateCell(fatPercentage = 4.2, snfPercentage = 8.5, ratePerUnit = 37.80),
                RateCell(fatPercentage = 4.5, snfPercentage = 8.5, ratePerUnit = 39.00)
            )
        )
    }

    val buffaloApprovedVersion = remember {
        RateChartVersion(
            id = "rate_ver_buf_01",
            rateChartId = "rc_buf_01",
            versionNumber = 1,
            milkCategory = MilkCategory.BUFFALO,
            isApproved = true,
            effectiveFrom = System.currentTimeMillis() - 86400000,
            cells = listOf(
                RateCell(fatPercentage = 6.0, snfPercentage = 9.0, ratePerUnit = 55.00),
                RateCell(fatPercentage = 6.5, snfPercentage = 9.0, ratePerUnit = 58.50),
                RateCell(fatPercentage = 7.0, snfPercentage = 9.0, ratePerUnit = 62.00)
            )
        )
    }

    var identifiedCustomer by remember { mutableStateOf<Customer?>(null) }
    var identificationMethod by remember { mutableStateOf(IdentificationMethod.FACE) }
    var generatedReceiptText by remember { mutableStateOf("") }

    when (currentScreen) {
        CurrentScreen.LOGIN -> {
            LoginScreen(
                onLoginSuccess = { op, cId ->
                    operatorName = op
                    centerId = cId
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.DASHBOARD -> {
            DashboardScreen(
                operatorName = operatorName,
                centerName = centerName,
                shift = shift,
                pendingSyncCount = syncQueue.getPendingCount(),
                onStartCollection = {
                    stateMachine.transition(StateMachineEvent.Reset)
                    currentScreen = CurrentScreen.IDENTIFICATION
                },
                onViewHistory = {
                    currentScreen = CurrentScreen.HISTORY
                }
            )
        }

        CurrentScreen.IDENTIFICATION -> {
            IdentificationScreen(
                onIdentified = { cust, method ->
                    identifiedCustomer = cust
                    identificationMethod = method
                    stateMachine.transition(StateMachineEvent.CustomerIdentified(cust))
                    currentScreen = CurrentScreen.CUSTOMER_INFO
                },
                onCancel = {
                    stateMachine.transition(StateMachineEvent.Reset)
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
                    stateMachine.transition(StateMachineEvent.CustomerVerified(customer))
                    // Check category auto-selection:
                    if (customer.permittedCategories.size == 1) {
                        val singleCat = customer.permittedCategories.first()
                        val session = CollectionSession(
                            customerUuid = customer.id,
                            organizationId = customer.organizationId,
                            centerId = centerId,
                            deviceId = "dev_tablet_01",
                            identificationMethod = identificationMethod,
                            milkCategory = singleCat,
                            shift = shift,
                            businessDate = "2026-11-13"
                        )
                        stateMachine.transition(StateMachineEvent.SessionCreated(session))
                        currentScreen = CurrentScreen.MEASUREMENTS
                    } else {
                        currentScreen = CurrentScreen.CATEGORY_SELECTION
                    }
                },
                onReject = {
                    stateMachine.transition(StateMachineEvent.Reset)
                    currentScreen = CurrentScreen.IDENTIFICATION
                }
            )
        }

        CurrentScreen.CATEGORY_SELECTION -> {
            val customer = identifiedCustomer ?: return
            CategorySelectionScreen(
                customer = customer,
                onCategoryChosen = { category ->
                    stateMachine.transition(StateMachineEvent.CategorySelected(category))
                    val session = CollectionSession(
                        customerUuid = customer.id,
                        organizationId = customer.organizationId,
                        centerId = centerId,
                        deviceId = "dev_tablet_01",
                        identificationMethod = identificationMethod,
                        milkCategory = category,
                        shift = shift,
                        businessDate = "2026-11-13"
                    )
                    stateMachine.transition(StateMachineEvent.SessionCreated(session))
                    currentScreen = CurrentScreen.MEASUREMENTS
                },
                onCancel = {
                    stateMachine.transition(StateMachineEvent.Reset)
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.MEASUREMENTS -> {
            val customer = identifiedCustomer ?: return
            val session = stateMachine.activeSession ?: return
            MeasurementScreen(
                customer = customer,
                category = session.milkCategory,
                onMeasurementsSubmitted = { weightKg, fat, snf ->
                    val limits = CenterValidationLimits()
                    val qm = MilkQualityMeasurement(
                        fatPercentage = fat,
                        snfPercentage = snf,
                        sessionUuid = session.sessionUuid
                    )
                    val wm = MilkWeightMeasurement(
                        netWeight = weightKg,
                        sessionUuid = session.sessionUuid
                    )
                    val qVal = MeasurementValidationEngine.validateQuality(qm, session.milkCategory, limits)
                    val wVal = MeasurementValidationEngine.validateWeight(wm, limits)

                    if (qVal.isValid && wVal.isValid) {
                        stateMachine.transition(StateMachineEvent.QualityMeasurementReceived(qm))
                        stateMachine.transition(StateMachineEvent.WeightMeasurementReceived(wm))
                        stateMachine.transition(StateMachineEvent.MeasurementsValidated)

                        val version = if (session.milkCategory == MilkCategory.COW) cowApprovedVersion else buffaloApprovedVersion
                        val rateResult = pricingEngine.calculateRate(version, fat, snf, weightKg)
                        stateMachine.transition(StateMachineEvent.RateCalculated(rateResult))

                        currentScreen = CurrentScreen.REVIEW
                    }
                },
                onCancel = {
                    stateMachine.transition(StateMachineEvent.CancelSession("Operator cancelled during measurement"))
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.REVIEW -> {
            val session = stateMachine.activeSession ?: return
            val customer = identifiedCustomer ?: return
            TransactionReviewScreen(
                session = session,
                onConfirmCommit = {
                    stateMachine.transition(StateMachineEvent.CommitStarted)
                    stateMachine.transition(StateMachineEvent.CommitSuccess)

                    // Format thermal slip receipt
                    val receipt = CollectionReceipt(
                        receiptNumber = "RCP-${System.currentTimeMillis().toString().takeLast(6)}",
                        sessionUuid = session.sessionUuid,
                        businessDate = session.businessDate,
                        shift = session.shift,
                        centerName = centerName,
                        operatorName = operatorName,
                        customerCode = customer.farmerCode,
                        customerName = customer.fullName,
                        identificationMethod = session.identificationMethod,
                        milkCategory = session.milkCategory,
                        weightKg = session.weightMeasurement?.netWeight ?: 0.0,
                        fatPercentage = session.qualityMeasurement?.fatPercentage ?: 0.0,
                        snfPercentage = session.qualityMeasurement?.snfPercentage ?: 0.0,
                        ratePerUnit = session.rateCalculation?.appliedRate ?: 0.0,
                        totalAmount = session.rateCalculation?.totalAmount ?: 0.0,
                        verificationHash = "a3f5b7c8901234567890abcdef123456"
                    )
                    generatedReceiptText = ReceiptFormatter.generateReceiptText(receipt)
                    syncQueue.enqueue(session, "{}")

                    currentScreen = CurrentScreen.RECEIPT
                },
                onCancelSession = {
                    stateMachine.transition(StateMachineEvent.CancelSession("Operator cancelled from review screen"))
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.RECEIPT -> {
            ReceiptScreen(
                receiptText = generatedReceiptText,
                onDone = {
                    stateMachine.transition(StateMachineEvent.Reset)
                    currentScreen = CurrentScreen.DASHBOARD
                }
            )
        }

        CurrentScreen.HISTORY -> {
            DashboardScreen(
                operatorName = operatorName,
                centerName = centerName,
                shift = shift,
                pendingSyncCount = syncQueue.getPendingCount(),
                onStartCollection = { currentScreen = CurrentScreen.IDENTIFICATION },
                onViewHistory = { currentScreen = CurrentScreen.DASHBOARD }
            )
        }
    }
}
