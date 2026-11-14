// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// SHARED TYPES: BIOMETRICS, FACE ENROLLMENT & RECOGNITION SPECIFICATION
// ==============================================================================
export var FaceEnrollmentStatus;
(function (FaceEnrollmentStatus) {
    FaceEnrollmentStatus["ACTIVE"] = "ACTIVE";
    FaceEnrollmentStatus["SUPERSEDED"] = "SUPERSEDED";
    FaceEnrollmentStatus["REVOKED"] = "REVOKED";
    FaceEnrollmentStatus["PERMANENTLY_ERASED"] = "PERMANENTLY_ERASED";
})(FaceEnrollmentStatus || (FaceEnrollmentStatus = {}));
export var BiometricConsentType;
(function (BiometricConsentType) {
    BiometricConsentType["BIOMETRIC_FACE_ENROLLMENT"] = "BIOMETRIC_FACE_ENROLLMENT";
})(BiometricConsentType || (BiometricConsentType = {}));
export var BiometricRetentionStatus;
(function (BiometricRetentionStatus) {
    BiometricRetentionStatus["ACTIVE"] = "ACTIVE";
    BiometricRetentionStatus["GRACE_PERIOD"] = "GRACE_PERIOD";
    BiometricRetentionStatus["ERASED"] = "ERASED";
    BiometricRetentionStatus["EXEMPT"] = "EXEMPT";
})(BiometricRetentionStatus || (BiometricRetentionStatus = {}));
export var LivenessClassification;
(function (LivenessClassification) {
    LivenessClassification["LIVE"] = "LIVE";
    LivenessClassification["SUSPECTED_SPOOF"] = "SUSPECTED_SPOOF";
    LivenessClassification["RESTRICTED_PASS"] = "RESTRICTED_PASS";
    LivenessClassification["FAILED"] = "FAILED";
})(LivenessClassification || (LivenessClassification = {}));
export var LivenessChallengeType;
(function (LivenessChallengeType) {
    LivenessChallengeType["LOOK_CENTER"] = "LOOK_CENTER";
    LivenessChallengeType["TURN_RIGHT"] = "TURN_RIGHT";
    LivenessChallengeType["TURN_LEFT"] = "TURN_LEFT";
    LivenessChallengeType["BLINK"] = "BLINK";
    LivenessChallengeType["SMILE"] = "SMILE";
})(LivenessChallengeType || (LivenessChallengeType = {}));
export var FaceMatchDecisionStatus;
(function (FaceMatchDecisionStatus) {
    FaceMatchDecisionStatus["MATCH_FOUND"] = "MATCH_FOUND";
    FaceMatchDecisionStatus["UNKNOWN_CUSTOMER"] = "UNKNOWN_CUSTOMER";
    FaceMatchDecisionStatus["AMBIGUOUS_COMPETING_MATCH"] = "AMBIGUOUS_COMPETING_MATCH";
    FaceMatchDecisionStatus["INCOMPATIBLE_VERSION"] = "INCOMPATIBLE_VERSION";
    FaceMatchDecisionStatus["INACTIVE_CUSTOMER"] = "INACTIVE_CUSTOMER";
    FaceMatchDecisionStatus["REVOKED_CONSENT"] = "REVOKED_CONSENT";
    FaceMatchDecisionStatus["DELETED_CUSTOMER"] = "DELETED_CUSTOMER";
    FaceMatchDecisionStatus["LOW_QUALITY_INPUT"] = "LOW_QUALITY_INPUT";
})(FaceMatchDecisionStatus || (FaceMatchDecisionStatus = {}));
//# sourceMappingURL=biometric.js.map