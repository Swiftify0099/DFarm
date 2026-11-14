package com.dfarm.collection.data.api

import com.dfarm.collection.data.models.*
import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.*

interface CollectionApiService {

    @POST("api/v1/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>

    @GET("api/v1/auth/me")
    suspend fun getMe(): Response<UserMeResponse>

    @GET("api/v1/customers")
    suspend fun listCustomers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("search") search: String? = null,
        @Query("centerId") centerId: String? = null,
        @Query("status") status: String? = null
    ): Response<ApiResponse<CustomerListResponse>>

    @GET("api/v1/customers/{customerId}")
    suspend fun getCustomerById(
        @Path("customerId") customerId: String
    ): Response<ApiResponse<CustomerDto>>

    @POST("api/v1/identification/face")
    suspend fun identifyByFace(
        @Body request: FaceIdentificationRequest
    ): Response<ApiResponse<IdentificationResponseDto>>

    @POST("api/v1/identification/rfid")
    suspend fun identifyByRfid(
        @Body request: RfidIdentificationRequest
    ): Response<ApiResponse<IdentificationResponseDto>>

    @POST("api/v1/identification/supervisor-verify")
    suspend fun verifyBySupervisor(
        @Body request: SupervisorVerificationRequest
    ): Response<ApiResponse<IdentificationResponseDto>>

    @GET("api/v1/rates/active")
    suspend fun getActiveRateVersion(
        @Query("centerId") centerId: String,
        @Query("milkCategory") milkCategory: String,
        @Query("businessDate") businessDate: String? = null
    ): Response<ApiResponse<JsonObject>>

    @POST("api/v1/rates/calculate")
    suspend fun calculateRate(
        @Body request: CalculateRateRequest
    ): Response<ApiResponse<CalculateRateResponseDto>>

    @POST("api/v1/collections/sessions")
    suspend fun createSession(
        @Body request: CreateSessionRequest
    ): Response<ApiResponse<CreateSessionResponseDto>>

    @POST("api/v1/collections/sessions/{sessionId}/measurements")
    suspend fun recordMeasurements(
        @Path("sessionId") sessionId: String,
        @Body request: RecordMeasurementsRequest
    ): Response<ApiResponse<JsonObject>>

    @POST("api/v1/collections/sessions/{sessionId}/complete")
    suspend fun completeSession(
        @Path("sessionId") sessionId: String,
        @Body request: CompleteSessionRequest
    ): Response<ApiResponse<CompleteSessionResponseDto>>

    @POST("api/v1/collections/sessions/{sessionId}/cancel")
    suspend fun cancelSession(
        @Path("sessionId") sessionId: String,
        @Body request: CancelSessionRequest
    ): Response<ApiResponse<JsonObject>>

    @GET("api/v1/collections/sessions/{sessionId}/receipt")
    suspend fun getReceiptText(
        @Path("sessionId") sessionId: String
    ): Response<ApiResponse<ReceiptResponseDto>>

    @GET("api/v1/collections/history")
    suspend fun getHistory(
        @Query("centerId") centerId: String? = null,
        @Query("date") date: String? = null,
        @Query("shift") shift: String? = null,
        @Query("limit") limit: Int = 100
    ): Response<ApiResponse<List<CollectionHistoryItemDto>>>

    @GET("api/v1/collections/shift-summary")
    suspend fun getShiftSummary(
        @Query("centerId") centerId: String? = null,
        @Query("shift") shift: String? = null,
        @Query("date") date: String? = null
    ): Response<ApiResponse<ShiftSummaryDto>>

    @POST("api/v1/sync/push")
    suspend fun pushSyncEvents(
        @Body request: SyncPushRequest
    ): Response<ApiResponse<SyncPushResponseDto>>

    @GET("api/v1/sync/pull")
    suspend fun pullSyncChanges(
        @Query("cursor") cursor: Long = 0,
        @Query("tombstoneCursor") tombstoneCursor: Long = 0,
        @Query("centerId") centerId: String? = null
    ): Response<ApiResponse<JsonObject>>

    @POST("api/v1/sync/acknowledge")
    suspend fun acknowledgeSync(
        @Body request: SyncAcknowledgeRequest
    ): Response<ApiResponse<JsonObject>>
}
