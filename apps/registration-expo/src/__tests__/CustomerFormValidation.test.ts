/**
 * DFarm Registration App - Customer Form Validation Tests
 * Complete parity with Kotlin CustomerFormValidationTest.kt
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MILK_CATEGORY_OPTIONS } from '../types/milkCategories';

describe('CustomerFormValidationTest', () => {
  it('testValidIndianMobileNumberNormalization', () => {
    const rawInput = '9876543210';
    const normalized = `+91${rawInput}`;

    assert.strictEqual(normalized, '+919876543210');
    assert.strictEqual(/^[6-9]\d{9}$/.test(rawInput), true);
  });

  it('testInvalidMobileNumberRejections', () => {
    const regex = /^[6-9]\d{9}$/;

    // Less than 10 digits
    assert.strictEqual(regex.test('987654321'), false);

    // More than 10 digits
    assert.strictEqual(regex.test('98765432101'), false);

    // Starting with invalid digit 1-5
    assert.strictEqual(regex.test('1234567890'), false);
    assert.strictEqual(regex.test('5555555555'), false);

    // Non-numeric characters
    assert.strictEqual(regex.test('98765abcd0'), false);
  });

  it('testMilkCategoryOptionCategories', () => {
    assert.deepStrictEqual(MILK_CATEGORY_OPTIONS.COW.categories, ['COW']);
    assert.deepStrictEqual(MILK_CATEGORY_OPTIONS.BUFFALO.categories, ['BUFFALO']);
    assert.deepStrictEqual(MILK_CATEGORY_OPTIONS.BOTH.categories, ['COW', 'BUFFALO']);
  });

  it('testFullNameValidationRules', () => {
    const validName = 'Pandurang Patil';
    assert.strictEqual(validName.trim().length >= 2, true);

    const singleCharName = 'P';
    assert.strictEqual(singleCharName.trim().length >= 2, false);

    const emptyName = '   ';
    assert.strictEqual(emptyName.trim().length >= 2, false);
  });

  it('testAddressRequiredFields', () => {
    const village = 'Wadgaon';
    const district = 'Kolhapur';

    assert.strictEqual(village.trim().length > 0, true);
    assert.strictEqual(district.trim().length > 0, true);

    const emptyVillage = '  ';
    assert.strictEqual(emptyVillage.trim().length > 0, false);
  });
});
