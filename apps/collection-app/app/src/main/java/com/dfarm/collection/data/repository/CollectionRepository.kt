package com.dfarm.collection.data.repository

import com.dfarm.collection.data.api.CollectionApiService
import com.dfarm.collection.data.models.*
import com.dfarm.collection.data.storage.ISessionManager
import com.dfarm.collection.domain.identification.IdentificationResult
import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.receipt.ReceiptFormatter
import com.dfarm.collection.domain.storage.*
import com.dfarm.collection.domain.sync.DFarmSyncEngine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

class CollectionRepository(
    private val apiService: CollectionApiService,
    private val sessionManager: ISessionManager,
    private val database: ICollectionDatabase,
    private val syncEngine: DFarmSyncEngine? = null
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    fun getActiveCenterId(): String {
        return sessionManager.getActiveCenterId() ?: "center_default"
    }

    fun getActiveCenterName(): String {
        return sessionManager.getActiveCenterName() ?: "Dairy Center"
    }

    fun getOfficerName(): String {
        return sessionManager.getOfficer()?.fullName ?: sessionManager.getOfficer()?.email ?: "Operator"
    }

    fun getDeviceId(): String {
        return sessionManager.getDeviceId()
    }

    fun isLoggedIn(): Boolean {
        return sessionManager.isLoggedIn()
    }

    fun logout() {
        sessionManager.clearSession()
    }

    suspend fun login(username: String, password: String): Result<OfficerProfile> {
        return try {
            val response = apiService.login(LoginRequest(email = username.trim(), password = password))
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null && body.success && !body.token.isNullOrBlank() && body.officer != null) {
                    sessionManager.saveSession(body.token, body.officer)
                    Result.success(body.officer)
                } else {
                    Result.failure(Exception(body?.message ?: "Authentication failed"))
                }
            } else {
                val errBody = response.errorBody()?.string() ?: ""
                Result.failure(Exception("Login failed (HTTP ${response.code()}): $errBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun identifyByFace(): IdentificationResult {
        // Enforce strict project fail-safe rule:
        // Production face recognition model artifact is unverified.
        // Keep automatic recognition safely disabled and require RFID/Supervisor fallback.
        return IdentificationResult.Failure(
            "Production face model calibration is unverified (STAGING_UNVERIFIED). Automatic face match is disabled for fail-safety. Please use RFID Card Tap or Supervisor Manual verification.",
            "CALIBRATION_NOT_APPROVED"
        )
    }

    suspend fun identifyByRfid(rawCardUid: String): IdentificationResult {
        if (rawCardUid.isBlank()) {
            return IdentificationResult.Failure("RFID tag cannot be empty", "INVALID_RFID")
        }
        val normalized = rawCardUid.trim().replace(":", "").replace("-", "").replace(" ", "").uppercase()
        val centerId = getActiveCenterId()

        // 1. Try online verification
        if (isLoggedIn()) {
            try {
                val req = RfidIdentificationRequest(
                    cardUid = normalized,
                    centerId = centerId,
                    deviceId = getDeviceId()
                )
                val response = apiService.identifyByRfid(req)
                if (response.isSuccessful) {
                    val body = response.body()
                    val data = body?.data
                    if (data != null && data.success && data.customer != null && !data.customerUuid.isNullOrBlank()) {
                        val custDto = data.customer
                        val domainCust = Customer(
                            id = data.customerUuid,
                            organizationId = sessionManager.getOrganizationId() ?: "",
                            primaryCenterId = centerId,
                            farmerCode = custDto.farmerCode ?: "FARMER",
                            fullName = custDto.fullName,
                            mobileNumber = "",
                            status = try { CustomerStatus.valueOf(custDto.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                            permittedCategories = custDto.permittedCategories.mapNotNull {
                                try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                            }.ifEmpty { listOf(MilkCategory.COW) },
                            rfidCardId = normalized
                        )
                        return IdentificationResult.Success(
                            customer = domainCust,
                            canonicalUuid = data.customerUuid,
                            method = IdentificationMethod.RFID
                        )
                    } else {
                        val reason = data?.message ?: data?.rejectionReason ?: body?.error?.message ?: "RFID not recognized"
                        return IdentificationResult.Failure(reason, data?.rejectionReason ?: "RFID_REJECTED")
                    }
                }
            } catch (e: Exception) {
                // Network error, proceed to offline fallback
            }
        }

        // 2. Offline fallback to local database
        val cached = database.getCustomerByRfid(normalized)
            ?: database.searchCustomers(normalized).firstOrNull()
        if (cached != null) {
            if (cached.isDeleted || cached.isRevoked || cached.status != "ACTIVE") {
                return IdentificationResult.Failure("Customer is inactive or revoked", "CUSTOMER_INACTIVE")
            }
            val domainCust = Customer(
                id = cached.customerId,
                organizationId = sessionManager.getOrganizationId() ?: "",
                primaryCenterId = cached.primaryCenterId,
                farmerCode = cached.farmerCode,
                fullName = cached.fullName,
                mobileNumber = cached.mobileNumber,
                status = try { CustomerStatus.valueOf(cached.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                permittedCategories = cached.permittedCategories.mapNotNull {
                    try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                }.ifEmpty { listOf(MilkCategory.COW) },
                rfidCardId = cached.rfidCardId ?: normalized
            )
            return IdentificationResult.Success(
                customer = domainCust,
                canonicalUuid = cached.customerId,
                method = IdentificationMethod.RFID
            )
        }

        return IdentificationResult.Failure("No active customer assigned to RFID tag: $rawCardUid", "RFID_NOT_FOUND")
    }

    suspend fun searchCustomers(query: String): List<Customer> {
        val q = query.trim()
        val centerId = getActiveCenterId()

        // 1. Try online search
        if (isLoggedIn()) {
            try {
                val response = apiService.listCustomers(search = q, centerId = centerId, limit = 50)
                if (response.isSuccessful) {
                    val items = response.body()?.data?.items ?: emptyList()
                    if (items.isNotEmpty()) {
                        return items.filter { !it.isDeleted && it.status == "ACTIVE" }.map { dto ->
                            Customer(
                                id = dto.id,
                                organizationId = dto.organizationId ?: sessionManager.getOrganizationId() ?: "",
                                primaryCenterId = dto.primaryCenterId ?: centerId,
                                farmerCode = dto.farmerCode ?: "FARMER",
                                fullName = dto.fullName,
                                mobileNumber = dto.normalizedMobileNumber ?: dto.mobileNumber ?: "",
                                status = try { CustomerStatus.valueOf(dto.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                                permittedCategories = dto.permittedCategories.mapNotNull {
                                    try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                                }.ifEmpty { listOf(MilkCategory.COW) }
                            )
                        }
                    }
                }
            } catch (_: Exception) {
                // Network error, proceed to offline
            }
        }

        // 2. Offline search in local database
        val cachedList = database.searchCustomers(q)
        return cachedList.filter { !it.isDeleted && !it.isRevoked && it.status == "ACTIVE" }.map { c ->
            Customer(
                id = c.customerId,
                organizationId = sessionManager.getOrganizationId() ?: "",
                primaryCenterId = c.primaryCenterId,
                farmerCode = c.farmerCode,
                fullName = c.fullName,
                mobileNumber = c.mobileNumber,
                status = try { CustomerStatus.valueOf(c.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                permittedCategories = c.permittedCategories.mapNotNull {
                    try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                }.ifEmpty { listOf(MilkCategory.COW) },
                rfidCardId = c.rfidCardId
            )
        }
    }

    suspend fun verifyBySupervisor(
        targetCustomerUuid: String,
        reasonCategory: String,
        justificationNotes: String,
        supervisorPin: String? = null
    ): IdentificationResult {
        if (justificationNotes.trim().length < 5) {
            return IdentificationResult.Failure(
                "Supervisor manual identification requires audit justification (min 5 characters)",
                "SUPERVISOR_AUTH_REQUIRED"
            )
        }

        val centerId = getActiveCenterId()
        val supervisorId = sessionManager.getOfficer()?.id

        // 1. Try online supervisor verification
        if (isLoggedIn()) {
            try {
                val req = SupervisorVerificationRequest(
                    targetCustomerUuid = targetCustomerUuid,
                    reasonCategory = reasonCategory,
                    justificationNotes = justificationNotes.trim(),
                    centerId = centerId,
                    deviceId = getDeviceId(),
                    supervisorId = supervisorId,
                    supervisorPin = supervisorPin
                )
                val response = apiService.verifyBySupervisor(req)
                if (response.isSuccessful) {
                    val data = response.body()?.data
                    if (data != null && data.success && data.customer != null && !data.customerUuid.isNullOrBlank()) {
                        val custDto = data.customer
                        val domainCust = Customer(
                            id = data.customerUuid,
                            organizationId = sessionManager.getOrganizationId() ?: "",
                            primaryCenterId = centerId,
                            farmerCode = custDto.farmerCode ?: "FARMER",
                            fullName = custDto.fullName,
                            mobileNumber = "",
                            status = try { CustomerStatus.valueOf(custDto.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                            permittedCategories = custDto.permittedCategories.mapNotNull {
                                try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                            }.ifEmpty { listOf(MilkCategory.COW) }
                        )
                        return IdentificationResult.Success(
                            customer = domainCust,
                            canonicalUuid = data.customerUuid,
                            method = IdentificationMethod.SUPERVISOR_MANUAL
                        )
                    } else {
                        val reason = data?.message ?: data?.rejectionReason ?: "Supervisor verification denied"
                        return IdentificationResult.Failure(reason, data?.rejectionReason ?: "SUPERVISOR_VERIFY_FAILED")
                    }
                }
            } catch (_: Exception) {
                // Network error, proceed to offline
            }
        }

        // 2. Offline fallback
        val cached = database.getCustomer(targetCustomerUuid)
            ?: database.getCustomerByFarmerCode(targetCustomerUuid)
        if (cached != null) {
            if (cached.isDeleted || cached.isRevoked || cached.status != "ACTIVE") {
                return IdentificationResult.Failure("Customer is inactive or deleted", "CUSTOMER_INACTIVE")
            }
            val domainCust = Customer(
                id = cached.customerId,
                organizationId = sessionManager.getOrganizationId() ?: "",
                primaryCenterId = cached.primaryCenterId,
                farmerCode = cached.farmerCode,
                fullName = cached.fullName,
                mobileNumber = cached.mobileNumber,
                status = try { CustomerStatus.valueOf(cached.status) } catch (_: Exception) { CustomerStatus.ACTIVE },
                permittedCategories = cached.permittedCategories.mapNotNull {
                    try { MilkCategory.valueOf(it.uppercase()) } catch (_: Exception) { null }
                }.ifEmpty { listOf(MilkCategory.COW) },
                rfidCardId = cached.rfidCardId
            )
            return IdentificationResult.Success(
                customer = domainCust,
                canonicalUuid = cached.customerId,
                method = IdentificationMethod.SUPERVISOR_MANUAL
            )
        }

        return IdentificationResult.Failure("Customer not found: $targetCustomerUuid", "CUSTOMER_NOT_FOUND")
    }

    suspend fun calculateRate(
        milkCategory: MilkCategory,
        fat: Double,
        snf: Double,
        netWeight: Double
    ): Result<RateCalculationResult> {
        val centerId = getActiveCenterId()

        // 1. Try online backend authoritative calculation
        if (isLoggedIn()) {
            try {
                val req = CalculateRateRequest(
                    centerId = centerId,
                    milkCategory = milkCategory.name,
                    fat = fat,
                    snf = snf,
                    netWeight = netWeight
                )
                val response = apiService.calculateRate(req)
                if (response.isSuccessful) {
                    val data = response.body()?.data
                    if (data != null) {
                        return Result.success(
                            RateCalculationResult(
                                rateVersionId = data.rateVersionId ?: "SERVER_VERSION",
                                rateVersionNumber = data.rateVersionNumber ?: 1,
                                rateChartId = data.rateChartId ?: "SERVER_CHART",
                                appliedRate = data.appliedRate,
                                quantity = data.quantity,
                                totalAmount = data.totalAmount,
                                calculationRule = data.calculationRule,
                                roundingMode = data.roundingMode
                            )
                        )
                    }
                } else {
                    val errStr = response.errorBody()?.string() ?: ""
                    if (errStr.contains("RATE_CELL_NOT_FOUND")) {
                        return Result.failure(Exception("RATE_CELL_NOT_FOUND: No approved rate for Fat: $fat%, SNF: $snf%"))
                    }
                }
            } catch (_: Exception) {
                // Offline fallback
            }
        }

        // 2. Offline rate calculation via local database
        val rate = database.getApplicableRate(fat, snf)
        if (rate != null && rate > 0) {
            val total = Math.round(netWeight * rate * 100.0) / 100.0
            return Result.success(
                RateCalculationResult(
                    rateVersionId = "OFFLINE_VERSION",
                    rateVersionNumber = 1,
                    rateChartId = "OFFLINE_CHART",
                    appliedRate = rate,
                    quantity = netWeight,
                    totalAmount = total,
                    calculationRule = "LOCAL_CACHED_MATRIX",
                    roundingMode = "HALF_EVEN_2_DECIMALS"
                )
            )
        }

        return Result.failure(Exception("No applicable rate found for $milkCategory at Fat: $fat%, SNF: $snf%"))
    }

    data class CompletedCollectionResult(
        val sessionId: String,
        val collectionId: String,
        val receiptNumber: String,
        val totalAmount: Double,
        val newBalance: Double?,
        val isOffline: Boolean,
        val receiptText: String
    )

    suspend fun commitMilkCollection(
        customer: Customer,
        category: MilkCategory,
        method: IdentificationMethod,
        shift: Shift,
        businessDate: String,
        netWeight: Double,
        fat: Double,
        snf: Double,
        appliedRate: Double,
        totalAmount: Double,
        idempotencyKey: String
    ): Result<CompletedCollectionResult> {
        val centerId = getActiveCenterId()
        val deviceId = getDeviceId()
        val operatorName = getOfficerName()
        val centerName = getActiveCenterName()
        val clientIntakeUuid = UUID.randomUUID().toString()

        // 1. Try online commit (Create session + Complete session)
        if (isLoggedIn()) {
            try {
                // Create session
                val createReq = CreateSessionRequest(
                    customerId = customer.id,
                    centerId = centerId,
                    identificationMethod = method.name,
                    milkCategory = category.name,
                    shift = shift.name,
                    businessDate = businessDate,
                    deviceId = deviceId,
                    intakeSequenceUuid = clientIntakeUuid
                )
                val createRes = apiService.createSession(createReq)
                if (createRes.isSuccessful && createRes.body()?.data != null) {
                    val sessionId = createRes.body()!!.data!!.sessionId

                    // Complete session
                    val completeReq = CompleteSessionRequest(
                        clientIntakeUuid = clientIntakeUuid,
                        idempotencyKey = idempotencyKey,
                        netWeight = netWeight,
                        fatPercentage = fat,
                        snfPercentage = snf,
                        source = "MANUAL_ENTRY",
                        deviceId = deviceId
                    )
                    val completeRes = apiService.completeSession(sessionId, completeReq)
                    if (completeRes.isSuccessful && completeRes.body()?.data != null) {
                        val compData = completeRes.body()!!.data!!
                        val colId = compData.collection?.id ?: UUID.randomUUID().toString()
                        val receiptNumber = compData.receipt?.receiptNumber ?: "RCP-${System.currentTimeMillis().toString().takeLast(6)}"
                        val newBal = compData.ledger?.newBalance

                        // Fetch receipt text from server or format
                        var receiptText = ""
                        try {
                            val rRes = apiService.getReceiptText(sessionId)
                            if (rRes.isSuccessful && rRes.body()?.data?.receiptText != null) {
                                receiptText = rRes.body()!!.data!!.receiptText
                            }
                        } catch (_: Exception) {}

                        if (receiptText.isBlank()) {
                            val receipt = CollectionReceipt(
                                receiptNumber = receiptNumber,
                                sessionUuid = sessionId,
                                businessDate = businessDate,
                                shift = shift,
                                centerName = centerName,
                                operatorName = operatorName,
                                customerCode = customer.farmerCode,
                                customerName = customer.fullName,
                                identificationMethod = method,
                                milkCategory = category,
                                weightKg = netWeight,
                                fatPercentage = fat,
                                snfPercentage = snf,
                                ratePerUnit = appliedRate,
                                totalAmount = totalAmount,
                                verificationHash = "VERIFIED-SRV-" + colId.take(8)
                            )
                            receiptText = ReceiptFormatter.generateReceiptText(receipt)
                        }

                        return Result.success(
                            CompletedCollectionResult(
                                sessionId = sessionId,
                                collectionId = colId,
                                receiptNumber = receiptNumber,
                                totalAmount = totalAmount,
                                newBalance = newBal,
                                isOffline = false,
                                receiptText = receiptText
                            )
                        )
                    } else {
                        val errMsg = completeRes.errorBody()?.string() ?: "Complete session failed"
                        return Result.failure(Exception("Failed to commit milk collection: $errMsg"))
                    }
                } else {
                    val errMsg = createRes.errorBody()?.string() ?: "Create session failed"
                    return Result.failure(Exception("Failed to initialize collection session: $errMsg"))
                }
            } catch (e: Exception) {
                // Online attempt failed due to network exception, fall through to offline local save
            }
        }

        // 2. Offline-First Local Save
        val localSessionId = UUID.randomUUID().toString()
        val localColId = UUID.randomUUID().toString()
        val receiptNumber = "RCP-OFFLINE-${System.currentTimeMillis().toString().takeLast(6)}"

        val localSession = LocalCollectionSession(
            sessionId = localSessionId,
            customerId = customer.id,
            centerId = centerId,
            deviceId = deviceId,
            businessDate = businessDate,
            shiftType = shift.name,
            milkCategory = category.name,
            identificationMethod = method.name,
            intakeSequenceUuid = clientIntakeUuid,
            sessionState = "COMPLETED"
        )
        database.saveCollectionSession(localSession)

        val localCollection = LocalMilkCollection(
            collectionId = localColId,
            sessionId = localSessionId,
            customerId = customer.id,
            centerId = centerId,
            businessDate = businessDate,
            shiftType = shift.name,
            milkCategory = category.name,
            netWeight = netWeight,
            fatPercentage = fat,
            snfPercentage = snf,
            appliedRatePerUnit = appliedRate,
            totalAmount = totalAmount,
            idempotencyKey = idempotencyKey,
            syncStatus = "PENDING_SYNC"
        )

        val payload = buildJsonObject {
            put("sessionId", localSessionId)
            put("customerId", customer.id)
            put("centerId", centerId)
            put("businessDate", businessDate)
            put("shiftType", shift.name)
            put("milkCategory", category.name)
            put("netWeight", netWeight)
            put("fatPercentage", fat)
            put("snfPercentage", snf)
            put("appliedRatePerUnit", appliedRate)
            put("totalAmount", totalAmount)
            put("identificationMethod", method.name)
            put("intakeSequenceUuid", clientIntakeUuid)
            put("clientIntakeUuid", clientIntakeUuid)
            put("operatorId", sessionManager.getOfficer()?.id ?: "")
        }.toString()

        database.saveMilkCollectionAndEnqueueSync(localCollection, idempotencyKey, payload)

        val receipt = CollectionReceipt(
            receiptNumber = receiptNumber,
            sessionUuid = localSessionId,
            businessDate = businessDate,
            shift = shift,
            centerName = centerName,
            operatorName = operatorName,
            customerCode = customer.farmerCode,
            customerName = customer.fullName,
            identificationMethod = method,
            milkCategory = category,
            weightKg = netWeight,
            fatPercentage = fat,
            snfPercentage = snf,
            ratePerUnit = appliedRate,
            totalAmount = totalAmount,
            verificationHash = "OFFLINE-PENDING-SYNC"
        )

        return Result.success(
            CompletedCollectionResult(
                sessionId = localSessionId,
                collectionId = localColId,
                receiptNumber = receiptNumber,
                totalAmount = totalAmount,
                newBalance = null,
                isOffline = true,
                receiptText = ReceiptFormatter.generateReceiptText(receipt)
            )
        )
    }

    suspend fun getCollectionHistory(date: String? = null, shift: Shift? = null): List<CollectionHistoryItemDto> {
        val centerId = getActiveCenterId()

        // 1. Online
        if (isLoggedIn()) {
            try {
                val res = apiService.getHistory(centerId = centerId, date = date, shift = shift?.name, limit = 100)
                if (res.isSuccessful && res.body()?.data != null) {
                    return res.body()!!.data!!
                }
            } catch (_: Exception) {}
        }

        // 2. Offline
        val localList = database.getLocalCollections(100)
        return localList.map { col ->
            val cust = database.getCustomer(col.customerId)
            CollectionHistoryItemDto(
                id = col.collectionId,
                customerId = col.customerId,
                farmerCode = cust?.farmerCode ?: "FARMER",
                customerName = cust?.fullName ?: "Farmer",
                selectedMilkCategory = col.milkCategory,
                shiftType = col.shiftType,
                businessDate = col.businessDate,
                sessionState = col.syncStatus,
                netWeight = col.netWeight,
                fatPercentage = col.fatPercentage,
                snfPercentage = col.snfPercentage,
                appliedRatePerUnit = col.appliedRatePerUnit,
                totalAmount = col.totalAmount,
                startedAt = null,
                completedAt = null
            )
        }
    }

    suspend fun getShiftSummary(shift: Shift, date: String): ShiftSummaryDto {
        val centerId = getActiveCenterId()

        // 1. Online
        if (isLoggedIn()) {
            try {
                val res = apiService.getShiftSummary(centerId = centerId, shift = shift.name, date = date)
                if (res.isSuccessful && res.body()?.data != null) {
                    return res.body()!!.data!!
                }
            } catch (_: Exception) {}
        }

        // 2. Offline aggregate
        val localList = database.getLocalCollections(100).filter {
            it.shiftType == shift.name && (date.isBlank() || it.businessDate == date)
        }
        val count = localList.size
        val totalWeight = localList.sumOf { it.netWeight }
        val totalAmount = localList.sumOf { it.totalAmount }
        val avgFat = if (count > 0) localList.map { it.fatPercentage }.average() else 0.0
        val avgSnf = if (count > 0) localList.map { it.snfPercentage }.average() else 0.0

        return ShiftSummaryDto(
            centerId = centerId,
            shift = shift.name,
            businessDate = date,
            totalCollections = count,
            totalWeightKg = Math.round(totalWeight * 100.0) / 100.0,
            averageFat = Math.round(avgFat * 100.0) / 100.0,
            averageSnf = Math.round(avgSnf * 100.0) / 100.0,
            totalAmount = Math.round(totalAmount * 100.0) / 100.0
        )
    }

    fun getPendingSyncCount(): Int {
        return database.getPendingJournalEvents(100).size
    }
}
