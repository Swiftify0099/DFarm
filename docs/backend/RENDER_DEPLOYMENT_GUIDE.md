# Render.com Free Tier Deployment Guide for DFarm Backend

This guide explains how to deploy the `@dfarm/backend` Express Node.js service to **Render's Free Tier** and make it live.

---

## 1. Is it Possible on Free Tier?
**Yes, 100% possible.**
Render provides a **Free Web Service** plan with:
- **0.1 CPU & 512 MB RAM**
- **Free Automatic SSL/TLS Certificate** (`https://<your-app-name>.onrender.com`)
- **750 Free Instance Hours/Month** (more than enough to run 1 service 24/7 continuously)
- **Automatic Git Deployments** on push to `main`

> [!NOTE]
> **Free Tier Sleep Behavior**: If your service receives no traffic for 15 minutes, Render puts the instance to sleep (spins down to 0). When a new request arrives, it automatically wakes up (first request takes ~30 to 50 seconds; subsequent requests are instant).

---

## 2. Project Configuration Overview

We have pre-configured everything needed for Render:
1. **[render.yaml](../../render.yaml)**: Blueprint file for 1-click automated setup.
2. **Build Command**: `npm install && npm run build:backend`
   - *Why*: Compiles only `@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, and `@dfarm/backend`. It skips client-side frontend builds, keeping memory usage well below 512MB.
3. **Start Command**: `npm run start:backend` (runs `node services/backend/dist/server.js`)
4. **Health Check Path**: `/health/live` (or `/health`)
5. **Port**: Automatically handled via Render's `PORT` environment variable.

---

## 3. Step-by-Step Deployment Instructions

### Method A: Blueprint (Recommended - 1 Click)
1. Push your updated code to your GitHub/GitLab repository:
   ```bash
   git add .
   git commit -m "feat: configure render deployment and backend build"
   git push origin main
   ```
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Connect your DFarm repository.
5. Render will detect `render.yaml` automatically.
6. Fill in the requested secret environment variables (see Section 4 below).
7. Click **Apply**. Your backend will build and go live!

---

### Method B: Manual Web Service Setup
If you prefer configuring via the Render UI:
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the following fields:
   | Field | Value |
   |---|---|
   | **Name** | `dfarm-backend` (or your choice) |
   | **Region** | `Singapore` (or closest to your users) |
   | **Branch** | `main` |
   | **Root Directory** | *(leave blank)* |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install && npm run build:backend` |
   | **Start Command** | `npm run start:backend` |
   | **Instance Type** | `Free` |

4. Under **Advanced Settings**:
   - **Health Check Path**: `/health/live`
   - **Auto-Deploy**: `Yes`

---

## 4. Environment Variables Required on Render

In the Render dashboard under **Environment**:

| Variable Name | Required | Example / Recommended Value |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `NODE_VERSION` | Yes | `22.14.0` |
| `PORT` | Yes | `10000` (Render defaults to 10000) |
| `CORS_ALLOWED_ORIGINS` | Yes | `*` (or your frontend URLs separated by commas) |
| `SUPABASE_URL` | Yes | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | `your-supabase-anon-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `your-supabase-service-role-key` |
| `DATABASE_URL` | Yes | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | Yes | Strong random 32+ char string |
| `DEFAULT_PHONE_REGION` | No | `IN` |
| `ADMIN_OTP_SECRET` | No | Strong random 32+ char string |

---

## 5. Verifying Your Live Backend

Once Render finishes deploying (marked with a green checkmark):
1. **Visit your root URL**:
   ```
   https://<your-service-name>.onrender.com/
   ```
   Response:
   ```json
   {
     "success": true,
     "service": "DFarm Smart Dairy API",
     "status": "UP",
     "health": "/health/live"
   }
   ```
2. **Check health status**:
   ```
   https://<your-service-name>.onrender.com/health/live
   ```
