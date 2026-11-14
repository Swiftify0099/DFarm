import { LivenessClassification, LivenessChallengeType } from '@dfarm/shared-types';
export interface PresentationAttackMetrics {
    textureHighFreqRatio: number;
    specularReflectionSpread: number;
    colorGamutDiversity: number;
    motionParallaxScore: number;
    hasActiveChallengePassed: boolean;
    hardwareDepthSensorPresent: boolean;
}
export interface LivenessEvaluationResult {
    classification: LivenessClassification;
    livenessScore: number;
    passed: boolean;
    isRestricted: boolean;
    detectedAttackTypes: string[];
    challengeAuditTrail?: {
        challenge: LivenessChallengeType;
        responseTimeMs: number;
        passed: boolean;
    };
}
export declare class LivenessEngine {
    static readonly MIN_TEXTURE_RATIO = 0.18;
    static readonly MAX_SCREEN_MOIRE_RATIO = 0.82;
    static readonly MIN_SPECULAR_SPREAD = 22;
    static readonly MIN_COLOR_DIVERSITY = 0.35;
    static readonly MIN_PARALLAX_SCORE = 0.4;
    /**
     * Evaluate presentation attack risk against printed photos, smartphone screens, and video replay.
     */
    static evaluatePresentationAttack(metrics: PresentationAttackMetrics, activeChallengeAudit?: {
        challenge: LivenessChallengeType;
        responseTimeMs: number;
        passed: boolean;
    }): LivenessEvaluationResult;
    static generateRandomChallenge(): LivenessChallengeType;
}
//# sourceMappingURL=liveness.d.ts.map