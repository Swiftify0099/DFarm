package com.dfarm.collection.domain.sync

import com.dfarm.collection.domain.storage.*
import kotlinx.serialization.json.*

class DFarmSyncEngine(
    private val database: ICollectionDatabase,
    private val revocationGuard: OfflineRevocationGuard
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    data class SyncSummary(
        val pushedCount: Int,
        val pulledCustomersCount: Int,
        val pulledTemplatesCount: Int,
        val pulledRatesCount: Int,
        val appliedTombstonesCount: Int,
        val isSuccess: Boolean,
        val errorMessage: String? = null
    )

    /**
     * Executes Upstream Push of pending collection transactions to backend.
     */
    suspend fun pushPendingJournal(
        deviceId: String,
        centerId: String,
        httpPoster: suspend (url: String, bodyJson: String) -> Pair<Int, String?>
    ): Int {
        val pending = database.getPendingJournalEvents(limit = 50)
        if (pending.isEmpty()) return 0

        val eventsArray = buildJsonArray {
            for (evt in pending) {
                add(buildJsonObject {
                    put("id", evt.eventId)
                    put("entityType", evt.entityType)
                    put("entityId", evt.entityId)
                    put("action", evt.action)
                    put("idempotencyKey", evt.idempotencyKey)
                    put("createdAt", java.time.Instant.ofEpochMilli(evt.createdAt).toString())
                    put("payload", try {
                        jsonParser.parseToJsonElement(evt.payloadJson)
                    } catch (_: Exception) {
                        JsonObject(emptyMap())
                    })
                })
            }
        }

        val pushPayload = buildJsonObject {
            put("deviceId", deviceId)
            put("centerId", centerId)
            put("events", eventsArray)
        }.toString()

        val (status, responseBody) = httpPoster("/api/v1/sync/push", pushPayload)
        if (status == 403) {
            throw DeviceRevokedException("Device is revoked or blocked by central server.")
        }

        var committed = 0
        if (status in 200..299 && responseBody != null) {
            val respElement = jsonParser.parseToJsonElement(responseBody).jsonObject
            val resultsArr = respElement["data"]?.jsonObject?.get("results")?.jsonArray
            if (resultsArr != null) {
                for (elem in resultsArr) {
                    val item = elem.jsonObject
                    val st = item["status"]?.jsonPrimitive?.contentOrNull ?: ""
                    val eventId = item["eventId"]?.jsonPrimitive?.contentOrNull ?: ""
                    val matching = pending.find { it.eventId == eventId }
                    if (matching != null && (st == "COMMITTED" || st == "DUPLICATE")) {
                        database.markJournalSynced(matching.idempotencyKey)
                        committed++
                    }
                }
            }
        }
        return committed
    }

    /**
     * Executes Downstream Pull of customers, rate cells, face templates, and tombstones.
     */
    suspend fun pullDownstreamUpdates(
        centerId: String,
        httpGetter: suspend (url: String) -> Pair<Int, String?>,
        httpPoster: suspend (url: String, bodyJson: String) -> Pair<Int, String?>
    ): SyncSummary {
        val (currentCustomerCursor, currentTombstoneCursor) = database.getServerCursors()

        val pullUrl = "/api/v1/sync/pull?cursor=$currentCustomerCursor&tombstoneCursor=$currentTombstoneCursor&centerId=$centerId"
        val (status, responseBody) = httpGetter(pullUrl)

        if (status == 403) {
            throw DeviceRevokedException("Device is administratively revoked. Pull synchronization denied.")
        }

        if (status !in 200..299 || responseBody == null) {
            return SyncSummary(0, 0, 0, 0, 0, isSuccess = false, errorMessage = "HTTP $status error")
        }

        val respElement = jsonParser.parseToJsonElement(responseBody).jsonObject
        val data = respElement["data"]?.jsonObject
            ?: return SyncSummary(0, 0, 0, 0, 0, isSuccess = false, errorMessage = "No data object")

        var pulledCustomers = 0
        var pulledTemplates = 0
        var pulledRates = 0
        var appliedTombstones = 0

        // 1. Process Customers
        val customersArr = data["customers"]?.jsonArray
        if (customersArr != null) {
            for (elem in customersArr) {
                val c = elem.jsonObject
                val cats = c["permittedCategories"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                val customer = CachedCustomer(
                    customerId = c["id"]?.jsonPrimitive?.contentOrNull ?: "",
                    farmerCode = c["farmerCode"]?.jsonPrimitive?.contentOrNull ?: "",
                    fullName = c["fullName"]?.jsonPrimitive?.contentOrNull ?: "",
                    mobileNumber = c["mobilePhone"]?.jsonPrimitive?.contentOrNull ?: c["mobileNumber"]?.jsonPrimitive?.contentOrNull ?: "",
                    primaryCenterId = c["primaryCenterId"]?.jsonPrimitive?.contentOrNull ?: centerId,
                    status = c["status"]?.jsonPrimitive?.contentOrNull ?: "ACTIVE",
                    permittedCategories = if (cats.isNullOrEmpty()) listOf("COW", "BUFFALO") else cats,
                    rfidCardId = c["rfidCardId"]?.jsonPrimitive?.contentOrNull
                )
                database.saveCustomer(customer)
                pulledCustomers++
            }
        }

        // 2. Process Rate Chart Cells
        val rateCardsArr = data["rateCards"]?.jsonArray
        if (rateCardsArr != null) {
            for (elem in rateCardsArr) {
                val r = elem.jsonObject
                val cell = CachedRateCell(
                    id = r["id"]?.jsonPrimitive?.contentOrNull ?: "",
                    rateChartVersionId = r["rateChartVersionId"]?.jsonPrimitive?.contentOrNull ?: "",
                    fatPercentage = r["fatPercentage"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
                    snfPercentage = r["snfPercentage"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
                    ratePerUnit = r["ratePerUnit"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                )
                database.saveRateCell(cell)
                pulledRates++
            }
        }

        // 3. Process Encrypted Face Templates
        val templatesArr = data["faceTemplates"]?.jsonArray
        if (templatesArr != null) {
            for (elem in templatesArr) {
                val t = elem.jsonObject
                val template = CachedFaceTemplate(
                    id = t["id"]?.jsonPrimitive?.contentOrNull ?: "",
                    customerId = t["customerId"]?.jsonPrimitive?.contentOrNull ?: "",
                    modelVersion = t["modelVersion"]?.jsonPrimitive?.contentOrNull ?: "MobileFaceNet-V1",
                    cryptoNonce = t["cryptoNonce"]?.jsonPrimitive?.contentOrNull ?: "",
                    authTag = t["authTag"]?.jsonPrimitive?.contentOrNull ?: "",
                    encryptedEmbedding = t["encryptedEmbedding"]?.jsonPrimitive?.contentOrNull ?: "",
                    status = t["status"]?.jsonPrimitive?.contentOrNull ?: "ACTIVE"
                )
                database.saveFaceTemplate(template)
                pulledTemplates++
            }
        }

        // 4. Process Revocation Tombstones
        val tombstonesArr = data["tombstones"]?.jsonArray
        if (tombstonesArr != null) {
            for (elem in tombstonesArr) {
                val tb = elem.jsonObject
                val tombstone = RevocationTombstone(
                    tombstoneId = tb["id"]?.jsonPrimitive?.contentOrNull ?: "",
                    entityType = tb["entityType"]?.jsonPrimitive?.contentOrNull ?: "",
                    entityId = tb["entityId"]?.jsonPrimitive?.contentOrNull ?: "",
                    reason = tb["reason"]?.jsonPrimitive?.contentOrNull ?: "Revocation",
                    revokedAt = System.currentTimeMillis()
                )
                revocationGuard.applyRevocationTombstone(tombstone)
                appliedTombstones++
            }
        }

        val nextCursor = data["nextCursor"]?.jsonPrimitive?.longOrNull ?: (currentCustomerCursor + pulledCustomers)
        val nextTombstoneCursor = data["nextTombstoneCursor"]?.jsonPrimitive?.longOrNull ?: (currentTombstoneCursor + appliedTombstones)

        // 5. Acknowledge cursor advance to server
        val ackPayload = buildJsonObject {
            put("acknowledgedCursor", nextCursor)
            put("tombstoneCursor", nextTombstoneCursor)
            put("appliedCount", pulledCustomers + appliedTombstones)
        }.toString()

        httpPoster("/api/v1/sync/acknowledge", ackPayload)

        // 6. Update local device sync state
        val now = System.currentTimeMillis()
        database.updateSyncState(now, nextCursor, nextTombstoneCursor)

        return SyncSummary(
            pushedCount = 0,
            pulledCustomersCount = pulledCustomers,
            pulledTemplatesCount = pulledTemplates,
            pulledRatesCount = pulledRates,
            appliedTombstonesCount = appliedTombstones,
            isSuccess = true
        )
    }
}
