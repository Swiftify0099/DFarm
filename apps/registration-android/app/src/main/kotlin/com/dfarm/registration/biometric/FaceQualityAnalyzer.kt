package com.dfarm.registration.biometric

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class Point2D(val x: Float, val y: Float)

data class FaceLandmarks(
    val leftEye: Point2D,
    val rightEye: Point2D,
    val noseTip: Point2D,
    val leftMouth: Point2D,
    val rightMouth: Point2D
)

data class QualityMetrics(
    val sharpness: Float,
    val isBlurred: Boolean,
    val meanLuminance: Float,
    val luminanceVariance: Float,
    val isLightingAcceptable: Boolean,
    val yawDegrees: Float,
    val pitchDegrees: Float,
    val rollDegrees: Float,
    val isPoseAcceptable: Boolean,
    val ipdPixels: Float,
    val isIpdAcceptable: Boolean,
    val detectedFaceCount: Int,
    val overallQualityScore: Float,
    val isAcceptableForEnrollment: Boolean,
    val rejectionReasons: List<String>
)

class FaceQualityAnalyzer {
    companion object {
        const val MIN_SHARPNESS_LAPLACIAN = 100.0f
        const val MIN_MEAN_LUMINANCE = 60.0f
        const val MAX_MEAN_LUMINANCE = 200.0f
        const val MIN_LUMINANCE_VARIANCE = 35.0f
        const val MAX_YAW_DEGREES = 15.0f
        const val MAX_PITCH_DEGREES = 15.0f
        const val MAX_ROLL_DEGREES = 15.0f
        const val MIN_IPD_PIXELS = 80.0f
        const val MIN_OVERALL_QUALITY_THRESHOLD = 0.70f

        /**
         * Calculate variance of the Laplacian operator on grayscale pixel buffer
         * to evaluate image sharpness / focus.
         */
        fun computeLaplacianVariance(grayscale: ByteArray, width: Int, height: Int): Float {
            if (width < 3 || height < 3) return 0f
            var sum = 0.0
            var sumSq = 0.0
            var count = 0

            // 3x3 Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
            for (y in 1 until height - 1) {
                val rowOffset = y * width
                for (x in 1 until width - 1) {
                    val center = grayscale[rowOffset + x].toInt() and 0xFF
                    val top = grayscale[(y - 1) * width + x].toInt() and 0xFF
                    val bottom = grayscale[(y + 1) * width + x].toInt() and 0xFF
                    val left = grayscale[rowOffset + x - 1].toInt() and 0xFF
                    val right = grayscale[rowOffset + x + 1].toInt() and 0xFF

                    val laplacian = (top + bottom + left + right) - 4 * center
                    sum += laplacian
                    sumSq += laplacian * laplacian
                    count++
                }
            }

            if (count == 0) return 0f
            val mean = sum / count
            val variance = (sumSq / count) - (mean * mean)
            return max(0.0, variance).toFloat()
        }

        /**
         * Calculate mean pixel luminance and standard deviation variance.
         */
        fun computeLuminanceStats(grayscale: ByteArray): Pair<Float, Float> {
            if (grayscale.isEmpty()) return Pair(0f, 0f)
            var sum = 0.0
            var sumSq = 0.0
            val n = grayscale.size

            for (b in grayscale) {
                val v = (b.toInt() and 0xFF).toDouble()
                sum += v
                sumSq += v * v
            }

            val mean = (sum / n).toFloat()
            val variance = max(0.0, (sumSq / n) - (mean * mean)).toFloat()
            return Pair(mean, variance)
        }
    }

    fun evaluate(
        detectedFaceCount: Int,
        sharpness: Float,
        meanLuminance: Float,
        luminanceVariance: Float,
        yawDegrees: Float,
        pitchDegrees: Float,
        rollDegrees: Float,
        ipdPixels: Float,
        isTruncatedAtBorder: Boolean = false
    ): QualityMetrics {
        val reasons = mutableListOf<String>()

        if (detectedFaceCount == 0) {
            reasons.add("NO_FACE_DETECTED: Look directly into camera.")
        } else if (detectedFaceCount > 1) {
            reasons.add("MULTIPLE_FACES_DETECTED: Only one person allowed in frame.")
        }

        val isBlurred = sharpness < MIN_SHARPNESS_LAPLACIAN
        if (isBlurred) {
            reasons.add("IMAGE_BLURRED: Hold steady for clear focus.")
        }

        var isLightingAcceptable = true
        if (meanLuminance < MIN_MEAN_LUMINANCE) {
            isLightingAcceptable = false
            reasons.add("INSUFFICIENT_LIGHT: Move to a well-lit area.")
        } else if (meanLuminance > MAX_MEAN_LUMINANCE) {
            isLightingAcceptable = false
            reasons.add("EXCESSIVE_GLARE: Avoid harsh direct backlight or reflections.")
        } else if (luminanceVariance < MIN_LUMINANCE_VARIANCE) {
            isLightingAcceptable = false
            reasons.add("POOR_CONTRAST: Lighting is too flat or harsh.")
        }

        val isYawOk = abs(yawDegrees) <= MAX_YAW_DEGREES
        val isPitchOk = abs(pitchDegrees) <= MAX_PITCH_DEGREES
        val isRollOk = abs(rollDegrees) <= MAX_ROLL_DEGREES
        val isPoseAcceptable = isYawOk && isPitchOk && isRollOk

        if (!isYawOk) reasons.add("HEAD_TURNED: Look straight ahead.")
        if (!isPitchOk) reasons.add("HEAD_TILTED: Keep head level.")
        if (!isRollOk) reasons.add("HEAD_CANTED: Keep head upright.")

        val isIpdAcceptable = ipdPixels >= MIN_IPD_PIXELS
        if (!isIpdAcceptable) {
            reasons.add("TOO_FAR: Move closer to the camera.")
        }

        if (isTruncatedAtBorder) {
            reasons.add("FACE_TRUNCATED: Keep entire face inside circle.")
        }

        val sharpnessNorm = min(1.0f, sharpness / 300.0f)
        val optimalLuminance = (MIN_MEAN_LUMINANCE + MAX_MEAN_LUMINANCE) / 2.0f
        val lumRange = (MAX_MEAN_LUMINANCE - MIN_MEAN_LUMINANCE) / 2.0f
        val lightingNorm = max(0.0f, 1.0f - (abs(meanLuminance - optimalLuminance) / lumRange))
        val maxPoseRatio = max(
            abs(yawDegrees) / MAX_YAW_DEGREES,
            max(abs(pitchDegrees) / MAX_PITCH_DEGREES, abs(rollDegrees) / MAX_ROLL_DEGREES)
        )
        val poseNorm = max(0.0f, 1.0f - min(1.0f, maxPoseRatio * 0.7f))
        val ipdNorm = min(1.0f, ipdPixels / 160.0f)

        val compositeScore = (0.30f * sharpnessNorm + 0.25f * lightingNorm + 0.25f * poseNorm + 0.20f * ipdNorm)
        val roundedScore = ((compositeScore * 1000).roundToInt()) / 1000.0f

        val isAcceptable = reasons.isEmpty() && roundedScore >= MIN_OVERALL_QUALITY_THRESHOLD

        return QualityMetrics(
            sharpness = sharpness,
            isBlurred = isBlurred,
            meanLuminance = meanLuminance,
            luminanceVariance = luminanceVariance,
            isLightingAcceptable = isLightingAcceptable,
            yawDegrees = yawDegrees,
            pitchDegrees = pitchDegrees,
            rollDegrees = rollDegrees,
            isPoseAcceptable = isPoseAcceptable,
            ipdPixels = ipdPixels,
            isIpdAcceptable = isIpdAcceptable,
            detectedFaceCount = detectedFaceCount,
            overallQualityScore = roundedScore,
            isAcceptableForEnrollment = isAcceptable,
            rejectionReasons = reasons
        )
    }
}
