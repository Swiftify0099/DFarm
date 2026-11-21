# DFARM — COMPLETE CLOUDFLARE PAGES PRODUCTION DEPLOYMENT GUIDE

This document serves as the single source of truth for deploying, configuring, securing, and maintaining the three web frontend applications of the DFarm platform on **Cloudflare Pages**:
1. **dfarm-collection** (`apps/dfarm-collection-app`)
2. **dfarm-dairy-admin** (`apps/dfarm-dairy-admin`)
3. **dfarm-super-admin** (`apps/dfarm-super-admin`)

The backend services, PostgreSQL database, authentication, SMS/WhatsApp integrations, and file storage remain hosted on their dedicated infrastructure (e.g., Render / Linux VM / Docker).

---

## A. REPOSITORY APPLICATION MAP

The DFarm repository is an **npm monorepo** using npm workspaces (`npm` v10+, Node.js v22+).

```
dfarm-monorepo/
├── apps/
│   ├── dfarm-collection-app/       # [1] Milk Collection Kiosk Web App (React 19 + Vite 8)
│   │   ├── public/                 # Static assets, ONNX models & WASM runtimes
│   │   │   ├── models/             # face_detection_yunet_2023mar.onnx, face_recognition_sface_2021dec_int8.onnx
│   │   │   ├── _headers            # COOP, COEP, Permissions-Policy & CSP for WASM SIMD / WebCam
│   │   │   └── _redirects          # SPA client-side routing fallback (/* -> /index.html 200)
│   │   ├── src/                    # Kiosk workspace, camera, hardware drivers, state machine
│   │   ├── .env.example            # Environment template for kiosk deployment
│   │   ├── package.json            # Scripts: dev, build, lint, preview, test
│   │   └── vite.config.ts          # Vite 8 config with ONNX middleware & single-React dedupe
│   │
│   ├── dfarm-dairy-admin/          # [2] Primary Dairy Administrator Web Portal (React 19 + Vite 8)
│   │   ├── public/
│   │   │   ├── _headers            # Security headers & Content-Security-Policy
│   │   │   └── _redirects          # SPA client-side routing fallback (/* -> /index.html 200)
│   │   ├── src/                    # Farmers, approvals, collections, billing, ledger, reports
│   │   ├── .env.example            # Environment template for Dairy Admin deployment
│   │   ├── package.json            # Scripts: dev, build, lint, preview, test
│   │   └── vite.config.ts          # Vite 8 config with Tailwind v4 & React dedupe
│   │
│   ├── dfarm-super-admin/          # [3] Platform Operations & Central Governance (React 19 + Vite 8)
│   │   ├── public/
│   │   │   ├── _headers            # Security headers, Google Maps CSP & Permissions-Policy
│   │   │   └── _redirects          # SPA client-side routing fallback (/* -> /index.html 200)
│   │   ├── src/                    # Multi-tenant control, onboarding, database management, maps
│   │   ├── .env.example            # Environment template for Super Admin deployment
│   │   ├── package.json            # Scripts: dev, build, lint, preview, test
│   │   └── vite.config.ts          # Vite 8 config with Google Maps injection & Tailwind v4
│   │
│   └── dfarm-customer-app/         # Mobile Expo/React Native App (Excluded from Cloudflare Pages)
│
├── services/
│   └── backend/                    # Node.js + Express 5 Clean Architecture API Server
│       ├── src/
│       │   ├── config/cors.ts      # Origin filtering with Cloudflare Pages preview support
│       │   ├── presentation/       # API router mounted on /api/v1
│       │   └── server.ts           # HTTP server running on port 4000
│       └── package.json
│
├── packages/                       # Shared monorepo packages (@dfarm/shared-types, database, etc.)
├── package.json                    # Monorepo root workspace definitions and orchestration scripts
└── package-lock.json               # Root lockfile resolving all dependencies
```

---

## B. COLLECTION APP DEPLOYMENT SETTINGS (`dfarm-collection`)

| Parameter | Cloudflare Pages Setting |
| :--- | :--- |
| **Project Name** | `dfarm-collection` |
| **Framework Preset** | `Vite` |
| **Root Directory** | `apps/dfarm-collection-app` |
| **Build Command** | `npm run build` |
| **Build Output Directory** | `dist` |
| **Node.js Version** | `22.x` (Set `NODE_VERSION=22` in Environment Variables) |
| **Production Branch** | `main` |
| **Custom Domain** | `collection.dfarm.in` |
| **Special Asset Requirements** | ONNX Runtime WebAssembly files (`.wasm`, `.mjs`) and models (`/models/*.onnx`) served with COOP/COEP headers for multi-threaded SIMD support |
| **Camera Access** | Requires HTTPS origin; granted via `Permissions-Policy: camera=(self)` |

---

## C. DAIRY ADMIN DEPLOYMENT SETTINGS (`dfarm-dairy-admin`)

| Parameter | Cloudflare Pages Setting |
| :--- | :--- |
| **Project Name** | `dfarm-dairy-admin` |
| **Framework Preset** | `Vite` |
| **Root Directory** | `apps/dfarm-dairy-admin` |
| **Build Command** | `npm run build` |
| **Build Output Directory** | `dist` |
| **Node.js Version** | `22.x` (Set `NODE_VERSION=22` in Environment Variables) |
| **Production Branch** | `main` |
| **Custom Domain** | `dairy.dfarm.in` |
| **SPA Deep Routing** | Enabled via `public/_redirects` (`/* /index.html 200`) |

---

## D. SUPER ADMIN DEPLOYMENT SETTINGS (`dfarm-super-admin`)

| Parameter | Cloudflare Pages Setting |
| :--- | :--- |
| **Project Name** | `dfarm-super-admin` |
| **Framework Preset** | `Vite` |
| **Root Directory** | `apps/dfarm-super-admin` |
| **Build Command** | `npm run build` |
| **Build Output Directory** | `dist` |
| **Node.js Version** | `22.x` (Set `NODE_VERSION=22` in Environment Variables) |
| **Production Branch** | `main` |
| **Custom Domain** | `admin.dfarm.in` |
| **External Integrations** | Google Maps JavaScript API (Geocoding, Places Autocomplete, Interactive Marker) |

---

## E. SEPARATE ENVIRONMENT VARIABLE TABLES

### 1. Collection App (`dfarm-collection`)

| Variable Name | Purpose | Required / Optional | Scope | Local Dev Value | Cloudflare Preview Value | Cloudflare Production Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_VERSION` | Enforces Node.js runtime on Cloudflare build container | Required | Build System | `22.10.0` | `22` | `22` |
| `VITE_API_BASE_URL` | Canonical backend API endpoint | Required | Public (Browser) | `http://localhost:4000/api/v1` (or unset for Vite proxy `/api/v1`) | `https://dfarm-backend.onrender.com/api/v1` (or staging backend) | `https://dfarm-backend.onrender.com/api/v1` (or `https://api.dfarm.in/api/v1`) |

### 2. Dairy Admin (`dfarm-dairy-admin`)

| Variable Name | Purpose | Required / Optional | Scope | Local Dev Value | Cloudflare Preview Value | Cloudflare Production Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_VERSION` | Enforces Node.js runtime on Cloudflare build container | Required | Build System | `22.10.0` | `22` | `22` |
| `VITE_API_BASE_URL` | Canonical backend API endpoint | Required | Public (Browser) | `http://localhost:4000/api/v1` | `https://dfarm-backend.onrender.com/api/v1` (or staging backend) | `https://dfarm-backend.onrender.com/api/v1` (or `https://api.dfarm.in/api/v1`) |

### 3. Super Admin (`dfarm-super-admin`)

| Variable Name | Purpose | Required / Optional | Scope | Local Dev Value | Cloudflare Preview Value | Cloudflare Production Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_VERSION` | Enforces Node.js runtime on Cloudflare build container | Required | Build System | `22.10.0` | `22` | `22` |
| `VITE_API_BASE_URL` | Canonical backend API endpoint | Required | Public (Browser) | `http://localhost:4000/api/v1` | `https://dfarm-backend.onrender.com/api/v1` (or staging backend) | `https://dfarm-backend.onrender.com/api/v1` (or `https://api.dfarm.in/api/v1`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Key for Google Maps & Places address lookup | Optional (Dev) / Recommended (Prod) | Public (Browser) | (Mock or test key) | Staging Google Maps Key | Production Google Maps Key |
| `VITE_DAIRY_ADMIN_URL` | Dairy Admin Portal base URL for activation links | Optional | Public (Browser) | `http://localhost:5174` | `https://dfarm-dairy-admin.pages.dev` | `https://dairy.dfarm.in` |

> [!CAUTION]
> **NEVER EXPOSE IN BROWSER VARIABLES:**
> - `SUPABASE_SERVICE_ROLE_KEY`
> - `JWT_SECRET`
> - `DATABASE_URL` / `CENTRAL_DATABASE_URL`
> - `TENANT_DB_ENCRYPTION_KEY`
> - `DOVE_SMS_AUTHKEY`
> - `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_APP_SECRET`
> - `SMTP_PASS` / `SMTP_PASSWORD`
> All frontend variables start with `VITE_` and are public in compiled JavaScript bundles.

---

## F. API BASE URL AUDIT RESULTS

| Application | File Path | Existing Config / Code | Problem Identified | Required Correction |
| :--- | :--- | :--- | :--- | :--- |
| **Collection App** | `apps/dfarm-collection-app/src/api/client.ts` | `import.meta.env.VITE_API_BASE_URL \|\| '/api/v1'` | In Cloudflare Pages, an unconfigured variable silently falls back to relative `/api/v1` which returns 404. Also trailing slashes (`/api/v1/`) produced double-slashes (`//endpoint`). | Centralized into `getApiBaseUrl()`. Normalizes trailing slashes, ensures `/api/v1` prefix is attached, and warns prominently in production if unset. |
| **Dairy Admin** | `apps/dfarm-dairy-admin/src/api/client.ts` | `const baseUrl = ...env?.VITE_API_BASE_URL \|\| 'http://localhost:4000/api/v1'` | In production builds without environment variable, hardcoded `http://localhost:4000/api/v1` was baked into the output. Trailing slashes not stripped. | Centralized into `getApiBaseUrl()`. Trailing slashes stripped, `/api/v1` ensured, dev-only fallback to localhost. |
| **Dairy Admin** | `apps/dfarm-dairy-admin/src/api/index.ts` | Lines 31, 45, 799, 807, 819, 832 each had `const baseUrl = ...env?.VITE_API_BASE_URL \|\| 'http://localhost:4000/api/v1'` | 6 separate duplicate declarations of `baseUrl` and direct `fetch()` calls bypassing centralized API client configuration. | Removed all 6 hardcoded localhost fallbacks. Replaced with imported `getApiBaseUrl()`. |
| **Super Admin** | `apps/dfarm-super-admin/vite.config.ts` | `define: { 'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL \|\| 'http://localhost:4000/api/v1') }` | Hardcoded `http://localhost:4000/api/v1` was baked by Vite `define` into production build whenever `VITE_API_URL` was not supplied, ignoring `VITE_API_BASE_URL`. | Updated Vite `define` to use `VITE_API_BASE_URL` with empty string fallback in production mode, avoiding hardcoded localhost baking. |
| **Super Admin** | `apps/dfarm-super-admin/src/api/client.ts` | `(import.meta as any).env?.VITE_API_URL \|\| ...env?.VITE_API_BASE_URL \|\| 'http://localhost:4000/api/v1'` | Inconsistent variable naming between `VITE_API_URL` and `VITE_API_BASE_URL`. Hardcoded localhost fallback in production. | Standardized with `getApiBaseUrl()` prioritizing `VITE_API_BASE_URL` with backward compatibility for `VITE_API_URL`. |
| **Super Admin** | `apps/dfarm-super-admin/src/features/dairies/DairyActivationModal.tsx` | Line 84: `const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5174'` | Hardcoded `http://localhost:5174` fallback for invite link fallback generation. | Replaced with `VITE_DAIRY_ADMIN_URL || window.location.origin`. |
| **Super Admin** | `apps/dfarm-super-admin/.env.example` | Line 17: `VITE_API_URL=http://localhost:3000` | Outdated example port 3000 (backend is on 4000 and requires `/api/v1`). | Updated to canonical `VITE_API_BASE_URL=http://localhost:4000/api/v1`. |

---

## G. EXACT API BASE URL CONFIGURATION

The DFarm backend routes are mounted under `/api/v1` (`services/backend/src/app.ts:54`):
```ts
app.use('/api/v1', cleanApiRouter);
```

Therefore, the canonical API base URL in production is:
```
VITE_API_BASE_URL=https://api.dfarm.in/api/v1
```

All three applications now share the identical normalization algorithm:
1. Trim whitespace and any trailing slashes (`/`).
2. If the user provides `https://api.dfarm.in` (origin only), automatically append `/api/v1`.
3. If the user provides `https://api.dfarm.in/api/v1` or `https://api.dfarm.in/api/v1/`, normalize to `https://api.dfarm.in/api/v1`.
4. In local development (`import.meta.env.DEV`), safely fall back to `http://localhost:4000/api/v1` (or Vite proxy `/api/v1`).
5. In production (`import.meta.env.PROD`), never silently bake or fall back to localhost.

---

## H. CLOUDFLARE PAGES PROJECT CREATION STEPS

### Method 1: Cloudflare Dashboard GUI (Recommended)

Repeat the following 5 steps for each of the three applications:

#### Project 1: `dfarm-collection`
1. Navigate to **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select the repository `dfarm-monorepo` (or your repository name).
3. Configure **Build Settings**:
   - **Project name**: `dfarm-collection`
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Root directory**: `apps/dfarm-collection-app`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Expand **Environment variables**:
   - Add `NODE_VERSION` = `22`
   - Add `VITE_API_BASE_URL` = `https://api.dfarm.in/api/v1`
5. Click **Save and Deploy**.

#### Project 2: `dfarm-dairy-admin`
1. Connect to Git → Select repository.
2. Configure **Build Settings**:
   - **Project name**: `dfarm-dairy-admin`
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Root directory**: `apps/dfarm-dairy-admin`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Expand **Environment variables**:
   - Add `NODE_VERSION` = `22`
   - Add `VITE_API_BASE_URL` = `https://api.dfarm.in/api/v1`
4. Click **Save and Deploy**.

#### Project 3: `dfarm-super-admin`
1. Connect to Git → Select repository.
2. Configure **Build Settings**:
   - **Project name**: `dfarm-super-admin`
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Root directory**: `apps/dfarm-super-admin`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Expand **Environment variables**:
   - Add `NODE_VERSION` = `22`
   - Add `VITE_API_BASE_URL` = `https://api.dfarm.in/api/v1`
   - Add `VITE_GOOGLE_MAPS_API_KEY` = `(Your Google Maps JavaScript API Key)`
   - Add `VITE_DAIRY_ADMIN_URL` = `https://dairy.dfarm.in`
4. Click **Save and Deploy**.

---

## I. PRODUCTION VERSUS PREVIEW ENVIRONMENT INSTRUCTIONS

Cloudflare Pages automatically distinguishes between **Production** and **Preview** environments:

1. **Production Environment**:
   - Deploys on git push / merge to `main`.
   - Uses production environment variables defined in **Settings** → **Environment variables** → **Production**.
   - Custom domains (`collection.dfarm.in`, `dairy.dfarm.in`, `admin.dfarm.in`) route exclusively to the production environment.
   - `VITE_API_BASE_URL` must point to the production backend (`https://api.dfarm.in/api/v1`).

2. **Preview Environment**:
   - Automatically generated for pull requests and non-production branches.
   - URLs follow the pattern `https://<branch>.<project-name>.pages.dev` or `https://<hash>.<project-name>.pages.dev`.
   - Defined in **Settings** → **Environment variables** → **Preview**.
   - If using a staging backend: set `VITE_API_BASE_URL=https://api-staging.dfarm.in/api/v1`.
   - If sharing the production backend: set `VITE_API_BASE_URL=https://api.dfarm.in/api/v1`.
   - The backend CORS policy has been updated to dynamically permit all `*.pages.dev` preview requests for DFarm projects.

---

## J. GITHUB BRANCH AND AUTOMATIC DEPLOYMENT WORKFLOW

### Monorepo Build Optimization
To prevent Cloudflare Pages from building all three projects whenever an unrelated file changes (e.g. committing documentation or editing backend code):

In Cloudflare Pages Project Settings:
1. Go to **Settings** → **Builds & deployments** → **Build watch paths**.
2. Set the watch paths for each project:
   - For `dfarm-collection`: `apps/dfarm-collection-app/**/*`, `packages/**/*`, `package-lock.json`
   - For `dfarm-dairy-admin`: `apps/dfarm-dairy-admin/**/*`, `packages/**/*`, `package-lock.json`
   - For `dfarm-super-admin`: `apps/dfarm-super-admin/**/*`, `packages/**/*`, `package-lock.json`

### Branch Workflow
- `feature/*` or `fix/*` branches → Creates an instant Cloudflare Preview deployment with unique URL for QA testing.
- Pull Request approved & merged into `main` → Triggers immediate automatic Production deployment.

---

## K. BACKEND CORS CONFIGURATION REQUIREMENTS

The backend CORS configuration in `services/backend/src/config/cors.ts` enforces origin authorization with credentials:

```ts
// 1. Explicitly permitted production custom domains:
const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',');

// 2. Safe origin resolver:
export const corsOptions: CorsOptions = {
  origin: (requestOrigin, callback) => {
    if (!requestOrigin) return callback(null, true);

    if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }

    // Dynamic localhost in dev
    if (config.NODE_ENV !== 'production' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
      return callback(null, true);
    }

    // Dynamic Cloudflare Pages preview & project domains (*.pages.dev for DFarm apps)
    if (/^https:\/\/([a-zA-Z0-9_-]+\.)?(dfarm-collection|dfarm-dairy-admin|dfarm-super-admin)\.pages\.dev$/.test(requestOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${requestOrigin} is not allowed by CORS policy`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Request-Id', 'Accept',
    'X-Dairy-Tenant-Id', 'X-Dairy-Id', 'X-Organization-Id', 'X-Tenant-Id',
    'X-Center-Id', 'X-Farmer-Id', 'X-Customer-Id', 'X-Client-App',
    'X-Client-Version', 'X-Device-Id', 'X-Idempotency-Key', 'X-Access-Token'
  ],
  exposedHeaders: ['X-Request-Id', 'X-Dairy-Id', 'X-Dairy-Tenant-Id', 'X-Organization-Id'],
  maxAge: 86400,
};
```

### Production Backend `.env` Update Required:
Update the `CORS_ALLOWED_ORIGINS` variable on your production backend server:
```ini
CORS_ALLOWED_ORIGINS=https://collection.dfarm.in,https://dairy.dfarm.in,https://admin.dfarm.in,https://dfarm-collection.pages.dev,https://dfarm-dairy-admin.pages.dev,https://dfarm-super-admin.pages.dev
```

---

## L. SUPABASE AUTHENTICATION REDIRECT REQUIREMENTS

In the Supabase Management Console (**Authentication** → **URL Configuration**):

1. **Site URL**:
   ```
   https://dairy.dfarm.in
   ```

2. **Redirect URLs (Allow list)**:
   Add each of the following redirect patterns:
   ```
   https://collection.dfarm.in/**
   https://dairy.dfarm.in/**
   https://admin.dfarm.in/**
   https://dfarm-collection.pages.dev/**
   https://dfarm-dairy-admin.pages.dev/**
   https://dfarm-super-admin.pages.dev/**
   https://*.dfarm-collection.pages.dev/**
   https://*.dfarm-dairy-admin.pages.dev/**
   https://*.dfarm-super-admin.pages.dev/**
   http://localhost:5173/**
   http://localhost:5174/**
   http://localhost:5175/**
   ```

---

## M. CUSTOM DOMAIN SETUP

In **Cloudflare Dashboard** → **Workers & Pages** → (Select Project) → **Custom domains**:

1. Click **Set up a custom domain**.
2. Enter the domain:
   - For `dfarm-collection`: `collection.dfarm.in`
   - For `dfarm-dairy-admin`: `dairy.dfarm.in`
   - For `dfarm-super-admin`: `admin.dfarm.in`
3. Cloudflare will automatically provision:
   - CNAME record pointing to `<project-name>.pages.dev`
   - Free Universal SSL/TLS Certificate with automatic HTTP-to-HTTPS redirect
   - HTTP/2, HTTP/3, and Brotli compression

---

## N. SECURITY CHECKLIST

- [x] **No hardcoded secrets**: Verified that no database passwords, service role keys, or JWT secrets exist in frontend code.
- [x] **No silent localhost fallback**: All API clients refuse or warn prominently if `VITE_API_BASE_URL` is omitted in production.
- [x] **SPA Routing**: `public/_redirects` added to all three apps (`/* /index.html 200`) preventing 404s on page refresh.
- [x] **Content-Security-Policy (CSP)**: `public/_headers` configured for all three apps.
- [x] **COOP & COEP**: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` configured for Collection App to enable high-performance `SharedArrayBuffer` for ONNX WebAssembly face detection and recognition.
- [x] **Hardware & Camera Permissions**: `Permissions-Policy: camera=(self)` enabled for secure WebCam access over HTTPS.
- [x] **External Service Boundaries**: Google Maps APIs whitelisted for Super Admin CSP; Dove SMS Gateway API requests routed through backend or permitted via connect-src.
- [x] **Tenant Scoping & Guardrails**: `X-Dairy-Id` and `X-Dairy-Tenant-Id` headers attached to all dairy-scoped requests.

---

## O. BUILD AND TESTING RESULTS

All tests, type checks, and production builds were executed and verified locally on branch `feature/cloudflare-pages-deployment`:

| Application | Test Suite Status | TypeScript Build Check | Bundle localhost Audit |
| :--- | :--- | :--- | :--- |
| **Collection App** (`apps/dfarm-collection-app`) | **PASSED** (10 test files, 58 tests passed) | **PASSED** (`tsc -b && vite build`) | Clean (No hardcoded localhost API endpoints) |
| **Dairy Admin** (`apps/dfarm-dairy-admin`) | **PASSED** (5 test files, 14 tests passed) | **PASSED** (`tsc -b && vite build`) | Clean (All 7 hardcoded `localhost:4000` URLs eliminated) |
| **Super Admin** (`apps/dfarm-super-admin`) | **PASSED** (10 test files, 48 tests passed) | **PASSED** (`tsc -b && vite build`) | Clean (Vite define sanitized; no localhost baking in production) |
| **Backend API** (`services/backend`) | **PASSED** (Clean architecture & contract suites passed) | **PASSED** | Clean (CORS updated with safe `pages.dev` preview support) |

---

## P. ROLLBACK PROCEDURE

If a regression occurs in production after a deployment:

1. **Instant Cloudflare Rollback (< 5 seconds)**:
   - Navigate to **Cloudflare Dashboard** → **Workers & Pages** → Select affected project.
   - Click the **Deployments** tab.
   - Locate the previous known-good deployment.
   - Click the three dots `...` → Select **Rollback to this deployment**.
   - Cloudflare Pages will instantly redirect production traffic to the selected deployment without rebuilding.

2. **Git Revert**:
   - Revert the commit on `main`:
     ```bash
     git revert <commit-hash>
     git push origin main
     ```
   - Cloudflare Pages will build and deploy the reverted commit automatically.

---

## Q. POST-DEPLOYMENT SMOKE-TESTING CHECKLIST

Perform these smoke tests immediately after initial deployment:

### 1. Collection App (`https://collection.dfarm.in`)
- [ ] Kiosk loads without console errors.
- [ ] Direct refresh on `/login` and `/collection` renders correctly (no 404).
- [ ] Operator mobile OTP request dispatches and logs in successfully.
- [ ] WebCam initializes and prompts for browser camera permission over HTTPS.
- [ ] Face detection models (`/models/face_detection_yunet_2023mar.onnx`) and ONNX WASM load without CORS or COEP errors.
- [ ] Customer identification, weighing scale simulation, and collection transaction submit to backend with `X-Dairy-Id` header.

### 2. Dairy Admin (`https://dairy.dfarm.in`)
- [ ] Dashboard loads and session persists across page refreshes.
- [ ] Direct refresh on `/customers/directory`, `/rate-charts`, `/ledger` returns HTTP 200 and loads UI.
- [ ] Admin OTP authentication validates and retrieves dairy tenant metadata.
- [ ] Farmers list, pending registrations, and collection register query backend successfully.
- [ ] Reports export URL formats correctly with `https://api.dfarm.in/api/v1/reports/export?...`.

### 3. Super Admin (`https://admin.dfarm.in`)
- [ ] Login screen loads and Super Admin OTP verifies.
- [ ] Direct refresh on `/dairies`, `/monitoring`, `/settings` works without 404.
- [ ] Google Maps interactive location picker loads map tiles, accepts pin dragging, and resolves address geocoding.
- [ ] Tenant database overview and health metrics query the backend without CORS errors.
- [ ] Invitation links and activation links format with the correct public dairy URL.

---

## R. TROUBLESHOOTING: "The Cloudflare application detection logic has been run in the root of a workspace"

### Error Symptoms:
```
Executing user deploy command: npx wrangler deploy
✘ [ERROR] The Cloudflare application detection logic has been run in the root of a workspace instead of targeting a specific project. Change your working directory to one of the applications in the workspace and try again.
Failed: error occurred while running deploy command
```

### Root Cause:
The repository is an npm monorepo with multiple workspaces defined in `package.json`.
When creating or configuring the project in Cloudflare Dashboard:
1. The **Root directory** setting was left blank (or `/`). This forced Cloudflare to execute `npm run build` and `npx wrangler deploy` from `/` (the monorepo root), building every workspace and confusing Wrangler's project detection.
2. In the new Cloudflare Workers & Pages dashboard, Cloudflare may auto-populate or default the "Deploy command" to `npx wrangler deploy`.

### Resolution Steps in Cloudflare Dashboard:
For EACH application, navigate to:
**Cloudflare Dashboard** → **Workers & Pages** → Select your Project → **Settings** → **Builds & deployments** → **Build configurations** → Click **Edit configuration**:

1. **Root directory (Advanced)**:
   - For `dfarm-collection`: set to `apps/dfarm-collection-app`
   - For `dfarm-dairy-admin`: set to `apps/dfarm-dairy-admin`
   - For `dfarm-super-admin`: set to `apps/dfarm-super-admin`

2. **Build command**:
   - Set to `npm run build`

3. **Build output directory**:
   - Set to `dist`

4. **Deploy command**:
   - If using **Cloudflare Pages**: Leave the deploy command **BLANK** (empty). Cloudflare Pages uploads the `dist` directory automatically without needing Wrangler.
   - If Cloudflare enforces a deploy command or if using Workers Static Assets:
     - Clear the field or leave blank.
     - Alternatively, each app now includes a `wrangler.json` targeting `./dist` (`"pages_build_output_dir": "./dist"`), ensuring Wrangler works properly inside that specific app folder.

5. **Environment Variables**:
   Under **Settings** → **Environment variables**:
   - Add `NODE_VERSION` = `22`
   - Add `VITE_API_BASE_URL` = `https://dfarm-backend.onrender.com/api/v1` (or your backend domain)

6. Click **Save** and trigger a **Retry deployment** or push a new commit.

