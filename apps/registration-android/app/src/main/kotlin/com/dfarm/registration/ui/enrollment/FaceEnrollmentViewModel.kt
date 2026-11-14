package com.dfarm.registration.ui.enrollment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dfarm.registration.api.FaceApiClient
import com.dfarm.registration.biometric.*
import com.dfarm.registration.security.BiometricKeystoreEncryptor
import com.dfarm.registration.security.EncryptedEnvelope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class EnrollmentUiState {
    object Idle : EnrollmentUiState()
    data class ActiveCapture(
        val customerId: String,
        val customerName: String,
        val farmerCode: String,
        val currentChallenge: LivenessChallenge,
        val samplesCaptured: Int,
        val totalSamplesRequired: Int,
        val latestQuality: QualityMetrics? = null
    ) : EnrollmentUiState()
    object Encrypting : EnrollmentUiState()
    object Submitting : EnrollmentUiState()
    data class Success(
        val customerId: String,
        val enrollmentId: String,
        val status: String,
        val qualityScore: Float,
        val enrolledAt: String
    ) : EnrollmentUiState()
    data class Error(
        val errorMessage: String,
        val canRetry: Boolean = true
    ) : EnrollmentUiState()
}

class FaceEnrollmentViewModel(
    private val apiClient: FaceApiClient = FaceApiClient(),
    private val encryptor: BiometricKeystoreEncryptor = BiometricKeystoreEncryptor(),
    private val embeddingModel: FaceEmbeddingModel = MobileFaceNetModel(),
    private val qualityAnalyzer: FaceQualityAnalyzer = FaceQualityAnalyzer()
) : ViewModel() {

    private val _uiState = MutableStateFlow<EnrollmentUiState>(EnrollmentUiState.Idle)
    val uiState: StateFlow<EnrollmentUiState> = _uiState.asStateFlow()

    private var coordinator: LivenessChallengeCoordinator = LivenessChallengeCoordinator(requiredSamples = 3)
    private var activeCustomerId: String = ""
    private var activeCustomerName: String = ""
    private var activeFarmerCode: String = ""
    private var authToken: String = "mock_officer_token"
    private var modelVersionId: String = "f0000000-0000-0000-0000-000000000001"
    private var deviceId: String = "TABLET-REG-01"

    fun startEnrollment(
        customerId: String,
        customerName: String,
        farmerCode: String,
        token: String = "mock_officer_token"
    ) {
        activeCustomerId = customerId
        activeCustomerName = customerName
        activeFarmerCode = farmerCode
        authToken = token
        coordinator.reset()

        _uiState.value = EnrollmentUiState.ActiveCapture(
            customerId = customerId,
            customerName = customerName,
            farmerCode = farmerCode,
            currentChallenge = coordinator.getCurrentChallenge(),
            samplesCaptured = 0,
            totalSamplesRequired = coordinator.getRequiredCount()
        )
    }

    /**
     * Called on each incoming camera frame by the CameraX ImageAnalysis analyzer.
     */
    fun processCameraFrame(
        detectedFaceCount: Int,
        sharpness: Float,
        meanLuminance: Float,
        luminanceVariance: Float,
        yawDegrees: Float,
        pitchDegrees: Float,
        rollDegrees: Float,
        ipdPixels: Float,
        faceTensor: FloatArray? = null
    ) {
        val currentState = _uiState.value
        if (currentState !is EnrollmentUiState.ActiveCapture) return

        // 1. Evaluate frame quality against all 6 biometrics quality gates
        val quality = qualityAnalyzer.evaluate(
            detectedFaceCount = detectedFaceCount,
            sharpness = sharpness,
            meanLuminance = meanLuminance,
            luminanceVariance = luminanceVariance,
            yawDegrees = yawDegrees,
            pitchDegrees = pitchDegrees,
            rollDegrees = rollDegrees,
            ipdPixels = ipdPixels
        )

        // Update live quality HUD
        _uiState.value = currentState.copy(latestQuality = quality)

        // 2. If quality passed and input tensor is provided, generate embedding and buffer sample
        if (quality.isAcceptableForEnrollment && faceTensor != null) {
            val embedding = embeddingModel.generateEmbedding(faceTensor)
            val isComplete = coordinator.addSample(
                embedding = embedding,
                qualityScore = quality.overallQualityScore,
                yaw = yawDegrees,
                pitch = pitchDegrees
            )

            if (isComplete) {
                // All 3 samples gathered, proceed to encryption and upload
                finalizeAndUpload()
            } else {
                // Update UI state with next challenge and updated count
                _uiState.value = currentState.copy(
                    currentChallenge = coordinator.getCurrentChallenge(),
                    samplesCaptured = coordinator.getSamplesCount(),
                    latestQuality = quality
                )
            }
        }
    }

    private fun finalizeAndUpload() {
        viewModelScope.launch {
            try {
                _uiState.value = EnrollmentUiState.Encrypting

                // 1. Finalize multi-sample centroid and check consistency
                val multiSampleResult = coordinator.finalizeEnrollment()
                if (!multiSampleResult.isConsistent) {
                    _uiState.value = EnrollmentUiState.Error(
                        "Sample consistency check failed. Subject must remain steady during micro-captures.",
                        canRetry = true
                    )
                    return@launch
                }

                // 2. Encrypt centroid using Android Keystore AES-256-GCM with Customer AAD binding
                val encryptedEnvelope = encryptor.encrypt(
                    embedding = multiSampleResult.centroidEmbedding,
                    customerId = activeCustomerId,
                    modelVersionId = modelVersionId,
                    keyReference = "key-v1-2026"
                )

                _uiState.value = EnrollmentUiState.Submitting

                // 3. Submit encrypted template envelope to Backend REST API
                val response = apiClient.submitEnrollment(
                    customerId = activeCustomerId,
                    modelVersionId = modelVersionId,
                    encryptedEnvelope = encryptedEnvelope,
                    qualityScore = multiSampleResult.averageQualityScore,
                    livenessScore = multiSampleResult.livenessScore,
                    livenessClassification = multiSampleResult.livenessClassification.name,
                    deviceId = deviceId,
                    authToken = authToken
                )

                if (response.success && response.enrollmentId != null) {
                    _uiState.value = EnrollmentUiState.Success(
                        customerId = activeCustomerId,
                        enrollmentId = response.enrollmentId,
                        status = response.status ?: "ACTIVE",
                        qualityScore = response.qualityScore ?: multiSampleResult.averageQualityScore,
                        enrolledAt = response.enrolledAt ?: ""
                    )
                } else {
                    _uiState.value = EnrollmentUiState.Error(
                        response.errorMessage ?: "Enrollment rejected by backend server.",
                        canRetry = true
                    )
                }
            } catch (e: Exception) {
                _uiState.value = EnrollmentUiState.Error(
                    e.message ?: "An unexpected error occurred during biometric enrollment.",
                    canRetry = true
                )
            }
        }
    }

    fun retry() {
        if (activeCustomerId.isNotEmpty()) {
            startEnrollment(activeCustomerId, activeCustomerName, activeFarmerCode, authToken)
        } else {
            _uiState.value = EnrollmentUiState.Idle
        }
    }
}
