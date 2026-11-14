/**
 * DFarm Registration App - Face Quality Analyzer
 * Parity with FaceQualityAnalyzer.kt
 */

export interface QualityMetrics {
  sharpness: number;
  isBlurred: boolean;
  meanLuminance: number;
  luminanceVariance: number;
  isLightingAcceptable: boolean;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  isPoseAcceptable: boolean;
  ipdPixels: number;
  isIpdAcceptable: boolean;
  detectedFaceCount: number;
  overallQualityScore: number;
  isAcceptableForEnrollment: boolean;
  rejectionReasons: string[];
}

export class FaceQualityAnalyzer {
  static readonly MIN_SHARPNESS_LAPLACIAN = 100.0;
  static readonly MIN_MEAN_LUMINANCE = 60.0;
  static readonly MAX_MEAN_LUMINANCE = 200.0;
  static readonly MIN_LUMINANCE_VARIANCE = 35.0;
  static readonly MAX_YAW_DEGREES = 15.0;
  static readonly MAX_PITCH_DEGREES = 15.0;
  static readonly MAX_ROLL_DEGREES = 15.0;
  static readonly MIN_IPD_PIXELS = 80.0;
  static readonly MIN_OVERALL_QUALITY_THRESHOLD = 0.7;

  evaluate(params: {
    detectedFaceCount: number;
    sharpness: number;
    meanLuminance: number;
    luminanceVariance: number;
    yawDegrees: number;
    pitchDegrees: number;
    rollDegrees: number;
    ipdPixels: number;
    isTruncatedAtBorder?: boolean;
  }): QualityMetrics {
    const {
      detectedFaceCount,
      sharpness,
      meanLuminance,
      luminanceVariance,
      yawDegrees,
      pitchDegrees,
      rollDegrees,
      ipdPixels,
      isTruncatedAtBorder = false,
    } = params;

    const reasons: string[] = [];

    if (detectedFaceCount === 0) {
      reasons.push('NO_FACE_DETECTED: Look directly into camera.');
    } else if (detectedFaceCount > 1) {
      reasons.push('MULTIPLE_FACES_DETECTED: Only one person allowed in frame.');
    }

    const isBlurred = sharpness < FaceQualityAnalyzer.MIN_SHARPNESS_LAPLACIAN;
    if (isBlurred) {
      reasons.push('IMAGE_BLURRED: Hold steady for clear focus.');
    }

    let isLightingAcceptable = true;
    if (meanLuminance < FaceQualityAnalyzer.MIN_MEAN_LUMINANCE) {
      isLightingAcceptable = false;
      reasons.push('INSUFFICIENT_LIGHT: Move to a well-lit area.');
    } else if (meanLuminance > FaceQualityAnalyzer.MAX_MEAN_LUMINANCE) {
      isLightingAcceptable = false;
      reasons.push('EXCESSIVE_GLARE: Avoid harsh direct backlight or reflections.');
    } else if (luminanceVariance < FaceQualityAnalyzer.MIN_LUMINANCE_VARIANCE) {
      isLightingAcceptable = false;
      reasons.push('POOR_CONTRAST: Lighting is too flat or harsh.');
    }

    const isYawOk = Math.abs(yawDegrees) <= FaceQualityAnalyzer.MAX_YAW_DEGREES;
    const isPitchOk = Math.abs(pitchDegrees) <= FaceQualityAnalyzer.MAX_PITCH_DEGREES;
    const isRollOk = Math.abs(rollDegrees) <= FaceQualityAnalyzer.MAX_ROLL_DEGREES;
    const isPoseAcceptable = isYawOk && isPitchOk && isRollOk;

    if (!isYawOk) reasons.push('HEAD_TURNED: Look straight ahead.');
    if (!isPitchOk) reasons.push('HEAD_TILTED: Keep head level.');
    if (!isRollOk) reasons.push('HEAD_CANTED: Keep head upright.');

    const isIpdAcceptable = ipdPixels >= FaceQualityAnalyzer.MIN_IPD_PIXELS;
    if (!isIpdAcceptable) {
      reasons.push('TOO_FAR: Move closer to the camera.');
    }

    if (isTruncatedAtBorder) {
      reasons.push('FACE_TRUNCATED: Keep entire face inside circle.');
    }

    const sharpnessNorm = Math.min(1.0, sharpness / 300.0);
    const optimalLuminance =
      (FaceQualityAnalyzer.MIN_MEAN_LUMINANCE + FaceQualityAnalyzer.MAX_MEAN_LUMINANCE) / 2.0;
    const lumRange =
      (FaceQualityAnalyzer.MAX_MEAN_LUMINANCE - FaceQualityAnalyzer.MIN_MEAN_LUMINANCE) / 2.0;
    const lightingNorm = Math.max(
      0.0,
      1.0 - Math.abs(meanLuminance - optimalLuminance) / lumRange
    );
    const maxPoseRatio = Math.max(
      Math.abs(yawDegrees) / FaceQualityAnalyzer.MAX_YAW_DEGREES,
      Math.abs(pitchDegrees) / FaceQualityAnalyzer.MAX_PITCH_DEGREES,
      Math.abs(rollDegrees) / FaceQualityAnalyzer.MAX_ROLL_DEGREES
    );
    const poseNorm = Math.max(0.0, 1.0 - Math.min(1.0, maxPoseRatio * 0.7));
    const ipdNorm = Math.min(1.0, ipdPixels / 160.0);

    const compositeScore =
      0.3 * sharpnessNorm + 0.25 * lightingNorm + 0.25 * poseNorm + 0.2 * ipdNorm;
    const roundedScore = Math.round(compositeScore * 1000) / 1000.0;

    const isAcceptable =
      reasons.length === 0 && roundedScore >= FaceQualityAnalyzer.MIN_OVERALL_QUALITY_THRESHOLD;

    return {
      sharpness,
      isBlurred,
      meanLuminance,
      luminanceVariance,
      isLightingAcceptable,
      yawDegrees,
      pitchDegrees,
      rollDegrees,
      isPoseAcceptable,
      ipdPixels,
      isIpdAcceptable,
      detectedFaceCount,
      overallQualityScore: roundedScore,
      isAcceptableForEnrollment: isAcceptable,
      rejectionReasons: reasons,
    };
  }
}
