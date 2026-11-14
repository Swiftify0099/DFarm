import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RateCalculationEngine,
  RateChartVersion,
  RateCellNotFoundException,
  roundHalfEven,
} from '../domain/pricing/RateCalculationEngine';

test('Rate Calculation & Matrix Pricing Engine Test Suite', async (t) => {
  const engine = new RateCalculationEngine();

  const cowVersion: RateChartVersion = {
    id: 'rcv_cow_01',
    rateChartId: 'rc_cow_01',
    versionNumber: 1,
    milkCategory: 'COW',
    isApproved: true,
    effectiveFrom: Date.now() - 86400000,
    cells: [
      { fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 34.0 },
      { fatPercentage: 4.0, snfPercentage: 8.5, ratePerUnit: 36.5 },
      { fatPercentage: 4.2, snfPercentage: 8.5, ratePerUnit: 37.8 },
      { fatPercentage: 4.5, snfPercentage: 8.6, ratePerUnit: 39.5 },
    ],
  };

  await t.test('1. Exact Matrix Cell Rate Calculation', () => {
    const result = engine.calculateRate(cowVersion, 4.2, 8.5, 15.0);

    assert.equal(result.appliedRate, 37.8);
    assert.equal(result.quantity, 15.0);
    // 15.0 * 37.80 = 567.00
    assert.equal(result.totalAmount, 567.0);
    assert.equal(result.calculationRule, 'EXACT_FAT_SNF_MATRIX_CELL');
    assert.equal(result.roundingMode, 'HALF_EVEN_2_DECIMALS');
  });

  await t.test('2. Missing Rate Cell Throws Controlled Pricing Error (No invented rates)', () => {
    assert.throws(
      () => {
        // Fat 5.1 / SNF 9.0 is NOT in matrix
        engine.calculateRate(cowVersion, 5.1, 9.0, 20.0);
      },
      (err: any) => {
        return (
          err instanceof RateCellNotFoundException &&
          err.message.includes('No approved rate cell found')
        );
      }
    );
  });

  await t.test('3. Unapproved Rate Chart Version Rejected', () => {
    const draftVersion: RateChartVersion = {
      ...cowVersion,
      isApproved: false,
    };
    assert.throws(
      () => {
        engine.calculateRate(draftVersion, 4.0, 8.5, 10.0);
      },
      (err: any) => {
        return err.message.includes('not approved for production use');
      }
    );
  });

  await t.test('4. Historical Rate Version Preservation', () => {
    const oldHistoricalVersion: RateChartVersion = {
      id: 'rcv_cow_hist_00',
      rateChartId: 'rc_cow_01',
      versionNumber: 0,
      milkCategory: 'COW',
      isApproved: true,
      effectiveFrom: Date.now() - 86400000 * 30,
      effectiveTo: Date.now() - 86400000,
      cells: [
        { fatPercentage: 4.0, snfPercentage: 8.5, ratePerUnit: 33.0 }, // Old rate was 33.00
      ],
    };

    const result = engine.calculateRate(oldHistoricalVersion, 4.0, 8.5, 10.0);
    assert.equal(result.appliedRate, 33.0);
    assert.equal(result.totalAmount, 330.0);
    assert.equal(result.rateVersionNumber, 0);
  });

  await t.test('5. Banker Rounding (Half-Even) 2 decimals precision test', () => {
    // 2.555 -> 2.56, 2.545 -> 2.54 (round to nearest even)
    assert.equal(roundHalfEven(2.555, 2), 2.56);
    assert.equal(roundHalfEven(2.545, 2), 2.54);
    assert.equal(roundHalfEven(15.5 * 37.8, 2), 585.9);
  });
});
