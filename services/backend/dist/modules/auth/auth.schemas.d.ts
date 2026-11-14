import { z } from 'zod';
export declare const SendOtpSchema: z.ZodObject<{
    phone: z.ZodString;
}, z.core.$strip>;
export declare const LoginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodOptional<z.ZodString>;
    centerId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof LoginSchema>;
export declare const VerifyOtpSchema: z.ZodObject<{
    phone: z.ZodString;
    token: z.ZodString;
}, z.core.$strip>;
export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
//# sourceMappingURL=auth.schemas.d.ts.map