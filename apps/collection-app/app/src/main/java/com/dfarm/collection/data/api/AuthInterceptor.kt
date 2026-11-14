package com.dfarm.collection.data.api

import com.dfarm.collection.data.storage.ISessionManager
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

        if (response.code == 401) {
            sessionManager.clearSession()
        }

        return response
    }
}
