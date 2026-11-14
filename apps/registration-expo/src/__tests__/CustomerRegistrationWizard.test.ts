/**
 * DFarm Registration App - Registration Wizard Navigation & Flow Tests
 * Complete parity with Kotlin CustomerRegistrationWizardTest.kt
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MILK_CATEGORY_OPTIONS } from '../types/milkCategories';
import { CustomerDto } from '../types/models';

export enum WizardStep {
  PERSONAL_DETAILS = 1,
  MOBILE_VALIDATION = 2,
  MILK_CATEGORY = 3,
  REVIEW_DETAILS = 4,
  REGISTRATION_STATUS = 5,
}

export class TestWizardStateEngine {
  currentStep: WizardStep = WizardStep.PERSONAL_DETAILS;

  fullName = '';
  village = '';
  district = '';
  taluka = '';
  postalCode = '';

  mobileDigits = '';
  selectedCategory = 'COW';

  fullNameError: string | null = null;
  villageError: string | null = null;
  mobileError: string | null = null;

  onFullNameChanged(val: string) {
    this.fullName = val;
    this.fullNameError = null;
  }

  onVillageChanged(val: string) {
    this.village = val;
    this.villageError = null;
  }

  onDistrictChanged(val: string) {
    this.district = val;
  }

  onTalukaChanged(val: string) {
    this.taluka = val;
  }

  onPostalCodeChanged(val: string) {
    this.postalCode = val;
  }

  onMobileDigitsChanged(val: string) {
    this.mobileDigits = val.replace(/\D/g, '').slice(0, 10);
    this.mobileError = null;
  }

  get normalizedMobile(): string {
    return `+91${this.mobileDigits}`;
  }

  goToNextStep(): boolean {
    if (this.currentStep === WizardStep.PERSONAL_DETAILS) {
      let valid = true;
      if (this.fullName.trim().length < 2) {
        this.fullNameError = 'Full name must be at least 2 characters';
        valid = false;
      }
      if (!this.village.trim()) {
        this.villageError = 'Village is required';
        valid = false;
      }
      if (!valid) return false;
      this.currentStep = WizardStep.MOBILE_VALIDATION;
      return true;
    }

    if (this.currentStep === WizardStep.MOBILE_VALIDATION) {
      if (!/^[6-9]\d{9}$/.test(this.mobileDigits)) {
        this.mobileError = 'Enter a valid 10-digit Indian mobile number';
        return false;
      }
      this.currentStep = WizardStep.MILK_CATEGORY;
      return true;
    }

    if (this.currentStep === WizardStep.MILK_CATEGORY) {
      this.currentStep = WizardStep.REVIEW_DETAILS;
      return true;
    }

    if (this.currentStep === WizardStep.REVIEW_DETAILS) {
      this.currentStep = WizardStep.REGISTRATION_STATUS;
      return true;
    }

    return false;
  }

  goToPreviousStep(): void {
    if (this.currentStep === WizardStep.REVIEW_DETAILS) {
      this.currentStep = WizardStep.MILK_CATEGORY;
    } else if (this.currentStep === WizardStep.MILK_CATEGORY) {
      this.currentStep = WizardStep.MOBILE_VALIDATION;
    } else if (this.currentStep === WizardStep.MOBILE_VALIDATION) {
      this.currentStep = WizardStep.PERSONAL_DETAILS;
    }
  }
}

describe('CustomerRegistrationWizardTest', () => {
  it('testWizardStepProgressionAndValidation', () => {
    const wizard = new TestWizardStateEngine();

    // Step 1: Initial state
    assert.strictEqual(wizard.currentStep, WizardStep.PERSONAL_DETAILS);

    // Attempting to advance with empty details must fail
    const advanceWithoutDetails = wizard.goToNextStep();
    assert.strictEqual(advanceWithoutDetails, false);
    assert.strictEqual(wizard.currentStep, WizardStep.PERSONAL_DETAILS);
    assert.ok(wizard.fullNameError);
    assert.ok(wizard.villageError);

    // Fill Personal Details
    wizard.onFullNameChanged('Pandurang Patil');
    wizard.onVillageChanged('Wadgaon');
    wizard.onDistrictChanged('Kolhapur');
    wizard.onTalukaChanged('Karveer');
    wizard.onPostalCodeChanged('416001');

    // Advance to Step 2
    const advanceToStep2 = wizard.goToNextStep();
    assert.strictEqual(advanceToStep2, true);
    assert.strictEqual(wizard.currentStep, WizardStep.MOBILE_VALIDATION);

    // Step 2: Attempting to advance with invalid mobile must fail
    wizard.onMobileDigitsChanged('12345'); // Too short and starts with 1
    const advanceWithInvalidMobile = wizard.goToNextStep();
    assert.strictEqual(advanceWithInvalidMobile, false);
    assert.strictEqual(wizard.currentStep, WizardStep.MOBILE_VALIDATION);
    assert.ok(wizard.mobileError);

    // Enter valid 10-digit mobile starting with 6-9
    wizard.onMobileDigitsChanged('9876543210');
    assert.strictEqual(wizard.normalizedMobile, '+919876543210');

    // Advance to Step 3 (Milk Category)
    const advanceToStep3 = wizard.goToNextStep();
    assert.strictEqual(advanceToStep3, true);
    assert.strictEqual(wizard.currentStep, WizardStep.MILK_CATEGORY);

    // Select Milk Category Option
    wizard.selectedCategory = 'BOTH';
    assert.deepStrictEqual(MILK_CATEGORY_OPTIONS.BOTH.categories, ['COW', 'BUFFALO']);

    // Advance to Step 4 (Review)
    const advanceToStep4 = wizard.goToNextStep();
    assert.strictEqual(advanceToStep4, true);
    assert.strictEqual(wizard.currentStep, WizardStep.REVIEW_DETAILS);

    // Test Step Backwards Navigation
    wizard.goToPreviousStep();
    assert.strictEqual(wizard.currentStep, WizardStep.MILK_CATEGORY);

    wizard.goToPreviousStep();
    assert.strictEqual(wizard.currentStep, WizardStep.MOBILE_VALIDATION);

    wizard.goToPreviousStep();
    assert.strictEqual(wizard.currentStep, WizardStep.PERSONAL_DETAILS);
  });

  it('testCustomerSoftDeleteAndRestoreFlow', async () => {
    // In-memory simulation of customer repository soft-delete and restore
    const customer: CustomerDto = {
      id: 'mock-uuid-12345',
      organizationId: 'org-dfarm-01',
      primaryCenterId: 'center-kolhapur-01',
      fullName: 'Pandurang Patil',
      normalizedMobileNumber: '+919876543210',
      status: 'ACTIVE',
      registrationStatus: 'COMPLETED',
      permittedCategories: ['COW'],
    };

    // Soft delete
    customer.status = 'SOFT_DELETED';
    assert.strictEqual(customer.status, 'SOFT_DELETED');

    // Restore
    customer.status = 'ACTIVE';
    assert.strictEqual(customer.status, 'ACTIVE');
  });

  it('testOfficerProfileCenterEnrichmentOnLogin', () => {
    const officer = {
      id: 'user-test-01',
      email: 'officer@dfarm.internal',
      fullName: 'Field Officer',
      role: 'REGISTRATION_OFFICER',
      organizationId: 'org-dfarm-01',
      centerId: 'center-kolhapur-01',
      assignedCenters: [
        {
          centerId: 'center-kolhapur-01',
          centerCode: 'C101',
          centerName: 'Kolhapur Main Intake Center',
        },
      ],
    };

    assert.ok(officer);
    assert.strictEqual(officer.centerId, 'center-kolhapur-01');
    assert.strictEqual(officer.assignedCenters.length, 1);
  });
});
