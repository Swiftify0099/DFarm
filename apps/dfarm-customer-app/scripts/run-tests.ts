/**
 * DFarm Test Runner & Verification Engine
 * Executes all Unit, Integration, Biometric and Contract Tests
 */

import assert from 'node:assert';
import { DFARM_COLORS, DFARM_SHADOWS } from '../src/design-system/theme.ts';
import { RequestOtpSchema, VerifyOtpSchema } from '../src/types/auth.ts';
import { CustomerRegistrationSchema } from '../src/types/customer.ts';
import { MilkCollectionRecordSchema } from '../src/types/collection.ts';
import { CustomerLedgerEntrySchema } from '../src/types/ledger.ts';
import { BillStatementSchema } from '../src/types/bills.ts';
import { DairySchema } from '../src/types/dairy.ts';
import {
  normalizeL2,
  isFiniteEmbedding,
  computeCosineSimilarity,
  checkAlignmentQuality,
} from '../src/face-ai/preprocessor.ts';
import { FACE_MODEL_MANIFEST } from '../src/face-ai/manifest.ts';
import { yuNetDetector } from '../src/face-ai/yunet-detector.ts';
import { sFaceEmbedder } from '../src/face-ai/sface-embedder.ts';
import { runFaceDiagnostics } from '../src/face-ai/diagnostics.ts';

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

async function itAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('\n--- DFARM TEST SUITE EXECUTION ---\n');

console.log('1. Claymorphism Theme & Approved Palette Tokens:');
it('Primary palette strictly matches brand requirements', () => {
  assert.strictEqual(DFARM_COLORS.primaryCream, '#FFF5EE');
  assert.strictEqual(DFARM_COLORS.primaryOrange, '#FF6A00');
  assert.strictEqual(DFARM_COLORS.secondaryOrange, '#F58A38');
  assert.strictEqual(DFARM_COLORS.peach, '#FFE9DC');
  assert.strictEqual(DFARM_COLORS.primaryText, '#211B18');
  assert.strictEqual(DFARM_COLORS.secondaryText, '#817A75');
  assert.strictEqual(DFARM_COLORS.border, '#F1E7E0');
});

it('Clay shadows define elevation and soft ambient glows', () => {
  assert.strictEqual(DFARM_SHADOWS.clayCard.elevation, 5);
  assert.strictEqual(DFARM_SHADOWS.clayCard.shadowColor, '#F58A38');
  assert.strictEqual(DFARM_SHADOWS.clayButton.elevation, 6);
});

console.log('\n2. Strict Zod Schemas & Validation:');
it('Validates 10-digit Indian phone numbers', () => {
  assert.strictEqual(RequestOtpSchema.safeParse({ mobileNumber: '9822012345' }).success, true);
  assert.strictEqual(RequestOtpSchema.safeParse({ mobileNumber: '12345' }).success, false);
  assert.strictEqual(RequestOtpSchema.safeParse({ mobileNumber: '5822012345' }).success, false);
});

it('Validates 6-digit OTP verification', () => {
  assert.strictEqual(VerifyOtpSchema.safeParse({ mobileNumber: '9822012345', otp: '123456' }).success, true);
  assert.strictEqual(VerifyOtpSchema.safeParse({ mobileNumber: '9822012345', otp: '12' }).success, false);
});

it('Enforces 128-D embedding and mandatory consent for registration', () => {
  const valid128Embedding = new Array(128).fill(0.088);
  const validReg = {
    selectedDairyId: '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10',
    fullName: 'Vitthal Patil',
    village: 'Manchar',
    milkSupplyType: 'COW' as const,
    biometricConsent: true,
    faceTemplate: {
      modelVersion: 'sface_int8_2021dec' as const,
      embedding: valid128Embedding,
      confidence: 0.95,
    },
  };
  assert.strictEqual(CustomerRegistrationSchema.safeParse(validReg).success, true);

  // Rejects when consent is false
  assert.strictEqual(
    CustomerRegistrationSchema.safeParse({ ...validReg, biometricConsent: false }).success,
    false
  );

  // Rejects invalid embedding dimensions
  assert.strictEqual(
    CustomerRegistrationSchema.safeParse({
      ...validReg,
      faceTemplate: { ...validReg.faceTemplate, embedding: [0.1, 0.2] },
    }).success,
    false
  );
});

it('Validates milk collection record parameters', () => {
  const record = {
    id: '1c01e92a-7140-4bc2-8a90-34901f440a01',
    receiptNumber: 'COL-2026-11-15-M01',
    shift: 'MORNING' as const,
    collectionDate: '2026-11-15',
    collectionTime: '06:45',
    animalType: 'COW' as const,
    quantityLiters: 14.5,
    fatPercentage: 4.2,
    snfPercentage: 8.6,
    ratePerLiter: 38.5,
    totalAmount: 558.25,
    operatorName: 'Sanjay Shinde',
    operatorId: 'OP-401',
    verifiedBiometrically: true,
  };
  assert.strictEqual(MilkCollectionRecordSchema.safeParse(record).success, true);
});

it('Validates ledger entry schema', () => {
  const entry = {
    id: 'l1-01',
    transactionDate: '2026-11-15T06:45:00Z',
    type: 'MILK_CREDIT' as const,
    description: 'Morning Shift Milk Credit',
    creditAmount: 558.25,
    debitAmount: 0,
    runningBalance: 12480.0,
    referenceId: 'COL-2026-11-15-M01',
  };
  assert.strictEqual(CustomerLedgerEntrySchema.safeParse(entry).success, true);
});

console.log('\n3. SFace INT8 Preprocessing & L2 Normalization:');
it('L2 unit norm strictly equals 1.0 (||v||_2 = 1.0)', () => {
  const rawVector = new Array(128).fill(0).map((_, i) => (i + 1) * 0.1);
  const normalized = normalizeL2(rawVector);
  assert.strictEqual(normalized.length, 128);
  const sumSquares = normalized.reduce((acc, v) => acc + v * v, 0);
  assert.ok(Math.abs(sumSquares - 1.0) < 0.0001);
});

it('Rejects non-finite numbers (NaN or Infinity)', () => {
  const valid = new Array(128).fill(0.1);
  assert.strictEqual(isFiniteEmbedding(valid), true);

  const withNaN = [...valid];
  withNaN[5] = NaN;
  assert.strictEqual(isFiniteEmbedding(withNaN), false);

  const withInf = [...valid];
  withInf[10] = Infinity;
  assert.strictEqual(isFiniteEmbedding(withInf), false);
});

it('Cosine similarity of identical vectors is 1.0', () => {
  const vec = normalizeL2(new Array(128).fill(1));
  const sim = computeCosineSimilarity(vec, vec);
  assert.ok(Math.abs(sim - 1.0) < 0.0001);
});

it('Evaluates facial landmark alignment correctly', () => {
  const aligned = {
    rightEye: { x: 100, y: 120 },
    leftEye: { x: 200, y: 120 },
    noseTip: { x: 150, y: 160 },
    rightMouthCorner: { x: 110, y: 200 },
    leftMouthCorner: { x: 190, y: 200 },
  };
  assert.strictEqual(checkAlignmentQuality(aligned).isAligned, true);

  const tilted = {
    rightEye: { x: 100, y: 100 },
    leftEye: { x: 200, y: 160 }, // tilted
    noseTip: { x: 150, y: 160 },
    rightMouthCorner: { x: 110, y: 200 },
    leftMouthCorner: { x: 190, y: 200 },
  };
  assert.strictEqual(checkAlignmentQuality(tilted).isAligned, false);
});

console.log('\n4. Face AI Models & Diagnostics Pipeline:');
it('Confirms YuNet & SFace INT8 fixed model manifest', () => {
  assert.strictEqual(FACE_MODEL_MANIFEST.detector.filename, 'face_detection_yunet_2023mar.onnx');
  assert.strictEqual(FACE_MODEL_MANIFEST.recognizer.filename, 'face_recognition_sface_2021dec_int8.onnx');
  assert.strictEqual(FACE_MODEL_MANIFEST.recognizer.outputDimension, 128);
  assert.strictEqual(FACE_MODEL_MANIFEST.recognizer.quantization, 'INT8');
});

await itAsync('Initializes YuNet and detects single centered face', async () => {
  const initialized = await yuNetDetector.initialize();
  assert.strictEqual(initialized, true);
  const res = await yuNetDetector.detectFaces();
  assert.strictEqual(res.faces.length, 1);
  assert.ok(res.faces[0].confidence > 0.6);
});

await itAsync('Generates 128-D normalized embedding with SFace embedder', async () => {
  const initialized = await sFaceEmbedder.initialize();
  assert.strictEqual(initialized, true);
  const landmarks = {
    rightEye: { x: 100, y: 120 },
    leftEye: { x: 220, y: 120 },
    noseTip: { x: 160, y: 170 },
    rightMouthCorner: { x: 110, y: 220 },
    leftMouthCorner: { x: 210, y: 220 },
  };
  const res = await sFaceEmbedder.generateEmbedding(landmarks);
  assert.strictEqual(res.embedding.length, 128);
  assert.strictEqual(res.isNormalized, true);
});

await itAsync('Executes full face diagnostics test suite ("Test My Face")', async () => {
  const report = await runFaceDiagnostics();
  assert.strictEqual(report.cameraPermissionGranted, true);
  assert.strictEqual(report.yuNetLoaded, true);
  assert.strictEqual(report.sFaceLoaded, true);
  assert.strictEqual(report.facesDetectedCount, 1);
  assert.strictEqual(report.embeddingValid128D, true);
  assert.strictEqual(report.status, 'OPTIMAL');
});

console.log('\n5. API Contracts & Tenant Isolation Schemas:');
it('Validates Dairy entity schema with distanceKm', () => {
  const dairy = {
    id: '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10',
    name: 'Shree Krishna Sahakari Dudh Utpadak Sanstha',
    registrationNumber: 'PNE/DAIRY/2018/8892',
    village: 'Manchar',
    district: 'Pune',
    state: 'Maharashtra',
    contactPhone: '+91 98220 12345',
    distanceKm: 1.2,
    isActive: true,
  };
  assert.strictEqual(DairySchema.safeParse(dairy).success, true);
});

it('Validates BillStatement schema', () => {
  const bill = {
    billId: '1c01e92a-7140-4bc2-8a90-34901f440a01',
    billNumber: 'DFB-2026-11-C1-042',
    cycleStartDate: '2026-11-01',
    cycleEndDate: '2026-11-10',
    cycleLabel: 'Cycle 31 (01 Nov - 10 Nov 2026)',
    totalLiters: 148.0,
    grossMilkAmount: 6240.0,
    feedDeductions: 1850.0,
    otherDeductions: 50.0,
    netPayableAmount: 4340.0,
    status: 'DISBURSED' as const,
  };
  assert.strictEqual(BillStatementSchema.safeParse(bill).success, true);
});

console.log(`\n========================================`);
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
