package com.dfarm.registration.api

import com.dfarm.registration.security.EncryptedEnvelope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class FaceEnrollmentResponse(
    val success: Boolean,
    val enrollmentId: String?,
    val customerId: String?,
    val modelVersionId: String?,
    val qualityScore: Float?,
    val status: String?,
    val enrolledAt: String?,
    val errorMessage: String? = null
)

data class FaceStatusResult(
    val success: Boolean,
    val customerId: String,
    val hasEnrolledFace: Boolean,
    val enrollmentId: String? = null,
    val modelVersion: String? = null,
    val qualityScore: Float? = null,
    val status: String? = null,
    val enrolledAt: String? = null,
    val errorMessage: String? = null
)

class FaceApiClient(
    private val baseUrl: String = "http://10.0.2.2:4000/api/v1"
) {
    /**
     * Submit encrypted biometric template envelope to backend.
     * Raw facial images are NEVER transmitted.
     */
    suspend fun submitEnrollment(
        customerId: String,
        modelVersionId: String,
        encryptedEnvelope: EncryptedEnvelope,
        qualityScore: Float,
        livenessScore: Float?,
        livenessClassification: String,
        deviceId: String,
        authToken: String
    ): FaceEnrollmentResponse = withContext(Dispatchers.IO) {
        val endpoint = "$baseUrl/customers/$customerId/face-enroll"
        val url = URL(endpoint)
        val conn = url.openConnection() as HttpURLConnection

        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("Authorization", "Bearer $authToken")
            conn.doOutput = true
            conn.connectTimeout = 10000
            conn.readTimeout = 10000

            val jsonBody = JSONObject().apply {
                put("modelVersionId", modelVersionId)
                put("encryptedTemplate", JSONObject().apply {
                    put("ciphertextBase64", encryptedEnvelope.ciphertextBase64)
                    put("ivBase64", encryptedEnvelope.ivBase64)
                    put("authTagBase64", encryptedEnvelope.authTagBase64)
                    put("keyReference", encryptedEnvelope.keyReference)
                    put("algorithm", encryptedEnvelope.algorithm)
                })
                put("qualityScore", qualityScore.toDouble())
                if (livenessScore != null) {
                    put("livenessScore", livenessScore.toDouble())
                }
                put("livenessClassification", livenessClassification)
                put("deviceId", deviceId)
                put("samplesCount", 3)
                put("officerConsentConfirmation", true)
            }

            OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                writer.write(jsonBody.toString())
                writer.flush()
            }

            val responseCode = conn.responseCode
            val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
            val responseText = BufferedReader(InputStreamReader(stream, "UTF-8")).use { it.readText() }

            val responseJson = JSONObject(responseText)
            if (responseCode in 200..299 && responseJson.optBoolean("success", false)) {
                val data = responseJson.getJSONObject("data")
                FaceEnrollmentResponse(
                    success = true,
                    enrollmentId = data.optString("enrollmentId"),
                    customerId = data.optString("customerId"),
                    modelVersionId = data.optString("modelVersionId"),
                    qualityScore = data.optDouble("qualityScore", 0.0).toFloat(),
                    status = data.optString("status"),
                    enrolledAt = data.optString("enrolledAt")
                )
            } else {
                val errObj = responseJson.optJSONObject("error")
                val msg = errObj?.optString("message") ?: "Enrollment failed with HTTP $responseCode"
                FaceEnrollmentResponse(
                    success = false,
                    enrollmentId = null,
                    customerId = customerId,
                    modelVersionId = modelVersionId,
                    qualityScore = null,
                    status = null,
                    enrolledAt = null,
                    errorMessage = msg
                )
            }
        } catch (e: Exception) {
            FaceEnrollmentResponse(
                success = false,
                enrollmentId = null,
                customerId = customerId,
                modelVersionId = modelVersionId,
                qualityScore = null,
                status = null,
                enrolledAt = null,
                errorMessage = e.message ?: "Network error connecting to backend API"
            )
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Query customer face enrollment status metadata.
     */
    suspend fun getFaceStatus(
        customerId: String,
        authToken: String
    ): FaceStatusResult = withContext(Dispatchers.IO) {
        val endpoint = "$baseUrl/customers/$customerId/face-status"
        val url = URL(endpoint)
        val conn = url.openConnection() as HttpURLConnection

        try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $authToken")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val responseCode = conn.responseCode
            val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
            val responseText = BufferedReader(InputStreamReader(stream, "UTF-8")).use { it.readText() }

            val responseJson = JSONObject(responseText)
            if (responseCode in 200..299 && responseJson.optBoolean("success", false)) {
                val data = responseJson.getJSONObject("data")
                FaceStatusResult(
                    success = true,
                    customerId = data.getString("customerId"),
                    hasEnrolledFace = data.getBoolean("hasEnrolledFace"),
                    enrollmentId = data.optString("enrollmentId").takeIf { it.isNotEmpty() },
                    modelVersion = data.optString("modelVersion").takeIf { it.isNotEmpty() },
                    qualityScore = if (data.has("qualityScore")) data.getDouble("qualityScore").toFloat() else null,
                    status = data.optString("status").takeIf { it.isNotEmpty() },
                    enrolledAt = data.optString("enrolledAt").takeIf { it.isNotEmpty() }
                )
            } else {
                val errObj = responseJson.optJSONObject("error")
                FaceStatusResult(
                    success = false,
                    customerId = customerId,
                    hasEnrolledFace = false,
                    errorMessage = errObj?.optString("message") ?: "HTTP $responseCode"
                )
            }
        } catch (e: Exception) {
            FaceStatusResult(
                success = false,
                customerId = customerId,
                hasEnrolledFace = false,
                errorMessage = e.message ?: "Network error"
            )
        } finally {
            conn.disconnect()
        }
    }
}
