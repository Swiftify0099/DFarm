# DFarm Smart Dairy Management System — Admin Web Deployment Guide
**Document Reference:** `docs/release/admin-web-deployment.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**Target:** React 18 / TypeScript / Vite Production Build  
**Auditor Roles:** React Production Engineer, Web Security Specialist  

---

## 1. Overview & Build Verification

The DFarm Admin Web Console (`apps/admin-web`) provides dairy owners, cooperative union executives, center managers, and accountants with a centralized operational, financial, and fleet management dashboard.

- **Build Toolchain:** Node.js v22 (LTS), TypeScript 5.7, Vite
- **Build Status:** **VERIFIED (Exit Code 0, Clean Output)**
- **Test Status:** 13/13 passing tests (`npm test --workspace=@dfarm/admin-web`)

---

## 2. Environment Configuration

The web application is configured through environment variables at build time:

| Environment Variable | Description | Production Example |
|:---|:---|:---|
| `VITE_API_BASE_URL` | Authoritative backend API endpoint | `https://api.dfarm.example.com/api/v1` |
| `VITE_SUPABASE_URL` | Public Supabase project endpoint | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public client anonymous key | `eyJhbGciOiJIUzI1Ni...` |
| `VITE_APP_ENV` | Target environment label | `production` |
| `VITE_ENABLE_MOCK_AUTH` | Development bypass switch | `false` (MUST BE FALSE) |

> [!WARNING]
> Under NO CIRCUMSTANCES should `SUPABASE_SERVICE_ROLE_KEY` be defined in web client `.env` files or exposed via `VITE_` variables. Audit scanning confirmed zero occurrences of administrative keys in web source files.

---

## 3. Production Build & Hosting

### 3.1 Build Execution

```bash
# Clean install and build across workspace
npm ci
npm run build --workspace=@dfarm/shared-types
npm run build --workspace=@dfarm/shared-validation
npm run build --workspace=@dfarm/admin-web
```

The compiled static assets are generated in `apps/admin-web/dist/`.

### 3.2 Web Server Configuration (Nginx Example)

```nginx
server {
    listen 443 ssl http2;
    server_name admin.dfarm.example.com;

    ssl_certificate /etc/letsencrypt/live/admin.dfarm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.dfarm.example.com/privkey.pem;

    root /var/www/dfarm-admin-web/dist;
    index index.html;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://api.dfarm.example.com https://*.supabase.co wss://*.supabase.co; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';" always;

    # Single Page Application (SPA) routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 4. Security & Routing Verification

1. **Route Protection & RBAC:**
   - Unauthenticated users attempting direct access to protected routes (`/dashboard`, `/accounting`, `/payroll`) are redirected to `/login` with redirect retention.
   - Roles without appropriate privileges are greeted with a `Forbidden (403)` banner; sensitive controls are withheld from view.
2. **Biometric Privacy Shield:**
   - Customer profile views redact raw biometric data; only status flags (`ENROLLED`, `PENDING`) and timestamp records are visible to staff.
3. **Accessibility & Responsive Layouts:**
   - Screen reader ARIA tags (`aria-label`, `role="table"`, `aria-expanded`) are implemented across all navigation drawers and data tables.
   - Tested across desktop (1920x1080), tablet (768x1024), and mobile viewports.

