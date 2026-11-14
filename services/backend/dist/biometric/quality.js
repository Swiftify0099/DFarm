// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// FACE QUALITY ASSESSMENT & POSE/LIGHTING/SHARPNESS VALIDATION ENGINE
// ==============================================================================
export class FaceQualityEngine {
    static MIN_SHARPNESS_LAPLACIAN = 100.0;
    static MIN_MEAN_LUMINANCE = 60.0;
    static MAX_MEAN_LUMINANCE = 200.0;
    static MIN_LUMINANCE_VARIANCE = 35.0;
    static MAX_YAW_DEGREES = 15.0;
    static MAX_PITCH_DEGREES = 15.0;
    static MAX_ROLL_DEGREES = 15.0;
    static MIN_IPD_PIXELS = 80.0;
    static MIN_OVERALL_QUALITY_THRESHOLD = 0.70;
    static isQualityAcceptable(score) {
        return score >= this.MIN_OVERALL_QUALITY_THRESHOLD;
    }
    /**
     * Evaluate face frame against all biometric enrollment quality gates.
     */
    static evaluateQuality(input) {
        const reasons = [];
        // 1. Face Count Gate: Exactly 1 face required
        if (input.detectedFaceCount === 0) {
            reasons.push('NO_FACE_DETECTED: No human face located in the camera viewport.');
        }
        else if (input.detectedFaceCount > 1) {
            reasons.push(`MULTIPLE_FACES_DETECTED: Found ${input.detectedFaceCount} faces. Only a single subject is permitted for enrollment.`);
        }
        // 2. Sharpness / Blur Gate
        const isBlurred = input.sharpness < this.MIN_SHARPNESS_LAPLACIAN;
        if (isBlurred) {
            reasons.push(`IMAGE_BLURRED: Sharpness score (${input.sharpness.toFixed(1)}) is below minimum clarity threshold (${this.MIN_SHARPNESS_LAPLACIAN}).`);
        }
        // 3. Lighting & Exposure Gate
        let isLightingAcceptable = true;
        if (input.meanLuminance < this.MIN_MEAN_LUMINANCE) {
            isLightingAcceptable = false;
            reasons.push(`INSUFFICIENT_LIGHTING: Image is underexposed (luminance: ${input.meanLuminance.toFixed(1)}, min: ${this.MIN_MEAN_LUMINANCE}).`);
        }
        else if (input.meanLuminance > this.MAX_MEAN_LUMINANCE) {
            isLightingAcceptable = false;
            reasons.push(`EXCESSIVE_GLARE: Image is overexposed or washed out (luminance: ${input.meanLuminance.toFixed(1)}, max: ${this.MAX_MEAN_LUMINANCE}).`);
        }
        else if (input.luminanceVariance < this.MIN_LUMINANCE_VARIANCE) {
            isLightingAcceptable = false;
            reasons.push(`POOR_CONTRAST: Lighting distribution has inadequate dynamic contrast (${input.luminanceVariance.toFixed(1)}).`);
        }
        // 4. Head Pose Angle Gate
        const isYawAcceptable = Math.abs(input.yawDegrees) <= this.MAX_YAW_DEGREES;
        const isPitchAcceptable = Math.abs(input.pitchDegrees) <= this.MAX_PITCH_DEGREES;
        const isRollAcceptable = Math.abs(input.rollDegrees) <= this.MAX_ROLL_DEGREES;
        const isPoseAcceptable = isYawAcceptable && isPitchAcceptable && isRollAcceptable;
        if (!isYawAcceptable) {
            reasons.push(`HEAD_YAW_EXCEEDED: Head turned horizontally by ${input.yawDegrees.toFixed(1)}° (max: ±${this.MAX_YAW_DEGREES}°).`);
        }
        if (!isPitchAcceptable) {
            reasons.push(`HEAD_PITCH_EXCEEDED: Head tilted vertically by ${input.pitchDegrees.toFixed(1)}° (max: ±${this.MAX_PITCH_DEGREES}°).`);
        }
        if (!isRollAcceptable) {
            reasons.push(`HEAD_ROLL_EXCEEDED: Head tilted sideways by ${input.rollDegrees.toFixed(1)}° (max: ±${this.MAX_ROLL_DEGREES}°).`);
        }
        // 5. Inter-Pupillary Distance (IPD) / Scale Gate
        const isIpdAcceptable = input.interPupillaryDistancePx >= this.MIN_IPD_PIXELS;
        if (!isIpdAcceptable) {
            reasons.push(`FACE_TOO_FAR: Inter-pupillary distance (${input.interPupillaryDistancePx.toFixed(1)}px) is below minimum (${this.MIN_IPD_PIXELS}px). Please move closer.`);
        }
        // 6. Viewport Boundary Truncation Check
        if (input.isTruncatedAtBorder) {
            reasons.push('FACE_TRUNCATED: Face bounding box extends outside the camera viewport boundaries.');
        }
        // 7. Composite Normalized Quality Score Calculation [0.0, 1.0]
        const sharpnessNormalized = Math.min(1.0, input.sharpness / 300.0);
        const lightingRange = this.MAX_MEAN_LUMINANCE - this.MIN_MEAN_LUMINANCE;
        const optimalLuminance = (this.MIN_MEAN_LUMINANCE + this.MAX_MEAN_LUMINANCE) / 2.0;
        const luminanceDiff = Math.abs(input.meanLuminance - optimalLuminance);
        const lightingNormalized = Math.max(0.0, 1.0 - (luminanceDiff / (lightingRange / 2.0)));
        const maxPose = Math.max(Math.abs(input.yawDegrees) / this.MAX_YAW_DEGREES, Math.abs(input.pitchDegrees) / this.MAX_PITCH_DEGREES, Math.abs(input.rollDegrees) / this.MAX_ROLL_DEGREES);
        const poseNormalized = Math.max(0.0, 1.0 - Math.min(1.0, maxPose * 0.7));
        const ipdNormalized = Math.min(1.0, input.interPupillaryDistancePx / 160.0);
        const overallQualityScore = Math.round((0.30 * sharpnessNormalized +
            0.25 * lightingNormalized +
            0.25 * poseNormalized +
            0.20 * ipdNormalized) * 1000) / 1000;
        const isAcceptableForEnrollment = reasons.length === 0 && overallQualityScore >= this.MIN_OVERALL_QUALITY_THRESHOLD;
        return {
            sharpness: Math.round(input.sharpness * 10) / 10,
            isBlurred,
            meanLuminance: Math.round(input.meanLuminance * 10) / 10,
            luminanceVariance: Math.round(input.luminanceVariance * 10) / 10,
            isLightingAcceptable,
            yawDegrees: Math.round(input.yawDegrees * 10) / 10,
            pitchDegrees: Math.round(input.pitchDegrees * 10) / 10,
            rollDegrees: Math.round(input.rollDegrees * 10) / 10,
            isPoseAcceptable,
            interPupillaryDistancePx: Math.round(input.interPupillaryDistancePx * 10) / 10,
            isIpdAcceptable,
            detectedFaceCount: input.detectedFaceCount,
            overallQualityScore,
            isAcceptableForEnrollment,
            rejectionReasons: reasons,
        };
    }
}
//# sourceMappingURL=quality.js.map