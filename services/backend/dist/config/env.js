import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Helper to safely load local .env or .env.local without external dependencies
function autoLoadDotEnv() {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(__dirname, '../../../../.env'),
        path.resolve(__dirname, '../../../../.env.local'),
    ];
    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf8');
                for (const line of content.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const eqIndex = trimmed.indexOf('=');
                        if (eqIndex > 0) {
                            const key = trimmed.slice(0, eqIndex).trim();
                            let val = trimmed.slice(eqIndex + 1).trim();
                            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                                val = val.slice(1, -1);
                            }
                            if (!process.env[key]) {
                                process.env[key] = val;
                            }
                        }
                    }
                }
                break;
            }
            catch {
                // ignore read error
            }
        }
    }
}
autoLoadDotEnv();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://localhost:4000'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_ANON_KEY: z.string().min(10, 'SUPABASE_ANON_KEY must be at least 10 characters'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY must be at least 10 characters'),
    DEFAULT_PHONE_REGION: z.string().default('IN'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().positive().default(100),
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
    JWT_SECRET: z.string().default('super-secret-jwt-token-with-at-least-32-characters-long'),
    // WhatsApp Business Cloud API Configuration
    WHATSAPP_ENABLED: z.coerce.boolean().default(false),
    WHATSAPP_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('dfarm_whatsapp_verify_token_default'),
    WHATSAPP_APP_SECRET: z.string().default('dfarm_whatsapp_app_secret_placeholder'),
    // Firebase Cloud Messaging Configuration
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),
});
export function loadEnv(customEnv) {
    const source = customEnv ?? process.env;
    const result = envSchema.safeParse(source);
    if (!result.success) {
        const errorDetails = result.error.issues.map((e) => `[${Array.isArray(e.path) ? e.path.join('.') : e.path}]: ${e.message}`).join(', ');
        throw new Error(`CRITICAL: Environment validation failed: ${errorDetails}`);
    }
    return result.data;
}
// Fallback for test or local development defaults if not in .env
if (!process.env['SUPABASE_URL'] && (process.env['NODE_ENV'] === 'test' || !process.env['NODE_ENV'])) {
    process.env['SUPABASE_URL'] = 'http://127.0.0.1:54321';
    process.env['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
}
export const config = loadEnv();
//# sourceMappingURL=env.js.map