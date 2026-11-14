package com.dfarm.registration.biometric

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

class BiometricUnitTest {

    private val qualityAnalyzer = FaceQualityAnalyzer()
    private val embeddingModel = MobileFaceNetModel()

    @Test
    fun `test face quality rejects no face and multiple faces`() {
        val noFace = qualityAnalyzer.evaluate(
            detectedFaceCount = 0,
            sharpness = 150f,
            meanLuminance = 120f,
            luminanceVariance = 45f,
            yawDegrees = 0f,
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 100f
        )
        assertFalse("Must reject when 0 faces detected", noFace.isAcceptableForEnrollment)
        assertTrue(noFace.rejectionReasons.any { it.contains("NO_FACE_DETECTED") })

        val multiFace = qualityAnalyzer.evaluate(
            detectedFaceCount = 2,
            sharpness = 150f,
            meanLuminance = 120f,
            luminanceVariance = 45f,
            yawDegrees = 0f,
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 100f
        )
        assertFalse("Must reject when multiple faces detected", multiFace.isAcceptableForEnrollment)
        assertTrue(multiFace.rejectionReasons.any { it.contains("MULTIPLE_FACES_DETECTED") })
    }

    @Test
    fun `test face quality validates sharpness and illumination thresholds`() {
        val blurred = qualityAnalyzer.evaluate(
            detectedFaceCount = 1,
            sharpness = 45f, // Below 100.0f
            meanLuminance = 120f,
            luminanceVariance = 45f,
            yawDegrees = 0f,
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 100f
        )
        assertFalse("Must reject blurred image", blurred.isAcceptableForEnrollment)
        assertTrue(blurred.isBlurred)

        val dark = qualityAnalyzer.evaluate(
            detectedFaceCount = 1,
            sharpness = 150f,
            meanLuminance = 25f, // Below 60.0f
            luminanceVariance = 45f,
            yawDegrees = 0f,
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 100f
        )
        assertFalse("Must reject dark image", dark.isAcceptableForEnrollment)
        assertFalse(dark.isLightingAcceptable)

        val valid = qualityAnalyzer.evaluate(
            detectedFaceCount = 1,
            sharpness = 180f,
            meanLuminance = 125f,
            luminanceVariance = 50f,
            yawDegrees = 3f,
            pitchDegrees = -2f,
            rollDegrees = 1f,
            ipdPixels = 110f
        )
        assertTrue("Must accept high-quality frame", valid.isAcceptableForEnrollment)
        assertTrue(valid.overallQualityScore >= 0.70f)
    }

    @Test
    fun `test face quality rejects excessive pose angles and small IPD`() {
        val extremeYaw = qualityAnalyzer.evaluate(
            detectedFaceCount = 1,
            sharpness = 180f,
            meanLuminance = 120f,
            luminanceVariance = 45f,
            yawDegrees = 25f, // Exceeds 15°
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 100f
        )
        assertFalse("Must reject excessive yaw angle", extremeYaw.isAcceptableForEnrollment)
        assertFalse(extremeYaw.isPoseAcceptable)

        val smallIpd = qualityAnalyzer.evaluate(
            detectedFaceCount = 1,
            sharpness = 180f,
            meanLuminance = 120f,
            luminanceVariance = 45f,
            yawDegrees = 0f,
            pitchDegrees = 0f,
            rollDegrees = 0f,
            ipdPixels = 55f // Below 80px
        )
        assertFalse("Must reject face too far from camera (small IPD)", smallIpd.isAcceptableForEnrollment)
        assertFalse(smallIpd.isIpdAcceptable)
    }

    @Test
    fun `test face alignment Umeyama similarity transform matrix and pixel normalization`() {
        val srcCoords = floatArrayOf(
            38.2f, 51.5f,
            73.5f, 51.5f,
            56.0f, 71.7f,
            41.5f, 92.3f,
            70.7f, 92.3f
        )
        val transform = FaceAlignment.computeSimilarityMatrix(srcCoords)
        assertEquals("Matrix must have 6 coefficients (2x3 affine matrix)", 6, transform.size)
        val a = transform[0]
        val c = transform[3]
        val scale = kotlin.math.sqrt((a * a + c * c).toDouble()).toFloat()
        assertTrue("Transform scale must be positive", scale > 0f)

        // Pixel normalization: [0, 255] -> [-1.0, 1.0]
        val p0 = FaceAlignment.normalizePixel(0)
        val p128 = FaceAlignment.normalizePixel(128)
        val p255 = FaceAlignment.normalizePixel(255)
        assertEquals(-0.996f, p0, 0.01f)
        assertEquals(0.0039f, p128, 0.01f)
        assertEquals(0.996f, p255, 0.01f)
    }

    @Test
    fun `test MobileFaceNet embedding generation produces 512D unit vector`() {
        val dummyTensor = FloatArray(112 * 112 * 3) { 0.5f }
        val embedding = embeddingModel.generateEmbedding(dummyTensor)

        assertEquals("Embedding dimension must be 512", 512, embedding.size)

        var sumSq = 0f
        for (v in embedding) {
            sumSq += v * v
        }
        val norm = sqrt(sumSq)
        assertEquals("Embedding must be L2 normalized to unit length", 1.0f, norm, 1e-4f)
    }

    @Test
    fun `test cosine similarity calculation and threshold evaluation`() {
        val v1 = FloatArray(512) { 0.1f }
        val v2 = FloatArray(512) { 0.1f }

        // Normalize
        var norm1 = 0f
        for (v in v1) norm1 += v * v
        norm1 = sqrt(norm1)
        for (i in 0 until 512) {
            v1[i] /= norm1
            v2[i] /= norm1
        }

        val selfSim = MobileFaceNetModel.cosineSimilarity(v1, v2)
        assertEquals("Identical vectors must have similarity ~ 1.0", 1.0f, selfSim, 1e-4f)

        // Orthogonal vector
        val vOrthogonal = FloatArray(512) { if (it % 2 == 0) 1f else -1f }
        val orthSim = MobileFaceNetModel.cosineSimilarity(v1, vOrthogonal)
        assertTrue("Orthogonal vectors must have low similarity", orthSim < 0.20f)
    }

    @Test
    fun `test liveness challenge coordinator multi-sample aggregation and honest classification`() {
        val coordinator = LivenessChallengeCoordinator(requiredSamples = 3, isDepthSensorAvailable = false)
        val sampleEmbedding1 = FloatArray(512) { 0.05f }
        val sampleEmbedding2 = FloatArray(512) { 0.05f }
        val sampleEmbedding3 = FloatArray(512) { 0.05f }

        assertFalse(coordinator.addSample(sampleEmbedding1, 0.90f, 0f, 0f))
        assertFalse(coordinator.addSample(sampleEmbedding2, 0.92f, 5f, 2f))
        assertTrue("Third sample must complete collection", coordinator.addSample(sampleEmbedding3, 0.91f, -4f, 1f))

        val result = coordinator.finalizeEnrollment()
        assertTrue("Pairwise similarity must be consistent", result.isConsistent)
        assertEquals(3, result.sampleCount)
        assertEquals(512, result.centroidEmbedding.size)

        // Without depth sensor, classification is honestly RESTRICTED_PASS per prompt Section 7
        assertEquals(
            "Standard RGB camera without 3D depth must be honestly classified as RESTRICTED_PASS",
            AndroidLivenessClassification.RESTRICTED_PASS,
            result.livenessClassification
        )
    }
}
