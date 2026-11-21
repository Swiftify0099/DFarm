import { z } from 'zod';

export const RequestOtpSchema = z.object({
  mobileNumber: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
});
export type RequestOtpRequest = z.infer<typeof RequestOtpSchema>;

export const RequestOtpResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cooldownSeconds: z.number().default(60),
  expiresAt: z.string(),
});
export type RequestOtpResponse = z.infer<typeof RequestOtpResponseSchema>;

export const VerifyOtpSchema = z.object({
  mobileNumber: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpSchema>;

export type CustomerRegistrationStatus =
  | 'UNREGISTERED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export const CustomerMembershipSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  dairyId: z.string(),
  tenantCustomerId: z.string().optional(),
  dairyName: z.string(),
  dairyCode: z.string().nullable().optional(),
  dairyAddress: z.string().nullable().optional(),
  centerId: z.string().nullable().optional(),
  centerName: z.string().nullable().optional(),
  farmerCode: z.string().nullable().optional(),
  membershipStatus: z.enum([
    'UNREGISTERED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
  ]),
  status: z.string(),
  isApproved: z.boolean(),
  createdAt: z.string().optional(),
});
export type CustomerMembership = z.infer<typeof CustomerMembershipSchema>;

export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  globalCustomerId: z.string().optional(),
  memberships: z.array(CustomerMembershipSchema).optional(),
  user: z.object({
    id: z.string(),
    globalCustomerId: z.string().optional(),
    mobileNumber: z.string(),
    status: z.enum([
      'UNREGISTERED',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
    ]),
    selectedDairyId: z.string().nullable(),
    customerProfile: z
      .object({
        name: z.string(),
        dairyName: z.string(),
        village: z.string().optional(),
      })
      .nullable(),
  }),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionSchema>;

export interface SwitchDairyRequest {
  dairyId: string;
}

export interface SwitchDairyResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  selectedDairy: {
    dairyId: string;
    dairyName: string;
    dairyCode?: string | null;
    farmerCode?: string | null;
    tenantCustomerId: string;
    membershipStatus: string;
    centerId?: string | null;
    centerName?: string | null;
  };
  user: {
    id: string;
    globalCustomerId?: string;
    selectedDairyId: string;
    status: string;
    farmerCode?: string | null;
    customerProfile: {
      name: string;
      dairyName: string;
      village?: string;
    };
  };
}

export interface MembershipsResponse {
  success: boolean;
  count: number;
  globalCustomerId: string;
  data: CustomerMembership[];
  memberships: CustomerMembership[];
}
