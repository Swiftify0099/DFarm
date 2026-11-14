package com.dfarm.registration.data.repository

import com.dfarm.registration.data.api.DFarmApiService
import com.dfarm.registration.data.models.CreateCustomerRequest
import com.dfarm.registration.data.models.CustomerDto
import com.dfarm.registration.data.models.CustomerListResponse
import com.dfarm.registration.data.models.UpdateCustomerRequest
import org.json.JSONObject

class DuplicateMobileException(message: String) : Exception(message)
class CustomerApiException(val code: String, message: String) : Exception(message)

class CustomerRepository(
    private val apiService: DFarmApiService
) {

    suspend fun createCustomer(request: CreateCustomerRequest): Result<CustomerDto> {
        return try {
            val response = apiService.createCustomer(request)
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Registration succeeded but no customer data was returned"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                if (response.code() == 409 || code == "DUPLICATE_MOBILE_NUMBER") {
                    Result.failure(DuplicateMobileException(message))
                } else {
                    Result.failure(CustomerApiException(code, message))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCustomer(customerId: String): Result<CustomerDto> {
        return try {
            val response = apiService.getCustomerById(customerId)
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Customer profile not found"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                Result.failure(CustomerApiException(code, message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun listCustomers(
        page: Int = 1,
        limit: Int = 20,
        search: String? = null,
        centerId: String? = null,
        status: String? = null
    ): Result<CustomerListResponse> {
        return try {
            val response = apiService.listCustomers(
                page = page,
                limit = limit,
                search = if (search.isNullOrBlank()) null else search.trim(),
                centerId = centerId,
                status = status
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.success(CustomerListResponse())
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                Result.failure(CustomerApiException(code, message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateCustomer(
        customerId: String,
        request: UpdateCustomerRequest
    ): Result<CustomerDto> {
        return try {
            val response = apiService.updateCustomer(customerId, request)
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Customer updated but no response data returned"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                Result.failure(CustomerApiException(code, message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteCustomer(
        customerId: String,
        reason: String
    ): Result<CustomerDto> {
        return try {
            val response = apiService.deleteCustomer(
                customerId = customerId,
                request = com.dfarm.registration.data.models.CustomerDeleteRequest(reason = reason)
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Customer deactivated but no response data returned"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                Result.failure(CustomerApiException(code, message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun restoreCustomer(
        customerId: String,
        reason: String
    ): Result<CustomerDto> {
        return try {
            val response = apiService.restoreCustomer(
                customerId = customerId,
                request = com.dfarm.registration.data.models.CustomerRestoreRequest(reason = reason)
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Customer restored but no response data returned"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val (code, message) = parseErrorBody(errorBody, response.code())
                Result.failure(CustomerApiException(code, message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseErrorBody(errorJson: String?, httpStatus: Int): Pair<String, String> {
        if (errorJson.isNullOrBlank()) {
            return Pair("HTTP_$httpStatus", "Server returned HTTP status $httpStatus")
        }
        var code = "HTTP_$httpStatus"
        var msg = "An error occurred ($httpStatus)"
        val codeMatch = Regex("\"code\"\\s*:\\s*\"([^\"]+)\"").find(errorJson)
        val msgMatch = Regex("\"message\"\\s*:\\s*\"([^\"]+)\"").find(errorJson)
        if (codeMatch != null) code = codeMatch.groupValues[1]
        if (msgMatch != null) msg = msgMatch.groupValues[1]
        return Pair(code, msg)
    }
}
