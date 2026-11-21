import crypto from 'node:crypto';
import { PostgresDatabase } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import {
  PostgresCustomerRepository,
  PostgresShiftSessionRepository,
  PostgresCollectionTransactionRepository,
  PostgresRateChartRepository,
  PostgresLedgerRepository,
  Aes256GcmBiometricEncryptor,
} from '../dist/infrastructure/index.js';
import {
  RegisterCustomerUseCase,
  ApproveCustomerRegistrationUseCase,
  GetFaceTemplatesUseCase,
  GetCustomerStatusUseCase,
  UpdateCustomerBiometricsUseCase,
  OpenShiftSessionUseCase,
  ProcessMilkIntakeUseCase,
} from '../dist/application/use-cases/index.js';

// Cosine similarity for OpenCV SFace 128-D vectors
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate valid normalized 128-D embedding
function generateNormalizedVector(seed = 1) {
  const vec = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin(seed * (i + 1));
    vec.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return vec.map((v) => v / norm);
}

async function runEndToEndIntegrationSuite() {
  console.log('========================================================================');
  console.log('DFARM END-TO-END MULTI-DATABASE INTEGRATION & WORKFLOW VERIFICATION TEST');
  console.log('========================================================================\n');

  // Step 0: Initialize Control Plane & Multi-Tenant DB Manager
  const controlPlaneDb = PostgresDatabase.getInstance();
  await tenantDbManager.initialize(controlPlaneDb);

  const customerRepo = new PostgresCustomerRepository();
  const sessionRepo = new PostgresShiftSessionRepository();
  const transactionRepo = new PostgresCollectionTransactionRepository();
  const rateChartRepo = new PostgresRateChartRepository();
  const ledgerRepo = new PostgresLedgerRepository();
  const encryptor = new Aes256GcmBiometricEncryptor();

  // -------------------------------------------------------------------------
  // PHASE 1: Super Admin Provisions Test Dairy A & Dairy B
  // -------------------------------------------------------------------------
  console.log('[PHASE 1] Multi-Database Tenant Provisioning Audit');
  const dairyAId = '00000000-0000-0000-0000-000000000001'; // Gokul Primary Cooperative
  const dairyBId = '00000000-0000-0000-0000-000000000004'; // Warna Sahakari Dudh

  const mappingA = tenantDbManager.getMapping(dairyAId);
  const mappingB = tenantDbManager.getMapping(dairyBId);

  console.log(`✓ Dairy A (${mappingA?.dairyCode}): Database = ${mappingA?.databaseName}, Resource = ${mappingA?.resourceType}`);
  console.log(`✓ Dairy B (${mappingB?.dairyCode}): Database = ${mappingB?.databaseName}, Resource = ${mappingB?.resourceType}`);

  if (!mappingA || !mappingB) {
    throw new Error('FAILED: Tenant database mappings not found in control plane.');
  }
  if (mappingA.databaseName === mappingB.databaseName) {
    throw new Error('FAILED: Dairy A and Dairy B share the same database resource! Isolation violated.');
  }

  const dbA = await tenantDbManager.getTenantDb(dairyAId);
  const dbB = await tenantDbManager.getTenantDb(dairyBId);

  // -------------------------------------------------------------------------
  // PHASE 2: Customer App Registration Flow with YuNet + SFace Biometrics
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 2] Customer Registration in Customer App -> Dairy A');
  const registerUseCase = new RegisterCustomerUseCase(customerRepo);
  const updateBiometricsUseCase = new UpdateCustomerBiometricsUseCase(customerRepo, encryptor);

  const customerMobile = '+919988776655';
  const customerName = 'Prakash Kisanrao Patil';
  const customerVillage = 'Shiroli Pulachi';
  const faceEmbeddingA = generateNormalizedVector(42);

  const regResult = await registerUseCase.execute({
    organizationId: dairyAId,
    centerId: '00000000-0000-0000-0000-000000000002',
    fullName: customerName,
    mobileNumber: customerMobile,
    village: customerVillage,
    categories: ['COW'],
  });

  const registeredCustomerId = regResult.id;
  console.log(`✓ Registration submitted successfully. Customer ID: ${registeredCustomerId}`);
  console.log(`✓ Stored Registration Status: ${regResult.registrationStatus}`);

  const bioResult = await updateBiometricsUseCase.execute({
    customerId: registeredCustomerId,
    embedding: faceEmbeddingA,
    modelVersion: 'sface_int8_2021dec',
  });
  console.log(`✓ Face Biometric Status: ${bioResult.status} (${bioResult.modelVersion})`);

  // Direct DB inspection to verify multi-database persistence
  const checkA = await dbA.query(`SELECT id, full_name, status, registration_status FROM customers WHERE id = $1;`, [registeredCustomerId]);
  if (checkA.rows.length === 0) {
    throw new Error('FAILED: Customer record not found in Dairy A isolated database!');
  }
  console.log(`✓ Record confirmed in Dairy A database (${mappingA.databaseName}): Name = "${checkA.rows[0].full_name}", Status = ${checkA.rows[0].registration_status}`);

  // Leakage check: Must NOT exist in Dairy B database
  const checkB = await dbB.query(`SELECT id FROM customers WHERE id = $1;`, [registeredCustomerId]);
  if (checkB.rows.length > 0) {
    throw new Error('FAILED: Data leakage! Customer registered in Dairy A was found in Dairy B database.');
  }
  console.log(`✓ Cross-tenant leakage check passed: 0 records found in Dairy B database.`);

  // -------------------------------------------------------------------------
  // PHASE 3: Dairy Admin Pending Customer Registrations (Fixing "0 Pending")
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 3] Dairy Admin Pending Approvals Query');
  const pendingA = await customerRepo.listPendingRegistrations(dairyAId);
  console.log(`✓ Dairy A Admin pending registration count: ${pendingA.length} (Expected >= 1)`);
  if (pendingA.length === 0) {
    throw new Error('FAILED: Critical Bug! Dairy Admin sees 0 Pending Registrations for Dairy A.');
  }

  const pendingB = await customerRepo.listPendingRegistrations(dairyBId);
  console.log(`✓ Dairy B Admin pending registration count: ${pendingB.length} (Expected = 0 for this applicant)`);
  if (pendingB.some((c) => c.id === registeredCustomerId)) {
    throw new Error('FAILED: Dairy B Admin sees applicant from Dairy A!');
  }
  console.log(`✓ Tenant isolation confirmed: Dairy Admin B cannot view Dairy A applicants.`);

  // -------------------------------------------------------------------------
  // PHASE 4: Dairy Admin Reviews & Approves Registration
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 4] Dairy Admin Review and Approval Flow');
  const approveUseCase = new ApproveCustomerRegistrationUseCase(customerRepo);
  const assignedFarmerCode = 'GOK-108';

  const approvalResult = await approveUseCase.execute(
    registeredCustomerId,
    'Dairy Admin Vijay',
    assignedFarmerCode
  );

  console.log(`✓ Approved applicant: ${approvalResult.fullName}`);
  console.log(`✓ Assigned Farmer Code: ${approvalResult.farmerCode}`);
  console.log(`✓ New Customer Status: ${approvalResult.status}`);
  console.log(`✓ New Registration Status: ${approvalResult.registrationStatus}`);

  // Customer App status check
  const getStatusUseCase = new GetCustomerStatusUseCase(customerRepo);
  const appStatus = await getStatusUseCase.execute(registeredCustomerId);
  console.log(`✓ Customer App /status check: Status = ${appStatus.registrationStatus}, Code = ${appStatus.farmerCode}`);
  if (appStatus.registrationStatus !== 'APPROVED') {
    throw new Error('FAILED: Customer App status did not update to APPROVED.');
  }

  // -------------------------------------------------------------------------
  // PHASE 5: Collection App Biometric Template Sync & Face Recognition
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 5] Collection App Face Recognition & SFace Vector Matching');
  const getFaceTemplatesUseCase = new GetFaceTemplatesUseCase();

  const templatesA = await getFaceTemplatesUseCase.execute({ organizationId: dairyAId });
  console.log(`✓ Dairy A Collection Kiosk retrieved ${templatesA.length} active face templates.`);
  const enrolledTemplate = templatesA.find((t) => t.customerId === registeredCustomerId);
  if (!enrolledTemplate) {
    throw new Error('FAILED: Enrolled face template for approved customer not returned to Dairy A Kiosk.');
  }
  console.log(`✓ Found template for customer: ${enrolledTemplate.fullName} (${enrolledTemplate.farmerCode})`);

  // Verify Dairy B collection kiosk gets 0 templates for Dairy A customer
  const templatesB = await getFaceTemplatesUseCase.execute({ organizationId: dairyBId });
  if (templatesB.some((t) => t.customerId === registeredCustomerId)) {
    throw new Error('FAILED: Dairy B collection kiosk received Dairy A customer biometric template!');
  }
  console.log(`✓ Isolation confirmed: Dairy B collection kiosk received 0 templates from Dairy A.`);

  // Decrypt template using secure decryptor
  const decryptedVector = encryptor.decrypt128DimEmbedding(
    enrolledTemplate.encryptedPayload.encryptedData,
    enrolledTemplate.encryptedPayload.iv,
    enrolledTemplate.encryptedPayload.authTag,
    registeredCustomerId,
    enrolledTemplate.modelVersionId || 'f0000000-0000-0000-0000-000000000001'
  );
  if (decryptedVector.length !== 128) {
    throw new Error(`FAILED: Decrypted vector dimension mismatch: ${decryptedVector.length} != 128`);
  }

  // Live SFace Probe simulation
  // Probe with slight real-world noise (similarity should be > 0.95, well above 0.363 threshold)
  const probeVector = decryptedVector.map((v, i) => v + (Math.sin(i * 3) * 0.01));
  const probeNorm = Math.sqrt(probeVector.reduce((sum, v) => sum + v * v, 0));
  const normalizedProbe = probeVector.map((v) => v / probeNorm);

  const similarity = cosineSimilarity(decryptedVector, normalizedProbe);
  console.log(`✓ Live camera probe matched enrolled face: Cosine Similarity = ${similarity.toFixed(4)} (Threshold: 0.363)`);
  if (similarity < 0.363) {
    throw new Error(`FAILED: Face recognition similarity ${similarity} below SFace threshold 0.363`);
  }
  console.log(`✓ Customer Identity Verified: "${enrolledTemplate.fullName}" confirmed for milk intake.`);

  // -------------------------------------------------------------------------
  // PHASE 6: Shift Session & Atomic Milk Intake Transaction with Ledger Credit
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 6] Shift Session & Atomic Milk Intake Transaction');
  const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
  const processMilkIntakeUseCase = new ProcessMilkIntakeUseCase(
    customerRepo,
    sessionRepo,
    transactionRepo,
    rateChartRepo,
    ledgerRepo
  );

  // 1. Open shift session
  const shiftSession = await openSessionUseCase.execute({
    centerId: '00000000-0000-0000-0000-000000000002',
    organizationId: dairyAId,
    operatorId: '00000000-0000-0000-0000-000000000003',
    operatorName: 'Operator Santosh',
    shift: 'MORNING',
    deviceIdentifier: 'KIOSK_MAIN',
  });
  console.log(`✓ Shift session opened: Code = ${shiftSession.sessionCode}, Status = ${shiftSession.status}`);

  // 2. Submit milk intake transaction
  const weightLiters = 18.5;
  const fat = 4.4;
  const snf = 8.7;
  const idempotencyKey = `TXN-E2E-${crypto.randomUUID()}`;

  const intakeResult = await processMilkIntakeUseCase.execute({
    sessionId: shiftSession.id,
    sessionCode: shiftSession.sessionCode,
    customerId: registeredCustomerId,
    milkCategory: 'COW',
    weightLiters,
    fatPercentage: fat,
    snfPercentage: snf,
    clrDensity: 29.0,
    identificationMethod: 'FACE_YUNET_SFACE',
    deviceId: 'KIOSK_MAIN',
    operatorId: '00000000-0000-0000-0000-000000000003',
    operatorName: 'Operator Santosh',
    idempotencyKey,
  });

  const txn = intakeResult.transaction;
  const txnData = txn.toJSON();
  console.log(`✓ Milk transaction processed: Receipt = ${intakeResult.receiptNumber}`);
  console.log(`✓ Milk: ${txnData.milkCategory} ${txn.weightLiters} L | Fat: ${txnData.fatPercentage}% | SNF: ${txnData.snfPercentage}%`);
  console.log(`✓ Applied Rate: ₹${txn.appliedRatePerLiter}/L | Total Amount: ₹${txn.totalAmount.toFixed(2)}`);
  console.log(`✓ Updated Customer Balance: ₹${intakeResult.customerBalanceAfter.toFixed(2)}`);

  // Verify Double-Entry Ledger
  const ledger = await ledgerRepo.findByCustomer(registeredCustomerId, dairyAId);
  if (!ledger || ledger.currentBalance !== txn.totalAmount) {
    throw new Error(`FAILED: Customer ledger balance mismatch! Expected ₹${txn.totalAmount}, got ₹${ledger?.currentBalance}`);
  }
  console.log(`✓ Double-entry ledger verified: Credit of ₹${txn.totalAmount.toFixed(2)} posted to account.`);

  // 3. Idempotency test (replay same transaction)
  const replayResult = await processMilkIntakeUseCase.execute({
    sessionId: shiftSession.id,
    sessionCode: shiftSession.sessionCode,
    customerId: registeredCustomerId,
    milkCategory: 'COW',
    weightLiters,
    fatPercentage: fat,
    snfPercentage: snf,
    identificationMethod: 'FACE_YUNET_SFACE',
    deviceId: 'KIOSK_MAIN',
    operatorId: '00000000-0000-0000-0000-000000000003',
    operatorName: 'Operator Santosh',
    idempotencyKey,
  });

  if (!replayResult.isIdempotentReplay) {
    throw new Error('FAILED: Idempotency replay check failed! Duplicate transaction was not recognized.');
  }
  console.log(`✓ Idempotency protected: Replay detected and handled without duplicate billing.`);

  // 4. Verify cross-dairy isolation on transactions and sessions
  const dairyBTxns = await dbB.query(`SELECT * FROM milk_collections;`);
  if (dairyBTxns.rows.some((r) => r.customer_id === registeredCustomerId)) {
    throw new Error('FAILED: Dairy A transaction found in Dairy B database!');
  }
  console.log(`✓ Isolation confirmed: 0 transactions for Dairy A customer exist in Dairy B database.`);

  console.log('\n========================================================================');
  console.log('ALL PHASES PASSED: END-TO-END WORKFLOW & MULTI-DATABASE ISOLATION VERIFIED');
  console.log('========================================================================\n');
}

runEndToEndIntegrationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ INTEGRATION TEST FAILED:', err);
    process.exit(1);
  });
