import { FaceQualityMetrics } from '@dfarm/shared-types';
export interface RawQualityInput {
    detectedFaceCount: number;
    sharpness: number;
    meanLuminance: number;
    luminanceVariance: number;
    yawDegrees: number;
    pitchDegrees: number;
    rollDegrees: number;
    interPupillaryDistancePx: number;
    isTruncatedAtBorder?: boolean;
}
export declare class FaceQualityEngine {
    static readonly MIN_SHARPNESS_LAPLACIAN = 100;
    static readonly MIN_MEAN_LUMINANCE = 60;
    static readonly MAX_MEAN_LUMINANCE = 200;
    static readonly MIN_LUMINANCE_VARIANCE = 35;
    static readonly MAX_YAW_DEGREES = 15;
    static readonly MAX_PITCH_DEGREES = 15;
    static readonly MAX_ROLL_DEGREES = 15;
    static readonly MIN_IPD_PIXELS = 80;
    static readonly MIN_OVERALL_QUALITY_THRESHOLD = 0.7;
    static isQualityAcceptable(score: number): boolean;
    /**
     * Evaluate face frame against all biometric enrollment quality gates.
     */
    static evaluateQuality(input: RawQualityInput): FaceQualityMetrics;
}
//# sourceMappingURL=quality.d.ts.map