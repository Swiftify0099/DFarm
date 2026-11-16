import {
  RequestOtpResponseSchema,
  AuthSessionSchema,
} from '../../src/types/auth';
import {
  DairySchema,
  NearbyDairiesQuerySchema,
} from '../../src/types/dairy';
import {
  RegistrationResponseSchema,
  CustomerProfileSchema,
} from '../../src/types/customer';
import {
  BillStatementSchema,
} from '../../src/types/bills';

describe('Strict API Contract Testing', () => {
  test('validates RequestOtpResponse contract', () => {
    const payload = {
      success: true,
      message: 'OTP delivered successfully',
      cooldownSeconds: 60,
      expiresAt: '2026-11-15T10:00:00Z',
    };
    expect(RequestOtpResponseSchema.safeParse(payload).success).toBe(true);
  });

  test('validates AuthSession contract', () => {
    const payload = {
      accessToken: 'jwt.mock.access',
      refreshToken: 'jwt.mock.refresh',
      expiresIn: 3600,
      user: {
        id: '1c01e92a-7140-4bc2-8a90-34901f440a01',
        mobileNumber: '9822012345',
        status: 'APPROVED',
        selectedDairyId: '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10',
        customerProfile: {
          name: 'Vitthal Patil',
          dairyName: 'Shree Krishna Sahakari Dudh',
          village: 'Manchar',
        },
      },
    };
    expect(AuthSessionSchema.safeParse(payload).success).toBe(true);
  });

  test('validates Dairy entity contract', () => {
    const payload = {
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
    expect(DairySchema.safeParse(payload).success).toBe(true);
  });

  test('validates BillStatement contract', () => {
    const payload = {
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
      status: 'DISBURSED',
      disbursedDate: '12 Nov 2026',
      paymentMode: 'NEFT',
      utrNumber: 'HDFCR52026111290124',
    };
    expect(BillStatementSchema.safeParse(payload).success).toBe(true);
  });
});
