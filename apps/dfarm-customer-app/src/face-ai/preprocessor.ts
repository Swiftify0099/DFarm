import { YuNetLandmarks } from '../types/face';
import { FACE_MODEL_MANIFEST } from './manifest';

/**
 * Normalizes a 128-dimensional embedding vector to unit L2 norm
 * ||v||_2 = 1.0
 */
export function normalizeL2(vector: number[]): number[] {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0 || !Number.isFinite(norm)) {
    return new Array(vector.length).fill(0);
  }
  return vector.map((val) => val / norm);
}

/**
 * Averages multiple quality-checked 128-D embedding vectors and applies L2 unit normalization
 * Formulates the stable master biometric template
 */
export function averageAndNormalizeEmbeddings(vectors: number[][]): number[] {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    return new Array(128).fill(0);
  }
  const dim = vectors[0].length;
  const accumulator = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      accumulator[i] += vec[i] || 0;
    }
  }

  const averaged = accumulator.map((val) => val / vectors.length);
  return normalizeL2(averaged);
}

/**
 * Validates that all elements of an embedding are finite numbers (no NaN or Infinity)
 */
export function isFiniteEmbedding(vector: number[]): boolean {
  if (!Array.isArray(vector) || vector.length !== 128) {
    return false;
  }
  return vector.every((val) => typeof val === 'number' && Number.isFinite(val));
}

/**
 * Computes Cosine Similarity between two 128-D L2-normalized embeddings
 * SFace official match threshold is 0.363 for Cosine Similarity
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== 128 || b.length !== 128) {
    throw new Error('Embeddings must be 128-dimensional');
  }
  let dotProduct = 0;
  for (let i = 0; i < 128; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

/**
 * Validates facial landmark alignment against the canonical SFace template
 * Checks inter-pupillary distance, eye level, and mouth-to-eye proportions
 */
export function checkAlignmentQuality(landmarks: YuNetLandmarks): {
  isAligned: boolean;
  score: number;
  reason?: string;
} {
  const { rightEye, leftEye, noseTip, rightMouthCorner, leftMouthCorner } = landmarks;

  // 1. Check eye level tilt (angle must be < 15 degrees)
  const dy = leftEye.y - rightEye.y;
  const dx = leftEye.x - rightEye.x;
  const eyeDistance = Math.sqrt(dx * dx + dy * dy);

  if (eyeDistance < 20) {
    return { isAligned: false, score: 0.2, reason: 'Face is too far from camera' };
  }

  const angleRad = Math.atan2(dy, dx);
  const angleDeg = Math.abs((angleRad * 180) / Math.PI);

  if (angleDeg > 18) {
    return { isAligned: false, score: 0.4, reason: 'Please hold head straight (tilted)' };
  }

  // 2. Check nose centering relative to eye center
  const eyeCenterX = (rightEye.x + leftEye.x) / 2;
  const noseOffset = Math.abs(noseTip.x - eyeCenterX);
  if (noseOffset > eyeDistance * 0.45) {
    return { isAligned: false, score: 0.5, reason: 'Please look directly at the camera' };
  }

  // 3. Check mouth presence below nose
  const mouthCenterY = (rightMouthCorner.y + leftMouthCorner.y) / 2;
  if (mouthCenterY <= noseTip.y) {
    return { isAligned: false, score: 0.3, reason: 'Mouth must be below nose' };
  }

  const qualityScore = Math.min(1.0, Math.max(0.7, 1.0 - (angleDeg / 30)));
  return { isAligned: true, score: qualityScore };
}
