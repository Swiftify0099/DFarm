package com.dfarm.registration.data.repository

import com.dfarm.registration.data.api.DFarmApiService
import com.dfarm.registration.data.models.LoginRequest
import com.dfarm.registration.data.models.OfficerProfile
import com.dfarm.registration.data.storage.ISessionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

sealed interface AuthState {
    data object Unauthenticated : AuthState
    data object Loading : AuthState
    data class Authenticated(val officer: OfficerProfile) : AuthState
    data class Error(val message: String) : AuthState
}

class AuthRepository(
    private val apiService: DFarmApiService,
    private val sessionManager: ISessionManager
) {

    private val _authState = MutableStateFlow<AuthState>(
        if (sessionManager.isLoggedIn() && sessionManager.getOfficer() != null) {
            AuthState.Authenticated(sessionManager.getOfficer()!!)
        } else {
            AuthState.Unauthenticated
        }
    )
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    suspend fun login(email: String, password: String): Result<OfficerProfile> {
        _authState.value = AuthState.Loading
        return try {
            val response = apiService.login(LoginRequest(email = email.trim(), password = password))
            if (response.isSuccessful && response.body()?.success == true) {
                val body = response.body()!!
                val token = body.effectiveToken
                var officer = body.effectiveOfficer
                if (!token.isNullOrBlank() && officer != null) {
                    if (officer.assignedCenters.isEmpty()) {
                        try {
                            sessionManager.saveSession(token, officer)
                            val centersRes = apiService.getCenters()
                            if (centersRes.isSuccessful && centersRes.body()?.success == true) {
                                val centerDtos = centersRes.body()?.data ?: emptyList()
                                val assigned = centerDtos.map { it.toAssignedCenter() }
                                if (assigned.isNotEmpty()) {
                                    val primaryId = officer.centerId ?: assigned.first().centerId
                                    officer = officer.copy(
                                        assignedCenters = assigned,
                                        centerId = primaryId
                                    )
                                }
                            }
                        } catch (_: Exception) {
                            // Fallback to existing officer profile
                        }
                    }
                    sessionManager.saveSession(token, officer)
                    val activeCenterId = officer.centerId ?: officer.assignedCenters.firstOrNull()?.centerId
                    if (activeCenterId != null) {
                        sessionManager.setActiveCenterId(activeCenterId)
                    }
                    _authState.value = AuthState.Authenticated(officer)
                    Result.success(officer)
                } else {
                    val err = "Login response missing token or officer details"
                    _authState.value = AuthState.Error(err)
                    Result.failure(Exception(err))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val message = parseErrorMessage(errorBody, "Invalid credentials or unauthorized login")
                _authState.value = AuthState.Error(message)
                Result.failure(Exception(message))
            }
        } catch (e: Exception) {
            val message = e.localizedMessage ?: "Network connection failed"
            _authState.value = AuthState.Error(message)
            Result.failure(e)
        }
    }

    suspend fun verifySession(): Boolean {
        if (!sessionManager.isLoggedIn()) {
            _authState.value = AuthState.Unauthenticated
            return false
        }
        return try {
            val response = apiService.getMe()
            if (response.isSuccessful && response.body()?.success == true) {
                var officer = response.body()?.effectiveOfficer
                if (officer != null) {
                    val currentToken = sessionManager.getToken() ?: ""
                    if (officer.assignedCenters.isEmpty()) {
                        try {
                            val centersRes = apiService.getCenters()
                            if (centersRes.isSuccessful && centersRes.body()?.success == true) {
                                val centerDtos = centersRes.body()?.data ?: emptyList()
                                val assigned = centerDtos.map { it.toAssignedCenter() }
                                if (assigned.isNotEmpty()) {
                                    val primaryId = officer.centerId ?: assigned.first().centerId
                                    officer = officer.copy(
                                        assignedCenters = assigned,
                                        centerId = primaryId
                                    )
                                }
                            }
                        } catch (_: Exception) {
                            // Fallback to existing officer profile
                        }
                    }
                    sessionManager.saveSession(currentToken, officer)
                    val activeCenterId = sessionManager.getActiveCenterId() ?: officer.centerId ?: officer.assignedCenters.firstOrNull()?.centerId
                    if (activeCenterId != null) {
                        sessionManager.setActiveCenterId(activeCenterId)
                    }
                    _authState.value = AuthState.Authenticated(officer)
                    true
                } else {
                    logout()
                    false
                }
            } else {
                logout()
                false
            }
        } catch (_: Exception) {
            // If offline, trust local session if still stored
            val currentOfficer = sessionManager.getOfficer()
            if (currentOfficer != null) {
                _authState.value = AuthState.Authenticated(currentOfficer)
                true
            } else {
                logout()
                false
            }
        }
    }

    fun selectCenter(centerId: String) {
        sessionManager.setActiveCenterId(centerId)
        val currentOfficer = sessionManager.getOfficer()
        if (currentOfficer != null) {
            val updated = currentOfficer.copy(centerId = centerId)
            val token = sessionManager.getToken() ?: ""
            sessionManager.saveSession(token, updated)
            _authState.value = AuthState.Authenticated(updated)
        }
    }

    fun logout() {
        sessionManager.clearSession()
        _authState.value = AuthState.Unauthenticated
    }

    fun getCurrentOfficer(): OfficerProfile? = sessionManager.getOfficer()

    fun getActiveCenterId(): String? = sessionManager.getActiveCenterId()

    private fun parseErrorMessage(errorJson: String?, fallback: String): String {
        if (errorJson.isNullOrBlank()) return fallback
        return try {
            val obj = JSONObject(errorJson)
            obj.optString("message", obj.optString("error", fallback))
        } catch (_: Exception) {
            fallback
        }
    }
}
