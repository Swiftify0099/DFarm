import { z } from 'zod';

export const CustomerRegistrationSchema = z.object({
  selectedDairyId: z.string().uuid('Please select a valid dairy'),
  fullName: z
    .string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100),
  village: z
    .string()
    .min(2, 'Village name must be at least 2 characters')
    .max(100),
  mobileNumber: z.string().optional(),
  milkSupplyType: z.enum(['COW', 'BUFFALO', 'BOTH']),
  biometricConsent: z
    .boolean()
    .refine((val) => val === true, 'Explicit biometric consent is mandatory'),
  faceTemplate: z.object({
    modelVersion: z.literal('sface_int8_2021dec'),
    embedding: z
      .array(z.number())
      .length(128, 'Face embedding must be exactly 128 dimensions'),
    confidence: z.number().min(0).max(1),
  }),
});
export type CustomerRegistrationRequest = z.infer<
  typeof CustomerRegistrationSchema
>;

export const CustomerProfileSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  mobileNumber: z.string(),
  dairyId: z.string().uuid(),
  dairyName: z.string(),
  village: z.string(),
  milkSupplyType: z.enum(['COW', 'BUFFALO', 'BOTH']),
  status: z.enum([
    'UNREGISTERED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
  ]),
  biometricStatus: z.object({
    isEnrolled: z.boolean(),
    version: z.string(),
    enrolledAt: z.string().optional(),
  }),
  createdAt: z.string(),
});
export type CustomerProfile = z.infer<typeof CustomerProfileSchema>;

export interface RegistrationResponse {
  success: boolean;
  customerUuid: string;
  status: string;
  submissionTimestamp: string;
}
