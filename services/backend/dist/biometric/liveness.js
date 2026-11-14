// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// LIVENESS DETECTION & PRESENTATION ATTACK DEFENSE ENGINE (PAD)
// ==============================================================================
import { LivenessClassification, LivenessChallengeType } from '@dfarm/shared-types';
export class LivenessEngine {
    static MIN_TEXTURE_RATIO = 0.18;
    static MAX_SCREEN_MOIRE_RATIO = 0.82;
    static MIN_SPECULAR_SPREAD = 22.0;
    static MIN_COLOR_DIVERSITY = 0.35;
    static MIN_PARALLAX_SCORE = 0.40;
    /**
     * Evaluate presentation attack risk against printed photos, smartphone screens, and video replay.
     */
    static evaluatePresentationAttack(metrics, activeChallengeAudit) {
        const attacks = [];
        // 1. Printed Photo Detection
        if (metrics.textureHighFreqRatio < this.MIN_TEXTURE_RATIO) {
            attacks.push('PRINTED_PHOTO_ATTACK: Low high-frequency texture gradient characteristic of flat paper.');
        }
        if (metrics.specularReflectionSpread < this.MIN_SPECULAR_SPREAD) {
            attacks.push('STATIC_SURFACE_DETECTED: Specular reflection spread indicates uniform flat plane.');
        }
        // 2. Electronic Screen Replay Detection
        if (metrics.textureHighFreqRatio > this.MAX_SCREEN_MOIRE_RATIO) {
            attacks.push('SCREEN_REPLAY_ATTACK: High-frequency periodic interference pattern indicative of digital screen.');
        }
        if (metrics.colorGamutDiversity < this.MIN_COLOR_DIVERSITY) {
            attacks.push('NARROW_SPECTRUM_EMISSION: Color gamut matches digital screen backlighting.');
        }
        // 3. Motion Parallax
        if (metrics.motionParallaxScore < this.MIN_PARALLAX_SCORE && !metrics.hardwareDepthSensorPresent) {
            attacks.push('ZERO_DEPTH_PARALLAX: Planar motion detected across frames with no relative nose-to-cheek disparity.');
        }
        // 4. Active Challenge-Response Validation
        if (activeChallengeAudit && !activeChallengeAudit.passed) {
            attacks.push(`ACTIVE_CHALLENGE_FAILED: Subject failed randomized challenge: ${activeChallengeAudit.challenge}.`);
        }
        let score = 1.0;
        if (attacks.length > 0) {
            score = Math.max(0.05, 1.0 - (attacks.length * 0.30));
        }
        let classification;
        let isRestricted = false;
        if (attacks.length > 0 || (activeChallengeAudit && !activeChallengeAudit.passed)) {
            classification = LivenessClassification.SUSPECTED_SPOOF;
        }
        else if (metrics.hardwareDepthSensorPresent) {
            classification = LivenessClassification.LIVE;
        }
        else {
            classification = LivenessClassification.RESTRICTED_PASS;
            isRestricted = true;
        }
        const passed = classification === LivenessClassification.LIVE || classification === LivenessClassification.RESTRICTED_PASS;
        return {
            classification,
            livenessScore: Math.round(score * 100) / 100,
            passed,
            isRestricted,
            detectedAttackTypes: attacks,
            challengeAuditTrail: activeChallengeAudit,
        };
    }
    static generateRandomChallenge() {
        const challenges = [
            LivenessChallengeType.TURN_RIGHT,
            LivenessChallengeType.TURN_LEFT,
            LivenessChallengeType.BLINK,
            LivenessChallengeType.SMILE,
        ];
        const index = Math.floor(Math.random() * challenges.length);
        return challenges[index];
    }
}
//# sourceMappingURL=liveness.js.map