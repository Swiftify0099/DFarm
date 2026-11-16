import {
  normalizeL2,
  isFiniteEmbedding,
  computeCosineSimilarity,
  checkAlignmentQuality,
} from '../../src/face-ai/preprocessor';

describe('SFace INT8 Preprocessor & Normalizer', () => {
  test('strictly produces L2 unit norm where sum of squares is 1.0', () => {
    const rawVector = new Array(128).fill(0).map((_, i) => (i + 1) * 0.1);
    const normalized = normalizeL2(rawVector);

    expect(normalized.length).toBe(128);

    const sumSquares = normalized.reduce((sum, val) => sum + val * val, 0);
    expect(sumSquares).toBeCloseTo(1.0, 5);
  });

  test('validates finite numbers and catches NaN or Infinity', () => {
    const valid = new Array(128).fill(0.1);
    expect(isFiniteEmbedding(valid)).toBe(true);

    const withNaN = [...valid];
    withNaN[10] = NaN;
    expect(isFiniteEmbedding(withNaN)).toBe(false);

    const withInf = [...valid];
    withInf[50] = Infinity;
    expect(isFiniteEmbedding(withInf)).toBe(false);

    const wrongLength = [0.1, 0.2];
    expect(isFiniteEmbedding(wrongLength)).toBe(false);
  });

  test('computes cosine similarity accurately', () => {
    const vecA = normalizeL2(new Array(128).fill(1));
    const vecB = normalizeL2(new Array(128).fill(1));

    // Identical normalized vectors have cosine similarity of 1.0
    const sim = computeCosineSimilarity(vecA, vecB);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  test('evaluates facial landmark alignment quality correctly', () => {
    const alignedLandmarks = {
      rightEye: { x: 100, y: 120 },
      leftEye: { x: 200, y: 120 }, // horizontal level
      noseTip: { x: 150, y: 160 },  // centered
      rightMouthCorner: { x: 110, y: 200 },
      leftMouthCorner: { x: 190, y: 200 },
    };

    const result = checkAlignmentQuality(alignedLandmarks);
    expect(result.isAligned).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);

    // Tilted face
    const tiltedLandmarks = {
      rightEye: { x: 100, y: 100 },
      leftEye: { x: 200, y: 160 }, // severe tilt > 30 degrees
      noseTip: { x: 150, y: 160 },
      rightMouthCorner: { x: 110, y: 200 },
      leftMouthCorner: { x: 190, y: 200 },
    };

    const tiltedResult = checkAlignmentQuality(tiltedLandmarks);
    expect(tiltedResult.isAligned).toBe(false);
    expect(tiltedResult.reason).toContain('tilted');
  });
});
