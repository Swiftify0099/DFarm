// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRIC VECTOR MATCHER (COSINE SIMILARITY & THRESHOLD VALIDATION)
// ==============================================================================

import { FaceModelService } from './model-service.js';

export interface BiometricMatchResult {
  score: number;
  isMatch: boolean;
  threshold: number;
}

export class BiometricMatcher {
  public static readonly DEFAULT_THRESHOLD = FaceModelService.CANONICAL_MODEL.recommendedThreshold;

  /**
   * Compute cosine similarity between two 512D embedding vectors.
   */
  public static computeCosineSimilarity(
    vectorA: number[] | Float32Array,
    vectorB: number[] | Float32Array
  ): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      const a = vectorA[i]!;
      const b = vectorB[i]!;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Compare probe against template and evaluate against calibrated threshold.
   */
  public static match(
    probe: number[] | Float32Array,
    template: number[] | Float32Array,
    threshold = BiometricMatcher.DEFAULT_THRESHOLD
  ): BiometricMatchResult {
    const score = this.computeCosineSimilarity(probe, template);
    return {
      score,
      isMatch: score >= threshold,
      threshold,
    };
  }
}
