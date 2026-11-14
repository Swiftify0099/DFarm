import { z } from 'zod';
declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        production: "production";
        test: "test";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        error: "error";
        fatal: "fatal";
        warn: "warn";
        info: "info";
        debug: "debug";
        trace: "trace";
        silent: "silent";
    }>>;
    API_BASE_URL: z.ZodDefault<z.ZodString>;
    CORS_ALLOWED_ORIGINS: z.ZodDefault<z.ZodString>;
    SUPABASE_URL: z.ZodString;
    SUPABASE_ANON_KEY: z.ZodString;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodString;
    DEFAULT_PHONE_REGION: z.ZodDefault<z.ZodString>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    RATE_LIMIT_MAX_REQUESTS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    DATABASE_URL: z.ZodDefault<z.ZodString>;
    JWT_SECRET: z.ZodDefault<z.ZodString>;
    WHATSAPP_ENABLED: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
    WHATSAPP_API_URL: z.ZodDefault<z.ZodString>;
    WHATSAPP_ACCESS_TOKEN: z.ZodOptional<z.ZodString>;
    WHATSAPP_PHONE_NUMBER_ID: z.ZodOptional<z.ZodString>;
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.ZodOptional<z.ZodString>;
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.ZodDefault<z.ZodString>;
    WHATSAPP_APP_SECRET: z.ZodDefault<z.ZodString>;
    FCM_PROJECT_ID: z.ZodOptional<z.ZodString>;
    FCM_CLIENT_EMAIL: z.ZodOptional<z.ZodString>;
    FCM_PRIVATE_KEY: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EnvConfig = z.infer<typeof envSchema>;
export declare function loadEnv(customEnv?: Record<string, string | undefined>): EnvConfig;
export declare const config: EnvConfig;
export {};
//# sourceMappingURL=env.d.ts.map