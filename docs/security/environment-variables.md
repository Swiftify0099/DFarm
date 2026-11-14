# DFarm: Environment Variables & Secret Management Specification

This document defines the configuration schema, environment categories, secret segregation rules, and startup validation procedures implemented across the DFarm ecosystem.

---

## 1. Environment Variable Architecture

Environment variables in DFarm are divided into two strictly isolated tiers:
1. **Server-Side Environment Variables [SERVER-ONLY]:** Injected into backend Node.js runtimes. These include database connection strings, master service role keys, encryption secrets, and third-party API credentials. They must never be exposed to clients.
2. **Public Client Variables [PUBLIC]:** Baked into frontend bundles (Vite prefix `VITE_`, Expo prefix `EXPO_PUBLIC_`). These contain only non-secret configuration such as API base URLs and public Supabase anonymous keys.

---

## 2. Server-Side Variable Catalog (`services/backend/.env`)

| Variable Name | Required | Category | Description | Placeholder Example |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Runtime | Execution environment (`development`, `staging`, `production`) | `production` |
| `PORT` | Yes | Runtime | HTTP port on which backend listens | `4000` |
| `API_BASE_URL` | Yes | Network | Canonical API endpoint base URL | `https://api.dfarm.example.com/api/v1` |
| `DEFAULT_CENTER_ID`| Yes | Multi-Center | Default center UUID for single-center deployments | `c1a2b3c4-...` |
| `TIMEZONE` | Yes | Localization | Standard operating timezone | `Asia/Kolkata` |
| `SUPABASE_URL` | Yes | Database | Supabase project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Security | Supabase admin key bypassing RLS (**NEVER LEAK**) | `eyJh...service_role...` |
| `DATABASE_URL` | Yes | Database | Direct PostgreSQL connection string (Transaction pooler) | `postgresql://...:6543/postgres` |
| `DIRECT_URL` | Yes | Database | Direct PostgreSQL connection string for migrations | `postgresql://...:5432/postgres` |
| `JWT_SECRET` | Yes | Auth | High-entropy secret for signing session JWT tokens | `random_32_byte_hex_string` |
| `JWT_EXPIRATION_HOURS` | Yes | Auth | Access token lifetime | `24` |
| `DATA_ENCRYPTION_KEY_HEX` | Yes | Security | 32-byte hexadecimal key for AES-256-GCM template encryption | `0123456789abcdef...` |
| `IDENTIFICATION_SALT` | Yes | Security | Salt value for hashing sensitive identification logs | `dfarm_salt_2026` |
| `OTP_PROVIDER` | Yes | Messaging | SMS OTP provider (`msg91`, `twilio`) | `msg91` |
| `OTP_API_KEY` | Yes | Messaging | Secret authentication key for SMS gateway | `auth_token_secret` |
| `WHATSAPP_ENABLED` | Yes | Messaging | Toggle for sending automated WhatsApp receipts | `true` |
| `WHATSAPP_ACCESS_TOKEN` | Cond | Messaging | Meta Cloud API access token | `EAA...token...` |
| `WHATSAPP_PHONE_NUMBER_ID` | Cond | Messaging | Meta Business phone number identifier | `1029384756` |
| `FCM_PROJECT_ID` | Cond | Push | Firebase Cloud Messaging project identifier | `dfarm-smart-dairy` |
| `FCM_CLIENT_EMAIL` | Cond | Push | FCM service account email | `fcm@dfarm.iam.gserviceaccount.com` |
| `FCM_PRIVATE_KEY` | Cond | Push | FCM service account private key (PEM format) | `"-----BEGIN PRIVATE KEY...-----"` |
| `PAYMENT_GATEWAY_PROVIDER`| No | Payments | Abstract payout adaptor identifier | `razorpay_payouts` |
| `PAYMENT_GATEWAY_KEY_ID` | Cond | Payments | Payout provider API Key ID | `rzp_live_...` |
| `PAYMENT_GATEWAY_KEY_SECRET` | Cond | Payments | Payout provider API Key Secret | `rzp_secret_...` |

---

## 3. Public Client Variable Catalog

### 3.1 Admin Web Dashboard (`apps/admin-web/.env`)
| Variable Name | Prefix | Description | Safe for Public Bundle? |
| :--- | :--- | :--- | :---: |
| `VITE_API_BASE_URL` | `VITE_` | Backend REST API root URL | ✅ Yes |
| `VITE_SUPABASE_URL` | `VITE_` | Public Supabase project URL | ✅ Yes |
| `VITE_SUPABASE_ANON_KEY` | `VITE_` | Public Supabase anonymous client key (Governed by RLS) | ✅ Yes |
| `VITE_DEFAULT_CENTER_ID`| `VITE_` | Default center identifier for UI filters | ✅ Yes |

### 3.2 Customer Mobile App & Registration App (`apps/customer-mobile/.env`, `apps/registration-android/.env`)
| Variable Name | Prefix | Description | Safe for Public Bundle? |
| :--- | :--- | :--- | :---: |
| `EXPO_PUBLIC_API_BASE_URL` | `EXPO_PUBLIC_` | Backend REST API root URL for mobile | ✅ Yes |
| `EXPO_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_` | Public Supabase project URL | ✅ Yes |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `EXPO_PUBLIC_` | Public anonymous key for client RLS queries | ✅ Yes |
| `EXPO_PUBLIC_FACE_MODEL_VERSION` | `EXPO_PUBLIC_` | Target biometric embedding model identifier | ✅ Yes |

---

## 4. Application Startup Validation

To prevent runtime failures due to misconfigured or missing environment variables, all applications execute strict startup validation using **Zod** schema parsing:
```typescript
// Example startup schema check (services/backend/src/config/env.ts)
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().transform(Number),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATA_ENCRYPTION_KEY_HEX: z.string().length(64), // 32 bytes hex
  JWT_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```
If any required variable is absent or invalid, the service terminates immediately on boot with a clear error message, preventing partial or insecure execution.

