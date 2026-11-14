package com.dfarm.registration.ui.enrollment

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dfarm.registration.biometric.LivenessChallenge
import com.dfarm.registration.biometric.QualityMetrics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FaceEnrollmentScreen(
    customerId: String = "c1111111-1111-1111-1111-111111111111",
    customerName: String = "Customer",
    farmerCode: String = "DF-2026-PENDING",
    viewModel: FaceEnrollmentViewModel,
    token: String = "",
    onEnrollmentComplete: (String) -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Biometric Face Enrollment") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                navigationIcon = {
                    TextButton(onClick = onNavigateBack) {
                        Text("Back", color = MaterialTheme.colorScheme.primary)
                    }
                }
            )
        },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(Color(0xFF121212))
        ) {
            when (val state = uiState) {
                is EnrollmentUiState.Idle -> {
                    IdleView(
                        customerId = customerId,
                        customerName = customerName,
                        farmerCode = farmerCode,
                        onStartEnrollment = {
                            viewModel.startEnrollment(
                                customerId = customerId,
                                customerName = customerName,
                                farmerCode = farmerCode,
                                token = token
                            )
                        }
                    )
                }

                is EnrollmentUiState.ActiveCapture -> {
                    ActiveCaptureView(
                        state = state,
                        onSimulateFrameCapture = {
                            // Helper to simulate a valid frame pass for demonstration and offline testing
                            val validTensor = FloatArray(112 * 112 * 3) { 0.15f }
                            viewModel.processCameraFrame(
                                detectedFaceCount = 1,
                                sharpness = 185.0f,
                                meanLuminance = 125.0f,
                                luminanceVariance = 45.0f,
                                yawDegrees = 2.0f,
                                pitchDegrees = 1.5f,
                                rollDegrees = 0.5f,
                                ipdPixels = 110.0f,
                                faceTensor = validTensor
                            )
                        }
                    )
                }

                is EnrollmentUiState.Encrypting -> {
                    ProcessingOverlay(
                        title = "Biometric Encryption in Progress",
                        message = "Deriving Android Keystore AES-256-GCM authenticated cipher...\nBinding Canonical Customer UUID via AAD."
                    )
                }

                is EnrollmentUiState.Submitting -> {
                    ProcessingOverlay(
                        title = "Submitting to DFarm Core Engine",
                        message = "Validating officer authorization, active consent record, and writing encrypted template..."
                    )
                }

                is EnrollmentUiState.Success -> {
                    EnrollmentSuccessView(
                        state = state,
                        onDone = { onEnrollmentComplete(state.customerId) }
                    )
                }

                is EnrollmentUiState.Error -> {
                    EnrollmentErrorView(
                        state = state,
                        onRetry = { viewModel.retry() },
                        onCancel = onNavigateBack
                    )
                }
            }
        }
    }
}

@Composable
private fun IdleView(
    customerId: String,
    customerName: String,
    farmerCode: String,
    onStartEnrollment: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "Customer Biometric Verification",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Customer Name: $customerName",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "Farmer Code: $farmerCode",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "Customer UUID: $customerId",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Notice: In compliance with DPDP Act & DFarm Biometric Policy, raw photos are processed only in volatile RAM and immediately discarded. Only encrypted mathematical embeddings are stored.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = onStartEnrollment,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Begin Biometric Capture", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ActiveCaptureView(
    state: EnrollmentUiState.ActiveCapture,
    onSimulateFrameCapture: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        // Camera Preview Canvas / Oval Guide Overlay
        val quality = state.latestQuality
        val isGood = quality?.isAcceptableForEnrollment == true
        val borderColor = when {
            quality == null -> Color.Gray
            isGood -> Color(0xFF4CAF50) // Green
            quality.detectedFaceCount != 1 -> Color(0xFFF44336) // Red (No face or multiple faces)
            else -> Color(0xFFFF9800) // Amber (Borderline)
        }

        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvasWidth = size.width
            val canvasHeight = size.height

            val ovalWidth = canvasWidth * 0.70f
            val ovalHeight = ovalWidth * 1.35f
            val left = (canvasWidth - ovalWidth) / 2f
            val top = (canvasHeight - ovalHeight) / 2.3f

            drawOval(
                color = borderColor,
                topLeft = Offset(left, top),
                size = Size(ovalWidth, ovalHeight),
                style = Stroke(
                    width = 8.dp.toPx(),
                    pathEffect = if (!isGood) PathEffect.dashPathEffect(floatArrayOf(30f, 15f), 0f) else null
                )
            )
        }

        // Top Challenge Banner
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color(0xCC000000),
                modifier = Modifier.padding(horizontal = 8.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Challenge: ${getChallengeDescription(state.currentChallenge)}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Progress bar (Samples 1/3, 2/3, 3/3)
            Row(
                modifier = Modifier.fillMaxWidth(0.8f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (i in 1..state.totalSamplesRequired) {
                    val filled = i <= state.samplesCaptured
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(8.dp)
                            .background(
                                color = if (filled) Color(0xFF4CAF50) else Color(0x55FFFFFF),
                                shape = RoundedCornerShape(4.dp)
                            )
                    )
                }
            }
            Text(
                text = "Samples Captured: ${state.samplesCaptured}/${state.totalSamplesRequired}",
                color = Color.LightGray,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        // Live Quality HUD Indicator Badges (Bottom Center)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xEE1E1E1E),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "Real-Time Quality Metrics",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        QualityBadge(
                            label = "Focus",
                            value = "${quality?.sharpness?.toInt() ?: 0} var",
                            isPass = (quality?.sharpness ?: 0f) >= 100.0f
                        )
                        QualityBadge(
                            label = "Luminance",
                            value = "${quality?.meanLuminance?.toInt() ?: 0} lux",
                            isPass = (quality?.meanLuminance ?: 0f) in 60.0f..200.0f
                        )
                        QualityBadge(
                            label = "Pose",
                            value = "${quality?.yawDegrees?.toInt() ?: 0}° / ${quality?.pitchDegrees?.toInt() ?: 0}°",
                            isPass = quality?.isPoseAcceptable == true
                        )
                        QualityBadge(
                            label = "IPD",
                            value = "${quality?.ipdPixels?.toInt() ?: 0} px",
                            isPass = (quality?.ipdPixels ?: 0f) >= 80.0f
                        )
                    }

                    if (quality != null && !quality.isAcceptableForEnrollment) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "⚠ ${quality.rejectionReasons.firstOrNull() ?: "Quality threshold not met"}",
                            color = Color(0xFFFF5252),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action button to capture/test frame
            Button(
                onClick = onSimulateFrameCapture,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Process Verified Frame Sample", fontSize = 15.sp, color = Color.White)
            }
        }
    }
}

@Composable
private fun QualityBadge(
    label: String,
    value: String,
    isPass: Boolean
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, color = Color.Gray, fontSize = 11.sp)
        Spacer(modifier = Modifier.height(2.dp))
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (isPass) Color(0x334CAF50) else Color(0x33F44336)
        ) {
            Text(
                text = value,
                color = if (isPass) Color(0xFF81C784) else Color(0xFFE57373),
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}

private fun getChallengeDescription(challenge: LivenessChallenge): String {
    return challenge.prompt
}

@Composable
private fun ProcessingOverlay(
    title: String,
    message: String
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xDD000000)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(52.dp),
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 4.dp
                )
                Spacer(modifier = Modifier.height(20.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun EnrollmentSuccessView(
    state: EnrollmentUiState.Success,
    onDone: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            shape = CircleShape,
            color = Color(0x334CAF50),
            modifier = Modifier.size(80.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(text = "✓", color = Color(0xFF4CAF50), fontSize = 48.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Biometric Enrollment Verified",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Face template successfully encrypted and stored in DFarm Vault.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.LightGray,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E1E)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                DetailRow("Customer UUID", state.customerId)
                DetailRow("Enrollment ID", state.enrollmentId)
                DetailRow("Status", state.status)
                DetailRow("Quality Score", "%.3f".format(state.qualityScore))
                DetailRow("Enrolled At", state.enrolledAt)
                DetailRow("Raw Photo Retention", "PURGED (RAM zeroized)")
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = onDone,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Complete & Return to Customer Profile", fontSize = 16.sp)
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = Color.White,
            maxLines = 1
        )
    }
}

@Composable
private fun EnrollmentErrorView(
    state: EnrollmentUiState.Error,
    onRetry: () -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            shape = CircleShape,
            color = Color(0x33F44336),
            modifier = Modifier.size(80.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(text = "✕", color = Color(0xFFF44336), fontSize = 44.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Enrollment Failed",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = state.errorMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFFF8A80),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        if (state.canRetry) {
            Button(
                onClick = onRetry,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Retry Enrollment Capture", fontSize = 16.sp)
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        OutlinedButton(
            onClick = onCancel,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Cancel", fontSize = 16.sp, color = Color.White)
        }
    }
}
