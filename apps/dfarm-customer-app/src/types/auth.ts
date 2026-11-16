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

export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string().uuid(),
    mobileNumber: z.string(),
    status: z.enum([
      'UNREGISTERED',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
    ]),
    selectedDairyId: z.string().uuid().nullable(),
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
