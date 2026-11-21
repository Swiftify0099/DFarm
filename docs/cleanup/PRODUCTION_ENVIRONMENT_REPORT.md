# DFarm Production Environment Configuration & Deployment Guide

**Target Environment**: Linux (Ubuntu 22.04 LTS / Debian 12) / Docker Engine 24+ / Node.js 20+ LTS  
**Audit Date**: November 2026  

---

## 1. Environment Variable Inventory

### 1.1 Backend Service (`services/backend`)

| Variable Name | Required | Default / Format | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Execution environment mode |
| `PORT` | Yes | `4000` | Port on which the HTTP server listens |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dfarm` | Primary PostgreSQL database connection string |
| `JWT_SECRET` | Yes | 64-char Hex String | Secret key for signing HMAC-SHA256 bearer tokens |
| `BIOMETRIC_ENCRYPTION_KEY` | Yes | 32-byte Hex String | Encryption key for AES-256-GCM face vector encryption |
| `DOVE_SMS_API_KEY` | Yes | String | Dove SMS Gateway API authentication key |
| `DOVE_SMS_SENDER_ID` | Yes | `EXTSKL` | Approved DLT 6-character sender ID |
| `SMTP_HOST` | Yes | `smtp.gmail.com` | Outbound mail server hostname |
| `SMTP_PORT` | Yes | `587` | Outbound mail server port (STARTTLS) |
| `SMTP_USER` | Yes | `d.farm.expart@gmail.com` | System sender email address |
| `SMTP_PASSWORD` | Yes | String (App Password) | SMTP application-specific password |
| `API_BASE_URL` | Yes | `https://api.dfarm.coop/api/v1` | Publicly accessible base API route |

### 1.2 Customer Mobile App (`apps/dfarm-customer-app`)

| Variable Name | Required | Example | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | `https://api.dfarm.coop/api/v1` | Backend REST endpoint accessed by mobile devices |
| `EXPO_PUBLIC_APP_ENV` | Yes | `production` | Expo application release channel |

### 1.3 Web Applications (`dfarm-dairy-admin`, `dfarm-super-admin`, `dfarm-collection-app`)

| Variable Name | Application | Required | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | All Web Apps | Yes | Target backend REST endpoint |
| `VITE_GOOGLE_MAPS_API_KEY` | Super Admin Web | Yes | Google Maps Platform API key for cooperative geocoding |

---

## 2. Production Docker Deployment

### 2.1 Multi-Stage Backend Dockerfile

```dockerfile
# Stage 1: Build Workspace
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY services/backend/ ./services/backend/
RUN npm ci
RUN npm run build:backend

# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/backend/dist ./services/backend/dist
COPY --from=builder /app/services/backend/package.json ./services/backend/package.json

EXPOSE 4000
USER node
CMD ["node", "services/backend/dist/server.js"]
```

### 2.2 Docker Compose Topology (`docker-compose.prod.yml`)

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: dfarm
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./supabase/migrations:/docker-entrypoint-initdb.d:ro
    ports:
      - "5432:5432"

  backend:
    build:
      context: .
      dockerfile: services/backend/Dockerfile
    restart: always
    depends_on:
      - db
    env_file:
      - .env.production
    ports:
      - "4000:4000"

volumes:
  pgdata:
```

---

## 3. Database Migration Runbook

Before bringing the production services online, execute the Supabase migration sequence in strict numeric order:

```bash
# Verify migrations
npm run db:validate

# Apply migrations using psql
for file in $(ls supabase/migrations/*.sql | sort); do
  echo "Applying $file..."
  psql "$DATABASE_URL" -f "$file"
done
```

---

## 4. Health Checks & Monitoring

* **Liveness & Readiness**:
  ```http
  GET /api/v1/health
  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "success": true,
    "data": {
      "status": "UP",
      "timestamp": "2026-11-16T20:03:58.759Z"
    }
  }
  ```
* **Process Management**: In bare-metal or VM deployments, manage backend instances using `pm2`:
  ```bash
  pm2 start services/backend/dist/server.js --name dfarm-backend -i max
  ```
