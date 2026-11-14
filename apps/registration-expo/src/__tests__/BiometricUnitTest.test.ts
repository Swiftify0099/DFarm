/**
 * DFarm Registration App - Biometric & Security Tests
 * Complete parity with Kotlin BiometricUnitTest.kt
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FaceQualityAnalyzer } from '../biometric/FaceQualityAnalyzer';
import { MobileFaceNetModel } from '../biometric/FaceEmbeddingModel';
import { BiometricKeystoreEncryptor } from '../biometric/BiometricKeystoreEncryptor';

describe('BiometricUnitTest', () => {
  const qualityAnalyzer = new FaceQualityAnalyzer();
  const embeddingModel = new MobileFaceNetModel();
  const encryptor = new BiometricKeystoreEncryptor();

  it('test face quality rejects no face and multiple faces', () => {
    const noFace = qualityAnalyzer.evaluate({
      detectedFaceCount: 0,
      sharpness: 150,
      meanLuminance: 120,
      luminanceVariance: 45,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 100,
    });
    assert.strictEqual(noFace.isAcceptableForEnrollment, false, 'Must reject when 0 faces detected');
    assert.strictEqual(
      noFace.rejectionReasons.some((r) => r.includes('NO_FACE_DETECTED')),
      true
    );

    const multiFace = qualityAnalyzer.evaluate({
      detectedFaceCount: 2,
      sharpness: 150,
      meanLuminance: 120,
      luminanceVariance: 45,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 100,
    });
    assert.strictEqual(multiFace.isAcceptableForEnrollment, false, 'Must reject when multiple faces detected');
    assert.strictEqual(
      multiFace.rejectionReasons.some((r) => r.includes('MULTIPLE_FACES_DETECTED')),
      true
    );
  });

  it('test face quality validates sharpness and illumination thresholds', () => {
    const blurred = qualityAnalyzer.evaluate({
      detectedFaceCount: 1,
      sharpness: 45, // Below 100.0f
      meanLuminance: 120,
      luminanceVariance: 45,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 100,
    });
    assert.strictEqual(blurred.isAcceptableForEnrollment, false, 'Must reject blurred image');
    assert.strictEqual(blurred.isBlurred, true);

    const dark = qualityAnalyzer.evaluate({
      detectedFaceCount: 1,
      sharpness: 150,
      meanLuminance: 25, // Below 60.0f
      luminanceVariance: 45,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 100,
    });
    assert.strictEqual(dark.isAcceptableForEnrollment, false, 'Must reject dark image');
    assert.strictEqual(dark.isLightingAcceptable, false);

    const valid = qualityAnalyzer.evaluate({
      detectedFaceCount: 1,
      sharpness: 180,
      meanLuminance: 125,
      luminanceVariance: 50,
      yawDegrees: 3,
      pitchDegrees: -2,
      rollDegrees: 1,
      ipdPixels: 110,
    });
    assert.strictEqual(valid.isAcceptableForEnrollment, true, 'Must accept high-quality frame');
    assert.strictEqual(valid.overallQualityScore >= 0.70, true);
  });

  it('test face quality rejects excessive pose angles and small IPD', () => {
    const extremeYaw = qualityAnalyzer.evaluate({
      detectedFaceCount: 1,
      sharpness: 180,
      meanLuminance: 120,
      luminanceVariance: 45,
      yawDegrees: 25, // Exceeds 15°
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 100,
    });
    assert.strictEqual(extremeYaw.isAcceptableForEnrollment, false, 'Must reject excessive yaw angle');
    assert.strictEqual(extremeYaw.isPoseAcceptable, false);

    const smallIpd = qualityAnalyzer.evaluate({
      detectedFaceCount: 1,
      sharpness: 180,
      meanLuminance: 120,
      luminanceVariance: 45,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      ipdPixels: 55, // Below 80px
    });
    assert.strictEqual(
      smallIpd.isAcceptableForEnrollment,
      false,
      'Must reject face too far from camera (small IPD)'
    );
    assert.strictEqual(smallIpd.isIpdAcceptable, false);
  });

  it('test MobileFaceNet embedding generation produces 512D unit vector', () => {
    const dummyTensor = new Float32Array(112 * 112 * 3).fill(0.5);
    const embedding = embeddingModel.generateEmbedding(dummyTensor);

    assert.strictEqual(embedding.length, 512, 'Embedding dimension must be 512');

    let sumSq = 0;
    for (const v of embedding) {
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);
    assert.strictEqual(Math.abs(norm - 1.0) < 1e-4, true, 'Embedding must be L2 normalized to unit length');
  });

  it('test cosine similarity calculation', () => {
    const vecA = new Array(512).fill(0);
    vecA[0] = 1.0;

    const vecB = new Array(512).fill(0);
    vecB[0] = 1.0;

    const vecC = new Array(512).fill(0);
    vecC[1] = 1.0;

    const similarityIdentical = embeddingModel.cosineSimilarity(vecA, vecB);
    assert.strictEqual(Math.abs(similarityIdentical - 1.0) < 1e-5, true);

    const similarityOrthogonal = embeddingModel.cosineSimilarity(vecA, vecC);
    assert.strictEqual(Math.abs(similarityOrthogonal - 0.0) < 1e-5, true);
  });

  it('test AES-256-GCM envelope encryption and decryption with AAD customer binding', async () => {
    const customerId = 'c1111111-1111-1111-1111-111111111111';
    const modelVersion = 'mobilefacenet-v1';
    const originalVector = new Array(512).fill(0).map((_, i) => (i % 10) / 10);

    const envelope = await encryptor.encrypt(originalVector, customerId, modelVersion);
    assert.ok(envelope.ciphertextBase64);
    assert.ok(envelope.ivBase64);
    assert.ok(envelope.authTagBase64);
    assert.strictEqual(envelope.algorithm, 'AES-256-GCM');

    // Decrypt with correct customer UUID and model version
    const decrypted = await encryptor.decrypt(envelope, customerId, modelVersion);
    assert.strictEqual(decrypted.length, 512);
    for (let i = 0; i < 512; i++) {
      assert.strictEqual(Math.abs(decrypted[i] - originalVector[i]) < 1e-4, true);
    }
  });
});
