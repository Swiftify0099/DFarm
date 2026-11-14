/**
 * DFarm Registration App - Liveness Challenge Coordinator
 * Parity with LivenessChallengeCoordinator.kt
 */

import { MobileFaceNetModel } from './FaceEmbeddingModel';

export interface LivenessChallenge {
  key: string;
  prompt: string;
}

export const LIVENESS_CHALLENGES: LivenessChallenge[] = [
  { key: 'LOOK_CENTER', prompt: 'Look straight ahead into the circle' },
  { key: 'TURN_RIGHT', prompt: 'Turn head slightly to the right' },
  { key: 'TURN_LEFT', prompt: 'Turn head slightly to the left' },
  { key: 'BLINK', prompt: 'Blink your eyes naturally' },
  { key: 'SMILE', prompt: 'Smile gently' },
];

export type LivenessClassification =
  | 'LIVE'
  | 'SUSPECTED_SPOOF'
  | 'RESTRICTED_PASS'
  | 'FAILED';

export interface SampleCapture {
  embedding: number[];
  qualityScore: number;
  yaw: number;
  pitch: number;
}

export interface MultiSampleResult {
  centroidEmbedding: number[];
  averageQualityScore: number;
  sampleCount: number;
  isConsistent: boolean;
  minPairwiseSimilarity: number;
  livenessClassification: LivenessClassification;
  livenessScore: number;
}

export class LivenessChallengeCoordinator {
  private requiredSamples: number;
  private isDepthSensorAvailable: boolean;
  private collectedSamples: SampleCapture[] = [];
  private currentChallenge: LivenessChallenge;

  constructor(requiredSamples: number = 3, isDepthSensorAvailable: boolean = false) {
    this.requiredSamples = requiredSamples;
    this.isDepthSensorAvailable = isDepthSensorAvailable;
    this.currentChallenge = LIVENESS_CHALLENGES[0];
    this.generateNextChallenge();
  }

  getCurrentChallenge(): LivenessChallenge {
    return this.currentChallenge;
  }

  generateNextChallenge(): LivenessChallenge {
    const idx = Math.floor(Math.random() * LIVENESS_CHALLENGES.length);
    this.currentChallenge = LIVENESS_CHALLENGES[idx];
    return this.currentChallenge;
  }

  addSample(
    embedding: number[],
    qualityScore: number,
    yaw: number,
    pitch: number
  ): boolean {
    if (this.collectedSamples.length >= this.requiredSamples) return true;
    this.collectedSamples.push({ embedding, qualityScore, yaw, pitch });
    if (this.collectedSamples.length < this.requiredSamples) {
      this.generateNextChallenge();
    }
    return this.collectedSamples.length >= this.requiredSamples;
  }

  getSamplesCount(): number {
    return this.collectedSamples.length;
  }

  getRequiredCount(): number {
    return this.requiredSamples;
  }

  reset(): void {
    this.collectedSamples = [];
    this.generateNextChallenge();
  }

  finalizeEnrollment(): MultiSampleResult {
    if (this.collectedSamples.length === 0) {
      throw new Error('No face samples collected for enrollment.');
    }

    const dim = this.collectedSamples[0].embedding.length;
    let minPairwise = 1.0;

    // 1. Pairwise consistency across all captured samples
    for (let i = 0; i < this.collectedSamples.length; i++) {
      for (let j = i + 1; j < this.collectedSamples.length; j++) {
        const sim = MobileFaceNetModel.cosineSimilarity(
          this.collectedSamples[i].embedding,
          this.collectedSamples[j].embedding
        );
        if (sim < minPairwise) {
          minPairwise = sim;
        }
      }
    }

    const isConsistent = this.collectedSamples.length === 1 || minPairwise >= 0.85;

    // 2. Compute centroid vector
    const mean: number[] = new Array(dim).fill(0);
    let totalQuality = 0;

    for (const sample of this.collectedSamples) {
      totalQuality += sample.qualityScore;
      for (let d = 0; d < dim; d++) {
        mean[d] += sample.embedding[d];
      }
    }

    for (let d = 0; d < dim; d++) {
      mean[d] /= this.collectedSamples.length;
    }

    const centroid = MobileFaceNetModel.l2Normalize(mean);
    const avgQuality =
      Math.round((totalQuality / this.collectedSamples.length) * 1000) / 1000.0;

    // 3. Android / Mobile 2D camera policy: RESTRICTED_PASS unless hardware depth sensor
    const classification: LivenessClassification = !isConsistent
      ? 'FAILED'
      : this.isDepthSensorAvailable
      ? 'LIVE'
      : 'RESTRICTED_PASS';

    const livenessScore = isConsistent ? 0.95 : 0.4;

    return {
      centroidEmbedding: centroid,
      averageQualityScore: avgQuality,
      sampleCount: this.collectedSamples.length,
      isConsistent,
      minPairwiseSimilarity: Math.round(minPairwise * 1000) / 1000.0,
      livenessClassification: classification,
      livenessScore,
    };
  }
}
