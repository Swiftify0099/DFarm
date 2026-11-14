package com.dfarm.registration.data.api

import com.dfarm.registration.data.models.ApiResponse
import com.dfarm.registration.data.models.CenterDto
import com.dfarm.registration.data.models.CreateCustomerRequest
import com.dfarm.registration.data.models.CustomerDeleteRequest
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.models.CustomerListResponse
import com.dfarm.registration.data.models.CustomerRestoreRequest
import com.dfarm.registration.data.models.CustomerRfidStatusDto
import com.dfarm.registration.data.models.LoginRequest
import com.dfarm.registration.data.models.LoginResponse
import com.dfarm.registration.data.models.RfidAssignRequest
import com.dfarm.registration.data.models.RfidAssignmentDto
import com.dfarm.registration.data.models.RfidBlockRequest
import com.dfarm.registration.data.models.RfidReplaceRequest
import com.dfarm.registration.data.models.RfidRevokeRequest
import com.dfarm.registration.data.models.UpdateCustomerRequest
import com.dfarm.registration.data.models.UserMeResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface DFarmApiService {

    @POST("api/v1/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>

    @GET("api/v1/auth/me")
    suspend fun getMe(): Response<UserMeResponse>

    @GET("api/v1/auth/centers")
    suspend fun getCenters(): Response<ApiResponse<List<CenterDto>>>

    @GET("api/v1/customers")
    suspend fun listCustomers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("search") search: String? = null,
        @Query("centerId") centerId: String? = null,
        @Query("status") status: String? = null
    ): Response<ApiResponse<CustomerListResponse>>

    @POST("api/v1/customers")
    suspend fun createCustomer(
        @Body request: CreateCustomerRequest
    ): Response<ApiResponse<CustomerDto>>

    @GET("api/v1/customers/{customerId}")
    suspend fun getCustomerById(
        @Path("customerId") customerId: String
    ): Response<ApiResponse<CustomerDto>>

    @PATCH("api/v1/customers/{customerId}")
    suspend fun updateCustomer(
        @Path("customerId") customerId: String,
        @Body request: UpdateCustomerRequest
    ): Response<ApiResponse<CustomerDto>>

    @HTTP(method = "DELETE", path = "api/v1/customers/{customerId}", hasBody = true)
    suspend fun deleteCustomer(
        @Path("customerId") customerId: String,
        @Body request: CustomerDeleteRequest
    ): Response<ApiResponse<CustomerDto>>

    @POST("api/v1/customers/{customerId}/restore")
    suspend fun restoreCustomer(
        @Path("customerId") customerId: String,
        @Body request: CustomerRestoreRequest
    ): Response<ApiResponse<CustomerDto>>

    @POST("api/v1/customers/{customerId}/rfid-assign")
    suspend fun assignRfid(
        @Path("customerId") customerId: String,
        @Body request: RfidAssignRequest
    ): Response<ApiResponse<RfidAssignmentDto>>

    @POST("api/v1/customers/{customerId}/rfid-replace")
    suspend fun replaceRfid(
        @Path("customerId") customerId: String,
        @Body request: RfidReplaceRequest
    ): Response<ApiResponse<RfidAssignmentDto>>

    @GET("api/v1/customers/{customerId}/rfid-status")
    suspend fun getRfidStatus(
        @Path("customerId") customerId: String
    ): Response<ApiResponse<CustomerRfidStatusDto>>

    @POST("api/v1/rfid/{cardId}/revoke")
    suspend fun revokeRfid(
        @Path("cardId") cardId: String,
        @Body request: RfidRevokeRequest
    ): Response<ApiResponse<Map<String, String>>>

    @POST("api/v1/rfid/{cardId}/block")
    suspend fun blockRfid(
        @Path("cardId") cardId: String,
        @Body request: RfidBlockRequest
    ): Response<ApiResponse<Map<String, String>>>
}
