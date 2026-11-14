// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// FACE ALIGNMENT & 5-POINT LANDMARK TRANSFORMATION ENGINE
// ==============================================================================
export class FaceAlignmentEngine {
    static TARGET_WIDTH = 112;
    static TARGET_HEIGHT = 112;
    // Canonical 5-point landmark coordinates for 112x112 MobileFaceNet / InsightFace standard
    static CANONICAL_LANDMARKS_112 = {
        leftEye: { x: 38.2946, y: 51.6963 },
        rightEye: { x: 73.5318, y: 51.5014 },
        noseTip: { x: 56.0252, y: 71.7366 },
        leftMouthCorner: { x: 41.5493, y: 92.3655 },
        rightMouthCorner: { x: 70.7299, y: 92.2041 },
    };
    static landmarksToArray(landmarks) {
        return [
            [landmarks.leftEye.x, landmarks.leftEye.y],
            [landmarks.rightEye.x, landmarks.rightEye.y],
            [landmarks.noseTip.x, landmarks.noseTip.y],
            [landmarks.leftMouthCorner.x, landmarks.leftMouthCorner.y],
            [landmarks.rightMouthCorner.x, landmarks.rightMouthCorner.y],
        ];
    }
    static computeSimilarityTransform(detected) {
        const src = this.landmarksToArray(detected);
        const dst = this.landmarksToArray(this.CANONICAL_LANDMARKS_112);
        const n = src.length;
        let srcMeanX = 0, srcMeanY = 0;
        let dstMeanX = 0, dstMeanY = 0;
        for (let i = 0; i < n; i++) {
            srcMeanX += src[i][0];
            srcMeanY += src[i][1];
            dstMeanX += dst[i][0];
            dstMeanY += dst[i][1];
        }
        srcMeanX /= n;
        srcMeanY /= n;
        dstMeanX /= n;
        dstMeanY /= n;
        const srcCentered = [];
        const dstCentered = [];
        let srcVar = 0;
        for (let i = 0; i < n; i++) {
            const sx = src[i][0] - srcMeanX;
            const sy = src[i][1] - srcMeanY;
            srcCentered.push([sx, sy]);
            srcVar += sx * sx + sy * sy;
            const dx = dst[i][0] - dstMeanX;
            const dy = dst[i][1] - dstMeanY;
            dstCentered.push([dx, dy]);
        }
        srcVar /= n;
        if (srcVar < 1e-6) {
            throw new Error('DEGENERATE_FACE_LANDMARKS: Landmark variance too low to compute alignment transform.');
        }
        let s00 = 0, s01 = 0, s10 = 0, s11 = 0;
        for (let i = 0; i < n; i++) {
            s00 += dstCentered[i][0] * srcCentered[i][0];
            s01 += dstCentered[i][0] * srcCentered[i][1];
            s10 += dstCentered[i][1] * srcCentered[i][0];
            s11 += dstCentered[i][1] * srcCentered[i][1];
        }
        s00 /= n;
        s01 /= n;
        s10 /= n;
        s11 /= n;
        const theta = Math.atan2(s10 - s01, s00 + s11);
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const traceS = s00 + s11;
        const scale = (traceS * cosTheta + (s10 - s01) * sinTheta) / (2 * srcVar);
        const tx = dstMeanX - scale * (cosTheta * srcMeanX - sinTheta * srcMeanY);
        const ty = dstMeanY - scale * (sinTheta * srcMeanX + cosTheta * srcMeanY);
        const a = scale * cosTheta;
        const b = -scale * sinTheta;
        const c = scale * sinTheta;
        const d = scale * cosTheta;
        return {
            scale,
            rotationRadians: theta,
            translationX: tx,
            translationY: ty,
            matrix: [
                [a, b, tx],
                [c, d, ty],
            ],
        };
    }
    static normalizePixels(pixels) {
        const normalized = new Float32Array(pixels.length);
        for (let i = 0; i < pixels.length; i++) {
            normalized[i] = (pixels[i] - 127.5) / 128.0;
        }
        return normalized;
    }
}
//# sourceMappingURL=alignment.js.map