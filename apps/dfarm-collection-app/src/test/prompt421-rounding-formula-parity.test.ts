import { describe, it, expect } from 'vitest';
import { roundHalfUp as clientRoundHalfUp } from '../utils/rounding';
import { roundHalfUp as sharedRoundHalfUp } from '@dfarm/shared-types';
import { ratesApi } from '../api/client';
import type { RateChartCacheItem } from '../types';

describe('PROMPT 4.2.1: Financial Rounding Parity & Formula Pricing Parity Suite (Client)', () => {
  describe('1. Financial Rounding: Reject Invalid Inputs (P0)', () => {
    it('client and shared roundHalfUp throw TypeError on NaN', () => {
      expect(() => clientRoundHalfUp(NaN)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp(NaN)).toThrow(TypeError);
    });

    it('client and shared roundHalfUp throw TypeError on +Infinity and -Infinity', () => {
      expect(() => clientRoundHalfUp(Infinity)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp(Infinity)).toThrow(TypeError);
      expect(() => clientRoundHalfUp(-Infinity)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp(-Infinity)).toThrow(TypeError);
    });

    it('client and shared roundHalfUp throw TypeError on non-number inputs', () => {
      expect(() => clientRoundHalfUp('31.50' as any)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp('31.50' as any)).toThrow(TypeError);
      expect(() => clientRoundHalfUp(null as any)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp(null as any)).toThrow(TypeError);
      expect(() => clientRoundHalfUp(undefined as any)).toThrow(TypeError);
      expect(() => sharedRoundHalfUp(undefined as any)).toThrow(TypeError);
    });

    it('client and shared roundHalfUp throw RangeError on invalid decimals parameter', () => {
      expect(() => clientRoundHalfUp(31.505, -1)).toThrow(RangeError);
      expect(() => sharedRoundHalfUp(31.505, -1)).toThrow(RangeError);
      expect(() => clientRoundHalfUp(31.505, 1.5)).toThrow(RangeError);
      expect(() => sharedRoundHalfUp(31.505, 1.5)).toThrow(RangeError);
    });
  });

  describe('2. Rounding Boundary Precision and 100% Parity', () => {
    const testCases: Array<{ input: number; expected: number; description: string }> = [
      { input: 31.505, expected: 31.51, description: 'Standard half-paise round up' },
      { input: 31.504, expected: 31.50, description: 'Below half-paise round down' },
      { input: 31.5049999999, expected: 31.50, description: 'Immediately below half-paise boundary' },
      { input: 31.5050000001, expected: 31.51, description: 'Immediately above half-paise boundary' },
      { input: 10.005, expected: 10.01, description: 'Paise boundary at 10.005' },
      { input: 10.004, expected: 10.00, description: 'Paise boundary at 10.004' },
      { input: -31.505, expected: -31.51, description: 'Negative half-paise round away from zero' },
      { input: -31.504, expected: -31.50, description: 'Negative below half-paise round towards zero' },
      { input: -10.005, expected: -10.01, description: 'Negative paise boundary at -10.005' },
      { input: 99999999.995, expected: 100000000.00, description: 'Large amount round up at boundary' },
      { input: 99999999.994, expected: 99999999.99, description: 'Large amount round down' },
      { input: 0.005, expected: 0.01, description: 'Small amount round up' },
      { input: 0.004, expected: 0.00, description: 'Small amount round down' },
      { input: 0.00001, expected: 0.00, description: 'Very small decimal value' },
      { input: 15.75 * 42.55, expected: 670.16, description: 'Quantity x Rate calculation (670.1625 -> 670.16)' },
      { input: 12.50 * 55.05, expected: 688.13, description: 'Quantity x Rate calculation (688.125 -> 688.13)' },
      { input: 25.33 * 38.45, expected: 973.94, description: 'Quantity x Rate calculation (973.9385 -> 973.94)' },
    ];

    testCases.forEach(({ input, expected, description }) => {
      it(`evaluates ${description}: ${input} -> ${expected}`, () => {
        const clientResult = clientRoundHalfUp(input, 2);
        const sharedResult = sharedRoundHalfUp(input, 2);
        expect(clientResult).toBe(expected);
        expect(sharedResult).toBe(expected);
        expect(clientResult).toBe(sharedResult);
      });
    });
  });

  describe('3. Offline Formula Model Parity & Rejection (P1)', () => {
    const today = new Date().toISOString().split('T')[0];

    const createMockChart = (overrides: Partial<RateChartCacheItem>): RateChartCacheItem => ({
      id: 'chart-default',
      dairyId: 'dairy-default',
      centerScope: 'ORGANIZATION_WIDE',
      version: 1,
      milkCategory: 'COW',
      effectiveFrom: today,
      baseFat: 3.5,
      baseSnf: 8.5,
      baseRate: 40.0,
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    it('rejects non-finite fat or snf with INVALID_FINANCIAL_VALUES', () => {
      const mockChart = createMockChart({
        id: 'chart-1',
        pricingType: 'GRID',
        gridMatrix: { '4.0': { '8.5': 40.5 } },
      });

      const nanFatResult = ratesApi.calculateRate('COW', NaN, 8.5, mockChart);
      expect(nanFatResult.isValid).toBe(false);
      expect(nanFatResult.error).toContain('INVALID_FINANCIAL_VALUES');

      const infSnfResult = ratesApi.calculateRate('COW', 4.0, Infinity, mockChart);
      expect(infSnfResult.isValid).toBe(false);
      expect(infSnfResult.error).toContain('INVALID_FINANCIAL_VALUES');
    });

    it('correctly calculates GRID pricing and fails closed on missing cells', () => {
      const gridChart = createMockChart({
        id: 'chart-grid',
        pricingType: 'GRID',
        gridMatrix: {
          '4.0': { '8.5': 40.55 },
          '4.2': { '8.5': 41.25 },
        },
      });

      // Configured cell
      const validRes = ratesApi.calculateRate('COW', 4.0, 8.5, gridChart);
      expect(validRes.isValid).toBe(true);
      expect(validRes.ratePerLiter).toBe(40.55);

      // Missing cell strictly fails closed
      const missingRes = ratesApi.calculateRate('COW', 4.5, 8.5, gridChart);
      expect(missingRes.isValid).toBe(false);
      expect(missingRes.error).toContain('RATE_CELL_NOT_FOUND');
    });

    it('correctly calculates TWO_AXIS_FORMULA pricing with base rate and fat/snf factors', () => {
      const twoAxisChart = createMockChart({
        id: 'chart-two-axis',
        pricingType: 'TWO_AXIS_FORMULA',
        baseRate: 35.0,
        baseFat: 3.5,
        baseSnf: 8.5,
        fatFactor: 4.0,
        snfFactor: 3.0,
        minFat: 2.5,
        maxFat: 6.0,
        minSnf: 7.5,
        maxSnf: 10.0,
      });

      // Formula: 35.0 + (4.0 - 3.5) * 4.0 + (9.0 - 8.5) * 3.0 = 35.0 + 2.0 + 1.5 = 38.50
      const res = ratesApi.calculateRate('COW', 4.0, 9.0, twoAxisChart);
      expect(res.isValid).toBe(true);
      expect(res.ratePerLiter).toBe(38.50);

      // Incomplete parameters fail closed
      const incompleteChart = createMockChart({
        id: 'chart-bad-two-axis',
        pricingType: 'TWO_AXIS_FORMULA',
        baseRate: 35.0,
        fatFactor: undefined,
        snfFactor: undefined,
        ratePerFatUnit: undefined,
        ratePerSnfUnit: undefined,
      });
      const badRes = ratesApi.calculateRate('COW', 4.0, 9.0, incompleteChart);
      expect(badRes.isValid).toBe(false);
      expect(badRes.error).toContain('INVALID_FORMULA_DEFINITION');
    });

    it('correctly calculates TOTAL_SOLIDS_FORMULA pricing (Rate = Fat% * fatFactor + SNF% * snfFactor)', () => {
      const tsChart = createMockChart({
        id: 'chart-ts',
        pricingType: 'TOTAL_SOLIDS_FORMULA',
        fatFactor: 6.0,
        snfFactor: 3.5,
        minFat: 2.5,
        maxFat: 6.0,
        minSnf: 7.5,
        maxSnf: 10.0,
      });

      // Formula: (4.0 * 6.0) + (8.5 * 3.5) = 24.00 + 29.75 = 53.75
      const res = ratesApi.calculateRate('COW', 4.0, 8.5, tsChart);
      expect(res.isValid).toBe(true);
      expect(res.ratePerLiter).toBe(53.75);

      // Incomplete parameters fail closed
      const incompleteTsChart = createMockChart({
        id: 'chart-bad-ts',
        pricingType: 'TOTAL_SOLIDS_FORMULA',
        fatFactor: undefined,
        snfFactor: undefined,
        ratePerFatUnit: undefined,
        ratePerSnfUnit: undefined,
      });
      const badRes = ratesApi.calculateRate('COW', 4.0, 8.5, incompleteTsChart);
      expect(badRes.isValid).toBe(false);
      expect(badRes.error).toContain('INVALID_FORMULA_DEFINITION');
    });

    it('strictly fails closed on unsupported pricing models without guessing fallback', () => {
      const unsupportedChart = createMockChart({
        id: 'chart-unsupported',
        pricingType: 'NON_LINEAR_SLAB_CURVE' as any,
      });

      const res = ratesApi.calculateRate('COW', 4.0, 8.5, unsupportedChart);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('UNSUPPORTED_PRICING_MODEL');
    });
  });
});
