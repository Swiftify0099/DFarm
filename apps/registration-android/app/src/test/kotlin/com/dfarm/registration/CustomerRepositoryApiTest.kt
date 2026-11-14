package com.dfarm.registration

import com.dfarm.registration.data.api.DFarmApiService
import com.dfarm.registration.data.models.CreateCustomerRequest
import com.dfarm.registration.data.models.CustomerAddress
import com.dfarm.registration.data.models.UpdateCustomerRequest
import com.dfarm.registration.data.repository.CustomerApiException
import com.dfarm.registration.data.repository.CustomerRepository
import com.dfarm.registration.data.repository.DuplicateMobileException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class CustomerRepositoryApiTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiService: DFarmApiService
    private lateinit var customerRepository: CustomerRepository

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = true
    }

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        val contentType = "application/json".toMediaType()
        val retrofit = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .client(OkHttpClient.Builder().build())
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        apiService = retrofit.create(DFarmApiService::class.java)
        customerRepository = CustomerRepository(apiService)
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    @Test
    fun testCreateCustomerSuccessReturnsCanonicalUuid() = runBlocking {
        val jsonResponse = """
            {
              "success": true,
              "data": {
                "id": "e935bd93-3f4f-4c82-a959-65f2767e8054",
                "organizationId": "550e8400-e29b-41d4-a716-446655440000",
                "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
                "farmerCode": "F-KOL-00101",
                "fullName": "Pandurang Patil",
                "normalizedMobileNumber": "+919876543210",
                "status": "DRAFT",
                "registrationStatus": "IN_PROGRESS",
                "permittedCategories": ["COW", "BUFFALO"],
                "address": {
                  "village": "Wadgaon",
                  "district": "Kolhapur",
                  "state": "Maharashtra",
                  "postalCode": "416001"
                }
              }
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setHeader("Content-Type", "application/json")
                .setBody(jsonResponse)
        )

        val request = CreateCustomerRequest(
            fullName = "Pandurang Patil",
            normalizedMobileNumber = "+919876543210",
            permittedCategories = listOf("COW", "BUFFALO"),
            primaryCenterId = "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
            address = CustomerAddress(village = "Wadgaon", district = "Kolhapur")
        )

        val result = customerRepository.createCustomer(request)
        assertTrue(result.isSuccess)
        val customer = result.getOrNull()
        assertNotNull(customer)
        assertEquals("e935bd93-3f4f-4c82-a959-65f2767e8054", customer?.id)
        assertEquals("Pandurang Patil", customer?.fullName)
        assertEquals("+919876543210", customer?.normalizedMobileNumber)
        assertEquals("DRAFT", customer?.status)
        assertEquals("IN_PROGRESS", customer?.registrationStatus)
        assertEquals(listOf("COW", "BUFFALO"), customer?.permittedCategories)
    }

    @Test
    fun testDuplicateMobileRejectionThrowsDuplicateMobileException() = runBlocking {
        val errorResponse = """
            {
              "success": false,
              "code": "DUPLICATE_MOBILE_NUMBER",
              "message": "Customer with mobile number +919876543210 already exists in this organization"
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setHeader("Content-Type", "application/json")
                .setBody(errorResponse)
        )

        val request = CreateCustomerRequest(
            fullName = "Duplicate Farmer",
            normalizedMobileNumber = "+919876543210",
            permittedCategories = listOf("COW")
        )

        val result = customerRepository.createCustomer(request)
        assertTrue(result.isFailure)
        val exception = result.exceptionOrNull()
        assertTrue(exception is DuplicateMobileException)
        assertTrue(exception?.message?.contains("already exists") == true)
    }

    @Test
    fun testUnauthorizedTokenReturns401Error() = runBlocking {
        val errorResponse = """
            {
              "success": false,
              "code": "UNAUTHORIZED",
              "message": "Missing Authorization header. Expected Bearer token format."
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody(errorResponse)
        )

        val result = customerRepository.getCustomer("some-customer-id")
        assertTrue(result.isFailure)
        val exception = result.exceptionOrNull()
        assertTrue(exception is CustomerApiException)
        val apiException = exception as CustomerApiException
        assertEquals("UNAUTHORIZED", apiException.code)
    }

    @Test
    fun testListCustomersReturnsPaginatedData() = runBlocking {
        val jsonResponse = """
            {
              "success": true,
              "data": {
                "items": [
                  {
                    "id": "e935bd93-3f4f-4c82-a959-65f2767e8054",
                    "organizationId": "550e8400-e29b-41d4-a716-446655440000",
                    "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
                    "farmerCode": "F-KOL-00101",
                    "fullName": "Pandurang Patil",
                    "normalizedMobileNumber": "+919876543210",
                    "status": "DRAFT",
                    "registrationStatus": "IN_PROGRESS",
                    "permittedCategories": ["COW", "BUFFALO"]
                  }
                ],
                "total": 1,
                "page": 1,
                "limit": 20,
                "totalPages": 1
              }
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(jsonResponse)
        )

        val result = customerRepository.listCustomers(page = 1, limit = 20, search = "Pandurang")
        assertTrue(result.isSuccess)
        val list = result.getOrNull()
        assertNotNull(list)
        assertEquals(1, list?.total)
        assertEquals(1, list?.items?.size)
        assertEquals("Pandurang Patil", list?.items?.first()?.fullName)
    }

    @Test
    fun testUpdateCustomerSuccess() = runBlocking {
        val jsonResponse = """
            {
              "success": true,
              "data": {
                "id": "e935bd93-3f4f-4c82-a959-65f2767e8054",
                "organizationId": "550e8400-e29b-41d4-a716-446655440000",
                "primaryCenterId": "f7f9ae59-ffa8-49b7-aba8-123cbf6508db",
                "farmerCode": "F-KOL-00101",
                "fullName": "Pandurang Tukaram Patil",
                "normalizedMobileNumber": "+919876543210",
                "status": "DRAFT",
                "registrationStatus": "IN_PROGRESS",
                "permittedCategories": ["COW", "BUFFALO"]
              }
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(jsonResponse)
        )

        val request = UpdateCustomerRequest(
            fullName = "Pandurang Tukaram Patil"
        )

        val result = customerRepository.updateCustomer("e935bd93-3f4f-4c82-a959-65f2767e8054", request)
        assertTrue(result.isSuccess)
        val updated = result.getOrNull()
        assertNotNull(updated)
        assertEquals("Pandurang Tukaram Patil", updated?.fullName)
    }
}
