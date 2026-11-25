import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to safely load local .env or .env.local without external dependencies
function autoLoadDotEnv(): void {
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
      } catch {
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
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,http://127.0.0.1:4000'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(10, 'SUPABASE_ANON_KEY must be at least 10 characters'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY must be at least 10 characters'),
  DEFAULT_PHONE_REGION: z.string().default('IN'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().positive().default(100),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  CENTRAL_DATABASE_URL: z.string().optional(),
  DATABASE_PROVISIONER_URL: z.string().optional(),
  TENANT_DB_ENCRYPTION_KEY: z.string().default('dfarm-super-secret-encryption-key-32chars!'),
  TENANT_POOL_MAX: z.coerce.number().int().positive().default(5),
  TENANT_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  TENANT_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  DATABASE_TLS_MODE: z.enum(['disable', 'require', 'prefer']).default('prefer'),
  JWT_SECRET: z.string().default('super-secret-jwt-token-with-at-least-32-characters-long'),
  // Dedicated Offline Session Authorization Lease Key (Cryptographically Isolated from JWT_SECRET)
  OFFLINE_LEASE_SIGNING_KEY: z.string().optional(),
  OFFLINE_LEASE_ACTIVE_KEY_ID: z.string().default('k1'),
  OFFLINE_LEASE_PREVIOUS_KEYS: z.string().optional(),
  OFFLINE_LEASE_RETIRED_KEYS: z.string().optional(),
  // WhatsApp Business Cloud API Configuration
  WHATSAPP_ENABLED: z.coerce.boolean().default(false),
  WHATSAPP_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('dfarm_whatsapp_verify_token_default'),
  WHATSAPP_APP_SECRET: z.string().default('dfarm_whatsapp_app_secret_placeholder'),
  // Dove SMS Gateway Configuration (Mobicomm API)
  DOVE_SMS_API_URL: z.string().url().default('https://mobicomm.dove-sms.com/submitsms.jsp'),
  DOVE_SMS_USERNAME: z.string().default('Experts'),
  DOVE_SMS_AUTHKEY: z.string().default('ba9dcdcdfcXX'),
  DOVE_SMS_SENDER_ID: z.string().default('EXTSKL'),
  DOVE_SMS_ACCUSAGE: z.string().default('1'),
  DOVE_SMS_TEMPLATE: z.string().default('Your Verification Code for login is {OTP}. - Expertskill Technology.'),
  // Hardened Admin OTP Configuration
  ADMIN_PHONE_NUMBER: z.string().default('+917755995615,+919876543210,7755995615'),
  ADMIN_OTP_SECRET: z.string().default('dfarm-super-secure-admin-otp-secret-key-32chars!'),
  ALLOW_TEST_PREVIEW_OTP: z.coerce.boolean().default(false),
  // Firebase Cloud Messaging Configuration
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  // Email / SMTP Service Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('DFarm Platform <noreply@dfarm.in>'),
  EMAIL_FROM: z.string().optional(),
  // Public Activation & Web URLs
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_ACTIVATION_URL: z.string().url().default('http://localhost:5173/activate'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateKeyEntropyAndByteLength(key: string, keyName = 'OFFLINE_LEASE_SIGNING_KEY'): void {
  if (!key || typeof key !== 'string') {
    throw new Error(`CRITICAL: ${keyName} is required and must be a string.`);
  }

  // 1. Verify Minimum 256-Bit (32 Byte) Cryptographic Length
  const isHex = /^[0-9a-fA-F]+$/.test(key);
  if (isHex) {
    if (key.length < 64) {
      throw new Error(
        `CRITICAL: ${keyName} hex format requires at least 64 hex characters (32 bytes / 256 bits). Received ${key.length} hex characters (${Math.floor(key.length / 2)} bytes).`
      );
    }
  } else {
    const rawByteLength = Buffer.byteLength(key, 'utf8');
    if (rawByteLength < 32) {
      throw new Error(
        `CRITICAL: ${keyName} requires at least 32 cryptographically random bytes (256 bits). Received ${rawByteLength} bytes.`
      );
    }
  }

  // 2. Cryptographic Entropy & Repetitive Pattern Check
  const uniqueChars = new Set(key).size;
  if (uniqueChars < 8) {
    throw new Error(
      `CRITICAL: ${keyName} fails entropy verification: key exhibits insufficient randomness (only ${uniqueChars} unique characters). Use a cryptographically secure 256-bit generator (e.g. crypto.randomBytes(32)).`
    );
  }

  // Check for trivial repeated substring patterns (e.g. repeated 2, 3, 4, 8 character chunks)
  if (key.length >= 32) {
    for (const chunkLen of [2, 3, 4, 8]) {
      const chunk = key.slice(0, chunkLen);
      const repeated = chunk.repeat(Math.floor(key.length / chunkLen));
      if (key.startsWith(repeated)) {
        throw new Error(
          `CRITICAL: ${keyName} fails entropy verification: repetitive pattern detected. Key must be cryptographically random.`
        );
      }
    }
  }
}

export function loadEnv(customEnv?: Record<string, string | undefined>): EnvConfig {
  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorDetails = (result.error as any).issues.map((e: any) => `[${Array.isArray(e.path) ? e.path.join('.') : e.path}]: ${e.message}`).join(', ');
    throw new Error(`CRITICAL: Environment validation failed: ${errorDetails}`);
  }

  // Strict Production Enforcement: Dedicated OFFLINE_LEASE_SIGNING_KEY is strictly mandatory in production
  if (result.data.NODE_ENV === 'production') {
    if (!result.data.OFFLINE_LEASE_SIGNING_KEY) {
      throw new Error(
        'CRITICAL: Production startup failed: Dedicated OFFLINE_LEASE_SIGNING_KEY must be configured with at least 32 cryptographically random bytes (256 bits). Fallback to JWT_SECRET in production is strictly prohibited.'
      );
    }
    validateKeyEntropyAndByteLength(result.data.OFFLINE_LEASE_SIGNING_KEY, 'OFFLINE_LEASE_SIGNING_KEY');
  }

  return result.data;
}

// Fallback for test or local development defaults if not in .env
if (!process.env['SUPABASE_URL'] && (process.env['NODE_ENV'] === 'test' || !process.env['NODE_ENV'])) {
  process.env['SUPABASE_URL'] = 'http://127.0.0.1:54321';
  process.env['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
}

export const config: EnvConfig = loadEnv();
