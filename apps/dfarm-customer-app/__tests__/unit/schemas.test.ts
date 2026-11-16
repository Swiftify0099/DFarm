import {
  RequestOtpSchema,
  VerifyOtpSchema,
} from '../../src/types/auth';
import {
  CustomerRegistrationSchema,
} from '../../src/types/customer';
import {
  MilkCollectionRecordSchema,
} from '../../src/types/collection';
import {
  CustomerLedgerEntrySchema,
} from '../../src/types/ledger';

describe('Strict Zod API Validation Schemas', () => {
  test('validates 10-digit Indian mobile number for OTP', () => {
    expect(RequestOtpSchema.safeParse({ mobileNumber: '9822012345' }).success).toBe(true);
    expect(RequestOtpSchema.safeParse({ mobileNumber: '12345' }).success).toBe(false);
    expect(RequestOtpSchema.safeParse({ mobileNumber: '5822012345' }).success).toBe(false); // must start with 6-9
  });

  test('validates 6-digit OTP verification', () => {
    expect(VerifyOtpSchema.safeParse({ mobileNumber: '9822012345', otp: '123456' }).success).toBe(true);
    expect(VerifyOtpSchema.safeParse({ mobileNumber: '9822012345', otp: '123' }).success).toBe(false);
  });

  test('enforces 128-dimensional embedding and mandatory consent for registration', () => {
    const valid128Embedding = new Array(128).fill(0.088);
    const validRegistration = {
      selectedDairyId: '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10',
      fullName: 'Vitthal Patil',
      village: 'Manchar',
      milkSupplyType: 'COW',
      biometricConsent: true,
      faceTemplate: {
        modelVersion: 'sface_int8_2021dec',
        embedding: valid128Embedding,
        confidence: 0.95,
      },
    };

    expect(CustomerRegistrationSchema.safeParse(validRegistration).success).toBe(true);

    // Fails if consent is false
    expect(
      CustomerRegistrationSchema.safeParse({
        ...validRegistration,
        biometricConsent: false,
      }).success
    ).toBe(false);

    // Fails if embedding dimension is not 128
    expect(
      CustomerRegistrationSchema.safeParse({
        ...validRegistration,
        faceTemplate: {
          ...validRegistration.faceTemplate,
          embedding: [0.1, 0.2], // invalid size
        },
      }).success
    ).toBe(false);
  });

  test('validates milk collection record parameters', () => {
    const record = {
      id: '1c01e92a-7140-4bc2-8a90-34901f440a01',
      receiptNumber: 'COL-2026-11-15-M01',
      shift: 'MORNING',
      collectionDate: '2026-11-15',
      collectionTime: '06:45',
      animalType: 'COW',
      quantityLiters: 14.5,
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      ratePerLiter: 38.5,
      totalAmount: 558.25,
      operatorName: 'Sanjay Shinde',
      operatorId: 'OP-401',
      verifiedBiometrically: true,
    };

    expect(MilkCollectionRecordSchema.safeParse(record).success).toBe(true);
  });

  test('validates ledger credit and debit integrity', () => {
    const entry = {
      id: 'a1010000-7140-4bc2-8a90-34901f440a01',
      transactionDate: '2026-11-15T06:45:00Z',
      type: 'MILK_CREDIT',
      description: 'Morning Shift Milk Credit',
      creditAmount: 558.25,
      debitAmount: 0,
      runningBalance: 12480.0,
      referenceId: 'COL-2026-11-15-M01',
    };

    expect(CustomerLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });
});
