import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MeasurementValidationEngine,
  ProductionManualQualityProvider,
  ProductionManualWeightProvider,
  HardwareConnectionStatus,
} from '../domain/measurement/MeasurementValidationEngine';
import { CenterValidationLimits, MilkQualityMeasurement, MilkWeightMeasurement } from '../types';

test('Measurement Validation & Bounds Test Suite', async (t) => {
  const limits: CenterValidationLimits = {
    cowFatMin: 2.8,
    cowFatMax: 6.0,
    cowSnfMin: 7.8,
    cowSnfMax: 10.2,
    buffaloFatMin: 5.0,
    buffaloFatMax: 12.0,
    buffaloSnfMin: 8.2,
    buffaloSnfMax: 11.5,
    minWeightKg: 0.5,
    maxWeightKg: 200.0,
  };

  await t.test('1. Valid Cow Measurements Pass', () => {
    const qm: MilkQualityMeasurement = {
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      sessionUuid: 'sess_01',
    };
    const wm: MilkWeightMeasurement = {
      netWeight: 12.5,
      unit: 'KG',
      sessionUuid: 'sess_01',
    };

    const qOutcome = MeasurementValidationEngine.validateQuality(qm, 'COW', limits);
    const wOutcome = MeasurementValidationEngine.validateWeight(wm, limits);

    assert.equal(qOutcome.isValid, true);
    assert.equal(wOutcome.isValid, true);
  });

  await t.test('2. Valid Buffalo Measurements Pass', () => {
    const qm: MilkQualityMeasurement = {
      fatPercentage: 7.5,
      snfPercentage: 9.2,
      sessionUuid: 'sess_02',
    };
    const wm: MilkWeightMeasurement = {
      netWeight: 25.0,
      unit: 'KG',
      sessionUuid: 'sess_02',
    };

    const qOutcome = MeasurementValidationEngine.validateQuality(qm, 'BUFFALO', limits);
    const wOutcome = MeasurementValidationEngine.validateWeight(wm, limits);

    assert.equal(qOutcome.isValid, true);
    assert.equal(wOutcome.isValid, true);
  });

  await t.test('3. Invalid Cow Fat Rejected (Below 2.8% and Above 6.0%)', () => {
    const qmLow: MilkQualityMeasurement = {
      fatPercentage: 2.0,
      snfPercentage: 8.5,
      sessionUuid: 'sess_03',
    };
    const outcomeLow = MeasurementValidationEngine.validateQuality(qmLow, 'COW', limits);
    assert.equal(outcomeLow.isValid, false);
    assert.ok(outcomeLow.errors.some((e) => e.includes('outside approved biological limits')));

    const qmHigh: MilkQualityMeasurement = {
      fatPercentage: 7.5,
      snfPercentage: 8.5,
      sessionUuid: 'sess_03',
    };
    const outcomeHigh = MeasurementValidationEngine.validateQuality(qmHigh, 'COW', limits);
    assert.equal(outcomeHigh.isValid, false);
  });

  await t.test('4. Invalid Buffalo SNF Rejected (< 8.2%)', () => {
    const qm: MilkQualityMeasurement = {
      fatPercentage: 6.5,
      snfPercentage: 7.5,
      sessionUuid: 'sess_04',
    };
    const outcome = MeasurementValidationEngine.validateQuality(qm, 'BUFFALO', limits);
    assert.equal(outcome.isValid, false);
    assert.ok(outcome.errors.some((e) => e.includes('SNF')));
  });

  await t.test('5. Negative or Zero Net Weight Rejected', () => {
    const wmZero: MilkWeightMeasurement = {
      netWeight: 0.0,
      sessionUuid: 'sess_05',
    };
    const outcomeZero = MeasurementValidationEngine.validateWeight(wmZero, limits);
    assert.equal(outcomeZero.isValid, false);

    const wmNeg: MilkWeightMeasurement = {
      netWeight: -5.0,
      sessionUuid: 'sess_05',
    };
    const outcomeNeg = MeasurementValidationEngine.validateWeight(wmNeg, limits);
    assert.equal(outcomeNeg.isValid, false);
  });

  await t.test('6. Weight Exceeding Max Single Intake (250 kg > 200 kg) Rejected', () => {
    const wmExcess: MilkWeightMeasurement = {
      netWeight: 250.0,
      sessionUuid: 'sess_06',
    };
    const outcome = MeasurementValidationEngine.validateWeight(wmExcess, limits);
    assert.equal(outcome.isValid, false);
    assert.ok(outcome.errors.some((e) => e.includes('exceeds maximum single intake limit')));
  });

  await t.test('7. Unit Non-KG Rejected (Strict KG Canonical Rule)', () => {
    const wmLitre: MilkWeightMeasurement = {
      netWeight: 15.0,
      unit: 'LITRE' as any,
      sessionUuid: 'sess_07',
    };
    const outcome = MeasurementValidationEngine.validateWeight(wmLitre, limits);
    assert.equal(outcome.isValid, false);
    assert.ok(outcome.errors.some((e) => e.includes('no silent unit conversion')));
  });

  await t.test('8. Software Boundary: Manual Measurement Providers mark DEFERRED_HARDWARE_BOUNDARY', () => {
    const qProvider = new ProductionManualQualityProvider();
    assert.equal(qProvider.getMeasurementStatus(), HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY);

    const wProvider = new ProductionManualWeightProvider();
    assert.equal(wProvider.getMeasurementStatus(), HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY);
  });
});
