import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIdentificationService } from '../domain/identification/CustomerIdentificationService';
import { CollectionStateMachine } from '../domain/statemachine/CollectionStateMachine';
import { MeasurementValidationEngine } from '../domain/measurement/MeasurementValidationEngine';
import { RateCalculationEngine, RateChartVersion } from '../domain/pricing/RateCalculationEngine';
import { ReceiptFormatter } from '../domain/receipt/ReceiptFormatter';
import { UsbSerialWeightScaleService } from '../hardware/UsbSerialWeightScaleService';
import { SerialMilkAnalyzerService } from '../hardware/SerialMilkAnalyzerService';
import { BluetoothEscPosPrinterService } from '../hardware/BluetoothEscPosPrinterService';
import { Customer, CollectionReceipt, MilkQualityMeasurement, MilkWeightMeasurement } from '../types';

test('End-to-End Collection Lifecycle & Cross-App Integration Test Suite', async (t) => {
  const MOCK_CUSTOMER_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const MOCK_CENTER_UUID = 'c0000000-0000-0000-0000-000000000001';
  const MOCK_ORG_UUID = 'o0000000-0000-0000-0000-000000000001';
  const MOCK_SESSION_UUID = 's0000000-0000-0000-0000-000000000001';

  // 1. Cross-app Customer Schema Parity (as produced by Registration Expo)
  const registeredCustomer: Customer = {
    id: MOCK_CUSTOMER_UUID,
    organizationId: MOCK_ORG_UUID,
    primaryCenterId: MOCK_CENTER_UUID,
    farmerCode: 'FARM-E2E-101',
    fullName: 'Shrikant Shinde',
    mobileNumber: '+919876543210',
    status: 'ACTIVE',
    permittedCategories: ['COW', 'BUFFALO'],
    rfidCardId: '04A1B2C3D4E5F6',
  };

  await t.test('1. Customer Identification via Hardware RFID', async () => {
    const mockRepo = {
      findById: (id: string) => (id === registeredCustomer.id ? registeredCustomer : null),
      findByFarmerCode: (code: string) =>
        code === registeredCustomer.farmerCode ? registeredCustomer : null,
      findByRfid: (rfid: string) =>
        rfid === registeredCustomer.rfidCardId ? registeredCustomer : null,
      search: () => [registeredCustomer],
    };

    const idService = new CustomerIdentificationService(
      mockRepo,
      MOCK_CENTER_UUID,
      MOCK_ORG_UUID,
      72, // 72 hours max offline freshness
      Date.now()
    );

    const result = await idService.identifyByRfid('04A1B2C3D4E5F6');
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, MOCK_CUSTOMER_UUID);
      assert.equal(result.customer.fullName, 'Shrikant Shinde');
      assert.equal(result.method, 'RFID');
    }
  });

  await t.test('2. State Machine Transitions from Identification to Category Selection', () => {
    const sm = new CollectionStateMachine();
    assert.equal(sm.state, 'WAITING_FOR_CUSTOMER');

    // Customer identified
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: registeredCustomer });
    assert.equal(sm.state, 'CUSTOMER_IDENTIFIED');

    // Customer verified (Customer has both COW & BUFFALO, so should go to CATEGORY_PENDING)
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: registeredCustomer });
    assert.equal(sm.state, 'CATEGORY_PENDING');

    // Operator selects COW
    sm.transition({ type: 'CATEGORY_SELECTED', category: 'COW' });
    assert.equal(sm.state, 'CATEGORY_SELECTED');
    assert.equal(sm.selectedCategory, 'COW');
  });

  await t.test('3. Hardware Weighing Scale and Milk Analyzer Reading Capture', () => {
    // Essae scale continuous stream parse
    const scaleFrame = 'ST,GS,+0020.50kg\r\n';
    const scaleResult = UsbSerialWeightScaleService.parseSerialFrame(scaleFrame);
    assert.equal(scaleResult.isValid, true);
    assert.equal(scaleResult.isStable, true);
    assert.equal(scaleResult.weightKg, 20.5);
    assert.equal(scaleResult.unit, 'KG');

    // Lactoscan ultrasonic analyzer stream parse
    const analyzerFrame = 'FAT=04.20 SNF=08.60 CLR=28.5 ADD_WATER=00.00 TEMP=25.0 C\r\n';
    const analyzerResult = SerialMilkAnalyzerService.parseAnalyzerFrame(analyzerFrame);
    assert.equal(analyzerResult.isValid, true);
    assert.equal(analyzerResult.fatPercentage, 4.2);
    assert.equal(analyzerResult.snfPercentage, 8.6);
  });

  await t.test('4. Measurement Bounds Validation (Cow Biological Limits)', () => {
    const qm: MilkQualityMeasurement = {
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      sessionUuid: MOCK_SESSION_UUID,
    };
    const wm: MilkWeightMeasurement = {
      netWeight: 20.5,
      unit: 'KG',
      sessionUuid: MOCK_SESSION_UUID,
    };

    const qOutcome = MeasurementValidationEngine.validateQuality(qm, 'COW');
    assert.equal(qOutcome.isValid, true);
    assert.equal(qOutcome.errors.length, 0);

    const wOutcome = MeasurementValidationEngine.validateWeight(wm);
    assert.equal(wOutcome.isValid, true);
    assert.equal(wOutcome.errors.length, 0);
  });

  await t.test('5. Matrix Pricing Lookup & Banker Half-Even Rounding', () => {
    const rateChart: RateChartVersion = {
      id: 'rcv-2026-v1',
      rateChartId: 'rc-cow-tasgaon',
      versionNumber: 1,
      milkCategory: 'COW',
      isApproved: true,
      effectiveFrom: Date.now() - 86400000,
      cells: [
        { fatPercentage: 4.2, snfPercentage: 8.6, ratePerUnit: 38.45 },
      ],
    };

    const pricingEngine = new RateCalculationEngine();
    const calc = pricingEngine.calculateRate(rateChart, 4.2, 8.6, 20.5);

    assert.equal(calc.appliedRate, 38.45);
    assert.equal(calc.quantity, 20.5);
    assert.equal(calc.roundingMode, 'HALF_EVEN_2_DECIMALS');
    assert.ok(calc.totalAmount > 788 && calc.totalAmount < 789);
  });

  await t.test('6. Receipt Generation, Verification Hash and 40-Column Slip Output', () => {
    const receiptData: CollectionReceipt = {
      receiptNumber: 'RCP-20261115-001',
      sessionUuid: MOCK_SESSION_UUID,
      businessDate: '2026-11-15',
      shift: 'MORNING',
      centerName: 'Tasgaon Dairy Hub',
      operatorName: 'Operator Deshmukh',
      customerCode: 'FARM-E2E-101',
      customerName: 'Shrikant Shinde',
      identificationMethod: 'RFID',
      milkCategory: 'COW',
      weightKg: 20.5,
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      ratePerUnit: 38.45,
      totalAmount: 788.23,
      timestamp: 1763190000000,
      verificationHash: '',
    };

    const hash = ReceiptFormatter.computeVerificationHash(receiptData);
    assert.equal(hash.length, 64); // 256-bit hex
    receiptData.verificationHash = hash;

    const receiptSlip = ReceiptFormatter.generateReceiptText(receiptData);
    assert.ok(receiptSlip.includes('DFARM DAIRY COLLECTION'));
    assert.ok(receiptSlip.includes('TASGAON DAIRY HUB'));
    assert.ok(receiptSlip.includes('Sh****** Sh****')); // Masked name

    // Verify 40-column width limit for every line
    const lines = receiptSlip.trim().split('\n');
    for (const line of lines) {
      assert.ok(line.length <= 40, `Slip line exceeds 40 characters: "${line}" (${line.length})`);
    }

    // Verify ESC/POS byte sequence generation
    const escPosBytes = BluetoothEscPosPrinterService.generateEscPosBytes(lines);
    assert.equal(escPosBytes[0], 0x1b);
    assert.equal(escPosBytes[1], 0x40); // ESC @
  });
});
