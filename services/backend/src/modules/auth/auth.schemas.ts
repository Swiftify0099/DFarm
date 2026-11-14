import { z } from 'zod';

export const SendOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().optional(),
  centerId: z.string().uuid().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const VerifyOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  token: z.string().length(6, 'OTP must be 6 digits'),
});

export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
