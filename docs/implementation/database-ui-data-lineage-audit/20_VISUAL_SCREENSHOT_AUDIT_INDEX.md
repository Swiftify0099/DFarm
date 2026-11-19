# DFARM — VISUAL SCREENSHOT AUDIT INDEX
## LIVE RUNTIME UI CAPTURES & FIELD-LEVEL VISUAL EVIDENCE

**Audit Reference:** `DFARM-AUDIT-SCREENSHOTS-001`  
**Screenshot Directory:** `docs/implementation/database-ui-audit/screenshots/`  
**Date:** 2026-11-18  

---

### 1. Visual Capture Inventory & Screen Index

| Screenshot File Name | Target Application | Module / Screen Name | Viewport Dimensions | Capture Mechanism | Visual Data Regions Identified |
|---|---|---|---|---|---|
| `hub_platform_overview_loaded.png` | Platform Hub | Unified Navigation Portal | 1440x900 | Headless Edge / Dev-Server (3000) | App links, port routing, system status |
| `dairy_admin_portal_login_state.png` | Dairy Admin Web | Administrative Login | 1440x900 | Headless Edge / Vite Dist (5174 via 3000) | Mobile input, OTP prompt, Brand logo |
| `super_admin_portal_login_state.png` | Super Admin Web | Platform Admin Login | 1440x900 | Headless Edge / Vite Dist (5173 via 3000) | Root admin login shell |
| `collection_app_terminal_login_state.png`| Collection App | Kiosk Terminal Login | 1440x900 | Headless Edge / Vite Dist (5175 via 3000) | Terminal operator login shell |
| `customer_app_web_entry_state.png` | Customer App | Farmer Onboarding Splash | 1440x900 | Headless Edge / Web Dist (8081 via 3000) | Mobile splash, welcome cards |

---

### 2. Lineage Linking for Live Visual Captures

Each screenshot corresponds to active routes verified during the audit:
1. `hub_platform_overview_loaded.png` -> `scripts/dev-server.js` serving proxy routing.
2. `dairy_admin_portal_login_state.png` -> `apps/dfarm-dairy-admin/src/pages/auth/Login.tsx` connecting to `POST /api/v1/auth/admin/otp/verify`.
3. `super_admin_portal_login_state.png` -> `apps/dfarm-super-admin/src/features/auth/LoginPage.tsx` connecting to `POST /api/v1/auth/admin/otp/verify`.
4. `collection_app_terminal_login_state.png` -> `apps/dfarm-collection-app/src/pages/auth/Login.tsx` connecting to `POST /api/v1/auth/operator/login`.
5. `customer_app_web_entry_state.png` -> `apps/dfarm-customer-app/src/app/index.tsx` initializing session token inspection.
