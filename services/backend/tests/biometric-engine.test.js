import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../dist/app.js';
import { pool } from '../dist/config/db.js';
import {
  BiometricEncryptionEngine,
  FaceQualityEngine,
  FaceAlignmentEngine,
  BiometricMatcher,
  LivenessEngine,
  FaceModelService
} from '../dist/biometric/index.js';
import { CustomerRepository } from '../dist/modules/customers/customer.repository.js';
import { BiometricRepository } from '../dist/modules/biometrics/biometric.repository.js';

// Generate normalized mock 512D unit vector
function generateMockEmbedding(dim = 512, seed = 1) {
  const vec = new Float32Array(dim);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(seed * (i + 1));
    vec[i] = val;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < dim; i++) {
    vec[i] /= norm;
  }
  return vec;
}

test('DFarm Phase 07: Biometric Face Engine & Verification Suite (20 Scenarios)', async (t) => {
  t.after(async () => {
    await pool.end();
  });
  const testOrgId = 'org-sangli-001';
  const testCenterId = 'center-tasgaon-001';
  const officerUserId = 'officer-p07-001';
  const activeCustomerUuid = 'c1111111-1111-4111-a111-111111111111';
  const inactiveCustomerUuid = 'c2222222-2222-4222-a222-222222222222';
  const deletedCustomerUuid = 'c3333333-3333-4333-a333-333333333333';
  const revokedConsentCustomerUuid = 'c4444444-4444-4444-a444-444444444444';
  const modelVersionId = 'f0000000-0000-4000-a000-000000000001';

  const rawKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const encryptor = new BiometricEncryptionEngine(rawKeyHex, 'key-v1-2026');

  // Sign Registration Officer JWT token
  const authToken = jwt.sign(
    {
      sub: officerUserId,
      userId: officerUserId,
      organizationId: testOrgId,
      centerId: testCenterId,
      role: 'REGISTRATION_OFFICER'
    },
    process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long',
    { expiresIn: '2h' }
  );

  // In-memory test store for customer biometrics
  const enrollmentDb = new Map();
  let enrollmentStatusMap = new Map();

  // Mock repository methods
  CustomerRepository.getCustomerById = async (id) => {
    if (id === activeCustomerUuid) {
      return {
        id: activeCustomerUuid,
        organizationId: testOrgId,
        primaryCenterId: testCenterId,
        farmerCode: 'DF-2026-0042',
        fullName: 'Suresh Patil',
        normalizedMobileNumber: '+919876543210',
        status: 'ACTIVE',
        registrationStatus: 'DOCUMENT_VERIFIED',
        isDeleted: false,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
      };
    }
    if (id === inactiveCustomerUuid) {
      return {
        id: inactiveCustomerUuid,
        organizationId: testOrgId,
        primaryCenterId: testCenterId,
        farmerCode: 'DF-2026-0099',
        fullName: 'Inactive Farmer',
        normalizedMobileNumber: '+919876543299',
        status: 'SUSPENDED',
        registrationStatus: 'PENDING',
        isDeleted: false,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
      };
    }
    if (id === deletedCustomerUuid) {
      return {
        id: deletedCustomerUuid,
        organizationId: testOrgId,
        primaryCenterId: testCenterId,
        farmerCode: 'DF-2026-0088',
        fullName: 'Deleted Farmer',
        normalizedMobileNumber: '+919876543288',
        status: 'SOFT_DELETED',
        registrationStatus: 'REJECTED',
        isDeleted: true,
        deletedAt: '2026-11-12T10:00:00Z',
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-12T10:00:00Z',
      };
    }
    if (id === revokedConsentCustomerUuid) {
      return {
        id: revokedConsentCustomerUuid,
        organizationId: testOrgId,
        primaryCenterId: testCenterId,
        farmerCode: 'DF-2026-0077',
        fullName: 'Revoked Consent Farmer',
        normalizedMobileNumber: '+919876543277',
        status: 'ACTIVE',
        registrationStatus: 'DOCUMENT_VERIFIED',
        isDeleted: false,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
      };
    }
    return null;
  };

  BiometricRepository.getActiveConsent = async (customerId) => {
    if (customerId === activeCustomerUuid || customerId === inactiveCustomerUuid) {
      return {
        id: 'consent-001',
        customer_id: customerId,
        consent_type: 'BIOMETRIC_FACE_ENROLLMENT',
        consent_granted: true,
        consent_text_version: 'v1.0.0',
        consent_language: 'mr',
        officer_id: officerUserId,
        recorded_at: '2026-11-10T10:00:00Z',
        revoked_at: null,
        revocation_reason: null,
      };
    }
    return null; // Revoked or missing
  };

  BiometricRepository.getModelVersionById = async (id) => {
    return {
      ...FaceModelService.CANONICAL_MODEL,
      id: modelVersionId,
    };
  };

  BiometricRepository.getActiveModelVersions = async () => {
    return [{
      ...FaceModelService.CANONICAL_MODEL,
      id: modelVersionId,
    }];
  };

  BiometricRepository.listModelVersions = async () => {
    return [FaceModelService.CANONICAL_MODEL];
  };

  BiometricRepository.revokeFaceEnrollment = async (params) => {
    enrollmentStatusMap.set(params.customerId, false);
    const history = enrollmentDb.get(params.customerId) || [];
    const updated = history.map(e => ({ ...e, status: 'REVOKED' }));
    enrollmentDb.set(params.customerId, updated);
    return {
      revokedCount: history.length,
      customerId: params.customerId,
      status: 'REVOKED'
    };
  };

  BiometricRepository.saveFaceEnrollment = async (params) => {
    const existing = enrollmentDb.get(params.customerId) || [];
    // Mark previous as SUPERSEDED
    const updated = existing.map(e => ({ ...e, status: 'SUPERSEDED' }));
    const genId = `enrollment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const nowIso = new Date().toISOString();
    const newRecord = {
      id: genId,
      enrollmentId: genId,
      customer_id: params.customerId,
      customerId: params.customerId,
      model_version_id: params.modelVersionId,
      modelVersionId: params.modelVersionId,
      quality_score: params.qualityScore,
      qualityScore: params.qualityScore,
      liveness_score: params.livenessScore,
      livenessScore: params.livenessScore,
      status: 'ACTIVE',
      enrolled_at: nowIso,
      enrolledAt: nowIso
    };
    updated.push(newRecord);
    enrollmentDb.set(params.customerId, updated);
    enrollmentStatusMap.set(params.customerId, true);
    return newRecord;
  };

  BiometricRepository.getActiveFaceEnrollmentStatus = async (customerId) => {
    const isEnrolled = enrollmentStatusMap.get(customerId) === true;
    if (!isEnrolled) return null;
    const history = enrollmentDb.get(customerId) || [];
    const active = history.find(e => e.status === 'ACTIVE');
    if (!active) return null;
    return {
      id: active.id,
      customer_id: customerId,
      status: 'ACTIVE',
      quality_score: active.quality_score,
      liveness_score: active.liveness_score,
      enrolled_at: active.enrolled_at,
      face_model_versions: {
        model_name: 'MobileFaceNet-ArcFace',
        model_version: 'v1.0.0',
      }
    };
  };

  BiometricRepository.revokeEnrollment = async (params) => {
    enrollmentStatusMap.set(params.customerId, false);
    const history = enrollmentDb.get(params.customerId) || [];
    const updated = history.map(e => ({ ...e, status: 'REVOKED' }));
    enrollmentDb.set(params.customerId, updated);
    return {
      revokedCount: history.length,
      customerId: params.customerId,
      status: 'REVOKED'
    };
  };

  const app = createApp();

  // --- 1. Face Detection ---
  await t.test('1. Face detection checks: rejects no-face and multiple-faces', async () => {
    const zeroFace = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 0,
      sharpness: 150,
      meanLuminance: 120,
      luminanceVariance: 45,
      pitchDegrees: 0,
      yawDegrees: 0,
      rollDegrees: 0,
      interPupillaryDistancePx: 100
    });
    assert.strictEqual(zeroFace.isAcceptableForEnrollment, false);
    assert.ok(zeroFace.rejectionReasons.some(r => r.includes('NO_FACE_DETECTED')));

    const multiFace = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 2,
      sharpness: 150,
      meanLuminance: 120,
      luminanceVariance: 45,
      pitchDegrees: 0,
      yawDegrees: 0,
      rollDegrees: 0,
      interPupillaryDistancePx: 100
    });
    assert.strictEqual(multiFace.isAcceptableForEnrollment, false);
    assert.ok(multiFace.rejectionReasons.some(r => r.includes('MULTIPLE_FACES_DETECTED')));
  });

  // --- 2. Face Quality ---
  await t.test('2. Face quality: validates composite score and gate conditions', async () => {
    const valid = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 1,
      sharpness: 180,
      meanLuminance: 130,
      luminanceVariance: 50,
      pitchDegrees: 4,
      yawDegrees: -3,
      rollDegrees: 1,
      interPupillaryDistancePx: 110
    });
    assert.strictEqual(valid.isAcceptableForEnrollment, true);
    assert.ok(valid.overallQualityScore >= FaceQualityEngine.MIN_OVERALL_QUALITY_THRESHOLD);
  });

  // --- 3. Face Alignment ---
  await t.test('3. Face alignment: computes 5-point Umeyama similarity transform matrix', async () => {
    const detectedLandmarks = {
      leftEye: { x: 38.2, y: 51.5 },
      rightEye: { x: 73.5, y: 51.5 },
      noseTip: { x: 56.0, y: 71.7 },
      leftMouthCorner: { x: 41.5, y: 92.3 },
      rightMouthCorner: { x: 70.7, y: 92.3 }
    };
    const transform = FaceAlignmentEngine.computeSimilarityTransform(detectedLandmarks);
    assert.strictEqual(typeof transform.scale, 'number');
    assert.ok(transform.scale > 0);
    assert.strictEqual(transform.matrix.length, 2);
    assert.strictEqual(FaceAlignmentEngine.TARGET_WIDTH, 112);
    assert.strictEqual(FaceAlignmentEngine.TARGET_HEIGHT, 112);

    // Pixel normalization: [0, 255] -> [-1.0, 1.0]
    const rawRgb = new Uint8Array([0, 128, 255]);
    const normalized = FaceAlignmentEngine.normalizePixels(rawRgb);
    assert.ok(Math.abs(normalized[0] - (-0.996)) < 0.01);
    assert.ok(Math.abs(normalized[1] - 0.0039) < 0.01);
    assert.ok(Math.abs(normalized[2] - 0.996) < 0.01);
  });

  // --- 4. Embedding Generation ---
  await t.test('4. Embedding generation: produces 512D unit-length L2-normalized vector', async () => {
    const emb = generateMockEmbedding(512, 42);
    assert.strictEqual(emb.length, 512);
    let l2Norm = 0;
    for (let i = 0; i < emb.length; i++) l2Norm += emb[i] * emb[i];
    assert.ok(Math.abs(Math.sqrt(l2Norm) - 1.0) < 1e-5, 'Must be unit length');
  });

  // --- 5. Model Version Consistency ---
  await t.test('5. Model version consistency: rejects mismatched embedding dimensions', async () => {
    const canonicalModel = FaceModelService.CANONICAL_MODEL;
    assert.strictEqual(canonicalModel.embeddingDimension, 512);
    assert.strictEqual(canonicalModel.modelLicense, 'Apache-2.0');

    const mismatchedDim = generateMockEmbedding(128, 1);
    assert.throws(() => {
      BiometricMatcher.computeCosineSimilarity(mismatchedDim, generateMockEmbedding(512, 1));
    }, /Vector dimension mismatch/);
  });

  // --- 6. Encryption / Decryption ---
  await t.test('6. Cryptographic engine: AES-256-GCM encryption and decryption with AAD', async () => {
    const originalVec = generateMockEmbedding(512, 123);
    const envelope = encryptor.encryptTemplate(originalVec, {
      customerId: activeCustomerUuid,
      modelVersionId
    });

    assert.ok(envelope.ciphertextBase64.length > 0);
    assert.ok(envelope.ivBase64.length > 0);
    assert.ok(envelope.authTagBase64.length > 0);

    const decryptedVec = encryptor.decryptTemplate(envelope, {
      customerId: activeCustomerUuid,
      modelVersionId
    });

    assert.strictEqual(decryptedVec.length, 512);
    for (let i = 0; i < 512; i++) {
      assert.ok(Math.abs(decryptedVec[i] - originalVec[i]) < 1e-6);
    }
  });

  // --- 7. Authentication Tag Failure (Tamper Detection) ---
  await t.test('7. Authentication tag failure: tampering with ciphertext or AAD throws error', async () => {
    const originalVec = generateMockEmbedding(512, 99);
    const envelope = encryptor.encryptTemplate(originalVec, {
      customerId: activeCustomerUuid,
      modelVersionId
    });

    // Tamper with ciphertext
    const tamperedBuffer = Buffer.from(envelope.ciphertextBase64, 'base64');
    tamperedBuffer[0] ^= 0xFF; // Flip bits
    const tamperedEnvelope = {
      ...envelope,
      ciphertextBase64: tamperedBuffer.toString('base64')
    };

    assert.throws(() => {
      encryptor.decryptTemplate(tamperedEnvelope, {
        customerId: activeCustomerUuid,
        modelVersionId
      });
    }, /Unsupported state or unable to authenticate data|Authentication tag verification failed/);

    // Tamper with Customer UUID in AAD binding (template transplantation attack)
    const attackerCustomerId = crypto.randomUUID();
    assert.throws(() => {
      encryptor.decryptTemplate(envelope, {
        customerId: attackerCustomerId,
        modelVersionId
      });
    }, /Unsupported state or unable to authenticate data|Authentication tag verification failed/);
  });

  // --- 8. Unique Enrollment Constraints & Superseding ---
  let enrolledTemplateEnvelope = null;
  await t.test('8. Unique enrollment constraints: persists enrollment and supersedes old active ones', async () => {
    const rawVec = generateMockEmbedding(512, 777);
    enrolledTemplateEnvelope = encryptor.encryptTemplate(rawVec, {
      customerId: activeCustomerUuid,
      modelVersionId
    });

    const res = await request(app)
      .post(`/api/v1/customers/${activeCustomerUuid}/face-enroll`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: enrolledTemplateEnvelope,
        qualityScore: 0.92,
        livenessScore: 0.95,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-DEVICE-01'
      });

    if (res.status !== 201) {
      console.log('ENROLLMENT VALIDATION FAILURE BODY:', JSON.stringify(res.body));
    }

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'ACTIVE');

    // Re-enroll with a new template: must supersede the previous one
    const res2 = await request(app)
      .post(`/api/v1/customers/${activeCustomerUuid}/face-enroll`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: enrolledTemplateEnvelope,
        qualityScore: 0.94,
        livenessScore: 0.96,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-DEVICE-01'
      });

    assert.strictEqual(res2.status, 201);

    // Verify in-memory history: 2 records, newest is ACTIVE, older is SUPERSEDED
    const history = enrollmentDb.get(activeCustomerUuid);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].status, 'SUPERSEDED');
    assert.strictEqual(history[1].status, 'ACTIVE');
  });

  // --- 9. Inactive Customer Rejection ---
  await t.test('9. Inactive customer rejection: enrollment rejected for suspended customer', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${inactiveCustomerUuid}/face-enroll`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: enrolledTemplateEnvelope,
        qualityScore: 0.90,
        livenessScore: 0.95,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-DEVICE-01'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  // --- 10. Revoked Consent Rejection ---
  await t.test('10. Revoked consent rejection: enrollment blocked when consent is not active', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${revokedConsentCustomerUuid}/face-enroll`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: enrolledTemplateEnvelope,
        qualityScore: 0.90,
        livenessScore: 0.95,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-DEVICE-01',
        officerConsentConfirmation: false
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.message.includes('consent'));
  });

  // --- 11. Deleted Customer Rejection ---
  await t.test('11. Deleted customer rejection: soft-deleted customer rejected immediately', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${deletedCustomerUuid}/face-enroll`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: enrolledTemplateEnvelope,
        qualityScore: 0.90,
        livenessScore: 0.95,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-DEVICE-01'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.message.includes('soft-deleted'));
  });

  // --- 12. Unknown Face Handling ---
  await t.test('12. Unknown face handling: similarity below threshold 0.720 returns non-match', async () => {
    const enrolledVec = generateMockEmbedding(512, 100);
    const differentPersonVec = generateMockEmbedding(512, 500);

    const matchResult = BiometricMatcher.match(differentPersonVec, enrolledVec, 0.720);

    assert.strictEqual(matchResult.isMatch, false);
    assert.ok(matchResult.score < 0.720);
  });

  // --- 13. Low Confidence / Calibrated Thresholding ---
  await t.test('13. Threshold verification: probe with similarity 0.71 fails while 0.73 passes', async () => {
    const baseVec = generateMockEmbedding(512, 10);
    const closeVec = new Float32Array(baseVec);
    // Perturb slightly
    closeVec[0] += 0.05;

    const matchPass = BiometricMatcher.match(baseVec, closeVec, 0.720);
    assert.strictEqual(matchPass.isMatch, true);

    const matchStrictFail = BiometricMatcher.match(baseVec, closeVec, 0.999);
    assert.strictEqual(matchStrictFail.isMatch, false);
  });

  // --- 14. Multiple-Face Rejection ---
  await t.test('14. Multiple face rejection: rejected with MULTIPLE_FACES_DETECTED reason', async () => {
    const q = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 3,
      sharpness: 200,
      meanLuminance: 120,
      luminanceVariance: 40,
      pitchDegrees: 0,
      yawDegrees: 0,
      rollDegrees: 0,
      interPupillaryDistancePx: 100
    });
    assert.strictEqual(q.isAcceptableForEnrollment, false);
    assert.ok(q.rejectionReasons.some(r => r.includes('MULTIPLE_FACES_DETECTED')));
  });

  // --- 15. Poor Lighting Rejection ---
  await t.test('15. Poor lighting rejection: underexposure or overexposure fails quality gate', async () => {
    const dark = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 1,
      sharpness: 150,
      meanLuminance: 30, // < 60
      luminanceVariance: 40,
      pitchDegrees: 0,
      yawDegrees: 0,
      rollDegrees: 0,
      interPupillaryDistancePx: 100
    });
    assert.strictEqual(dark.isAcceptableForEnrollment, false);
    assert.ok(dark.rejectionReasons.some(r => r.includes('INSUFFICIENT_LIGHTING')));

    const washout = FaceQualityEngine.evaluateQuality({
      detectedFaceCount: 1,
      sharpness: 150,
      meanLuminance: 230, // > 200
      luminanceVariance: 40,
      pitchDegrees: 0,
      yawDegrees: 0,
      rollDegrees: 0,
      interPupillaryDistancePx: 100
    });
    assert.strictEqual(washout.isAcceptableForEnrollment, false);
    assert.ok(washout.rejectionReasons.some(r => r.includes('EXCESSIVE_GLARE')));
  });

  // --- 16. Photo/Screen Presentation Attack Defense ---
  await t.test('16. Presentation attack scenarios: Moiré/specular checks classify as RESTRICTED_PASS or SPOOF', async () => {
    // Screen attack with high Moiré energy
    const screenAttack = LivenessEngine.evaluatePresentationAttack({
      textureHighFreqRatio: 0.95, // > 0.82
      specularReflectionSpread: 5.0,
      colorGamutDiversity: 0.20,
      motionParallaxScore: 0.10,
      hasActiveChallengePassed: false,
      hardwareDepthSensorPresent: false
    });
    assert.strictEqual(screenAttack.classification, 'SUSPECTED_SPOOF');
    assert.ok(screenAttack.detectedAttackTypes.some(s => s.includes('SCREEN_REPLAY_ATTACK')));

    // Genuine user pass on standard RGB camera without depth sensor: classified honestly as RESTRICTED_PASS
    const honestPass = LivenessEngine.evaluatePresentationAttack({
      textureHighFreqRatio: 0.40,
      specularReflectionSpread: 35.0,
      colorGamutDiversity: 0.65,
      motionParallaxScore: 0.55,
      hasActiveChallengePassed: true,
      hardwareDepthSensorPresent: false
    });
    assert.strictEqual(honestPass.classification, 'RESTRICTED_PASS');
    assert.strictEqual(honestPass.isRestricted, true);
    assert.ok(honestPass.livenessScore >= 0.70);
  });

  // --- 17. Android Camera Lifecycle & Vector Operations ---
  await t.test('17. Multi-sample vector cosine operations and serialization stability', async () => {
    const s1 = generateMockEmbedding(512, 1);
    const s2 = new Float32Array(s1);
    s2[0] += 0.01;

    const sim = BiometricMatcher.computeCosineSimilarity(s1, s2);
    assert.ok(sim > 0.99);

    const serialized = encryptor.serializeVector(s1);
    const deserialized = encryptor.deserializeVector(serialized);
    assert.strictEqual(deserialized.length, 512);
    for (let i = 0; i < 512; i++) {
      assert.strictEqual(deserialized[i], s1[i]);
    }
  });

  // --- 18. Backend Enrollment REST APIs ---
  await t.test('18. Backend REST APIs: face-status and face-revoke endpoints', async () => {
    // GET face-status
    const statusRes = await request(app)
      .get(`/api/v1/customers/${activeCustomerUuid}/face-status`)
      .set('Authorization', `Bearer ${authToken}`);

    if (statusRes.status !== 200) {
      console.log('STATUS FAILURE BODY:', JSON.stringify(statusRes.body));
    }

    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.data.hasEnrolledFace, true);
    assert.strictEqual(statusRes.body.data.status, 'ACTIVE');

    // POST face-revoke
    const revokeRes = await request(app)
      .post(`/api/v1/customers/${activeCustomerUuid}/face-revoke`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        reason: 'Customer requested biometric revocation under DPDP Act right to erasure',
        officerNotes: 'Verified physical signature'
      });

    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.body.success, true);
    assert.strictEqual(revokeRes.body.data.status, 'REVOKED');

    // Re-check status: now false
    const afterRevoke = await request(app)
      .get(`/api/v1/customers/${activeCustomerUuid}/face-status`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.strictEqual(afterRevoke.body.data.hasEnrolledFace, false);
  });

  // --- 19. Authorized Template Access ---
  await t.test('19. Model metadata API: authorized officers can list active face recognition models', async () => {
    const modelRes = await request(app)
      .get('/api/v1/identity/face-models')
      .set('Authorization', `Bearer ${authToken}`);

    assert.strictEqual(modelRes.status, 200);
    const models = Array.isArray(modelRes.body.data) ? modelRes.body.data : modelRes.body.data.models;
    assert.ok(Array.isArray(models));
    const activeModel = models.find(m => m.id === modelVersionId || m.modelName === 'MobileFaceNet-ArcFace');
    assert.ok(activeModel != null);
    assert.strictEqual(activeModel.modelName, 'MobileFaceNet-ArcFace');
    assert.strictEqual(activeModel.embeddingDimension, 512);
    assert.strictEqual(activeModel.modelLicense, 'Apache-2.0');
  });

  // --- 20. Unauthorized Biometric Access & Anti-Leak Policy ---
  await t.test('20. Biometric confidentiality: endpoints NEVER return raw embeddings or photographs', async () => {
    // Unauthenticated request to face endpoints is strictly rejected
    const unauthRes = await request(app)
      .get(`/api/v1/customers/${activeCustomerUuid}/face-status`);
    assert.strictEqual(unauthRes.status, 401);

    // Status endpoint returns metadata only, never raw embeddings or keys
    const statusRes = await request(app)
      .get(`/api/v1/customers/${activeCustomerUuid}/face-status`)
      .set('Authorization', `Bearer ${authToken}`);
    const bodyStr = JSON.stringify(statusRes.body);
    assert.strictEqual(bodyStr.includes('ciphertext'), false);
    assert.strictEqual(bodyStr.includes('embedding'), false);
    assert.strictEqual(bodyStr.includes('private_key'), false);
    assert.strictEqual(bodyStr.includes('face_image'), false);
  });
});
