package com.dfarm.registration.data.api

import com.dfarm.registration.data.storage.ISessionManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val sessionManager: ISessionManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val builder = originalRequest.newBuilder()

        val token = sessionManager.getToken()
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }

        val activeCenterId = sessionManager.getActiveCenterId()
        if (!activeCenterId.isNullOrBlank() && originalRequest.header("X-Center-ID") == null) {
            builder.header("X-Center-ID", activeCenterId)
        }

        builder.header("Accept", "application/json")

        val response = chain.proceed(builder.build())

        // If backend returns 401 Unauthorized, automatically clear expired session
        if (response.code == 401) {
            sessionManager.clearSession()
        }

        return response
    }
}
