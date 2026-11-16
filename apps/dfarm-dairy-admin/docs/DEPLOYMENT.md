# DFarm Dairy Admin Web — Deployment & Operations Guide

## 1. Prerequisites

- **Node.js:** v18.0.0 or higher (v20+ / v22 LTS recommended)
- **Package Manager:** npm v9+ or pnpm
- **Modern Web Browser:** Chrome, Chromium, Firefox, Edge, or Safari with WebAssembly and CSS `@theme` support.

---

## 2. Local Development Setup

```bash
# Navigate to project directory
cd dfarm-dairy-admin

# Install all runtime and development dependencies
npm install

# Start Vite live development server
npm run dev
```

The application will be accessible at `http://localhost:5173`.

### Demo Credentials for Verification
- **Registered Mobile:** `9876543210` (Primary Dairy Admin: Rajesh Patel)
- **OTP Dispatch:** Upon clicking "Send Authentication OTP", the authoritative backend server issues a genuine 6-digit OTP code displayed in the preview banner.
- Enter the 6-digit OTP to authenticate and access the Gokul Dairy Cooperative management console.

---

## 3. Automated Test Execution

```bash
# Run Vitest automated test suite once
npm run test

# Run tests in continuous watch mode
npm run test:watch
```

---

## 4. Production Build & Static Asset Generation

```bash
# Compile TypeScript with strict mode and build production bundle
npm run build

# Preview production build locally
npm run preview
```

The production output is generated in `dist/`. The bundle is purely static HTML, CSS, and JavaScript, suitable for high-performance delivery via:
- Cloudflare Pages / AWS CloudFront + S3
- NGINX / Caddy Web Server
- Google Cloud Storage / Firebase Hosting
- Docker container with NGINX Alpine

### Example NGINX Configuration for SPA Routing
```nginx
server {
    listen 80;
    server_name dairy.dfarm.in;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Caching for immutable static assets
    location ~* \.(?:css|js|svg|png|jpg|webp|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```
