package com.dfarm.registration.biometric

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

data class AlignedCrop(
    val normalizedTensor: FloatArray, // 1 x 3 x 112 x 112 or 112 x 112 x 3
    val width: Int = 112,
    val height: Int = 112
)

class FaceAlignment {
    companion object {
        const val TARGET_WIDTH = 112
        const val TARGET_HEIGHT = 112

        // InsightFace 112x112 canonical reference landmarks
        val CANONICAL_LANDMARKS = floatArrayOf(
            38.2946f, 51.6963f, // left eye
            73.5318f, 51.5014f, // right eye
            56.0252f, 71.7366f, // nose tip
            41.5493f, 92.3655f, // left mouth
            70.7299f, 92.2041f  // right mouth
        )

        /**
         * Estimate 2D affine similarity transform matrix (2x3) using Umeyama algorithm.
         */
        fun computeSimilarityMatrix(src: FloatArray): FloatArray {
            val dst = CANONICAL_LANDMARKS
            val n = 5

            var srcMeanX = 0f; var srcMeanY = 0f
            var dstMeanX = 0f; var dstMeanY = 0f

            for (i in 0 until n) {
                srcMeanX += src[i * 2]
                srcMeanY += src[i * 2 + 1]
                dstMeanX += dst[i * 2]
                dstMeanY += dst[i * 2 + 1]
            }
            srcMeanX /= n; srcMeanY /= n
            dstMeanX /= n; dstMeanY /= n

            var srcVar = 0f
            var s00 = 0f; var s01 = 0f; var s10 = 0f; var s11 = 0f

            for (i in 0 until n) {
                val sx = src[i * 2] - srcMeanX
                val sy = src[i * 2 + 1] - srcMeanY
                val dx = dst[i * 2] - dstMeanX
                val dy = dst[i * 2 + 1] - dstMeanY

                srcVar += sx * sx + sy * sy
                s00 += dx * sx
                s01 += dx * sy
                s10 += dy * sx
                s11 += dy * sy
            }
            srcVar /= n
            s00 /= n; s01 /= n; s10 /= n; s11 /= n

            if (srcVar < 1e-6f) {
                // Identity fallback
                return floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f)
            }

            val theta = atan2(s10 - s01, s00 + s11)
            val cosT = cos(theta)
            val sinT = sin(theta)

            val traceS = s00 + s11
            val scale = (traceS * cosT + (s10 - s01) * sinT) / (2f * srcVar)

            val a = scale * cosT
            val b = -scale * sinT
            val c = scale * sinT
            val d = scale * cosT

            val tx = dstMeanX - (a * srcMeanX + b * srcMeanY)
            val ty = dstMeanY - (c * srcMeanX + d * srcMeanY)

            // Return 2x3 affine matrix [a, b, tx, c, d, ty]
            return floatArrayOf(a, b, tx, c, d, ty)
        }

        /**
         * Normalize raw RGB pixels [0, 255] to floating point values [-1.0, 1.0].
         * Formula: (pixel - 127.5) / 128.0
         */
        fun normalizePixel(byteVal: Int): Float {
            val u = byteVal and 0xFF
            return (u - 127.5f) / 128.0f
        }
    }
}
