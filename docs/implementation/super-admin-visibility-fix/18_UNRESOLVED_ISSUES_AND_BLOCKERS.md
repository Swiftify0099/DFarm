# Module 16: Unresolved Issues, External Blockers & Forward Roadmap

**Document Reference:** `DFARM-SUPER-ADMIN-DOC-18`  
**Application Target:** `apps/dfarm-super-admin` & `services/backend`  
**Status Date:** 2026-11-18  

---

## 1. Executive Summary

This document records technical observations, external provider prerequisites, and operational dependencies identified during the Super Admin visibility and integration fix. 

**Summary Assessment:**
- **Internal System Blockers:** **Zero (0).** All 13 approved modules are fully implemented, connected, and functional.
- **Automated Test Regressions:** **Zero (0).** 93/93 tests passing across frontend and backend.
- **External Provider Prerequisites:** Detailed below for staging and production rollout.

---

## 2. External Provider Prerequisites & Status

| External Service | Operational Role | Configured Status | Runtime Behavior when Unconfigured / Staging |
|---|---|:---:|---|
| **Dove SMS / ExpertSkill** | Super Admin & Dairy Admin OTP dispatch | **CONFIGURED & ACTIVE** | Uses DLT-approved sender ID `EXTSKL` and verified template via Mobicomm API. |
| **SMTP Mail Delivery** | Activation invite emails | **CONFIGURED & ACTIVE** | Dispatches via `smtp.gmail.com:587` with verified TLS transporter. |
| **Google Maps Platform** | Interactive location picker & reverse geocoding | **CONFIGURED** | Utilizes `VITE_GOOGLE_MAPS_API_KEY`. When unconfigured, displays "Interactive Map Offline" and falls back to manual coordinate inputs. |
| **Razorpay SaaS Gateway** | AMC and SaaS license billing | **SCOPED & STANDBY** | Scoped exclusively to SaaS/AMC billing. Prohibited from touching milk procurement. In test environments, safe simulated signatures are verified. |
| **Meta WhatsApp Cloud API** | Farmer notification alerts (Future) | **STANDBY / OPTIONAL** | Displayed as optional in Platform Settings telemetry. |
| **Firebase Cloud Messaging** | Mobile push notifications (Future) | **STANDBY / OPTIONAL** | Displayed as optional in Platform Settings telemetry. |

---

## 3. Operational Best Practices & Forward Roadmap

1. **Production Deployment Sequence:**
   - Run migration `032_central_super_admin_features.sql` and `033_central_platform_policies_and_support.sql` against `dfarm_central` if running in a fresh staging environment.
   - Start backend service with environment variables `CENTRAL_DB_URL`, `JWT_SECRET`, `DOVE_SMS_API_KEY`.
   - Serve compiled frontend static assets from `apps/dfarm-super-admin/dist`.
2. **Cryptographic Key Rotation:**
   - Ensure `JWT_SECRET` and database credentials are periodically rotated via container orchestration secrets management.
3. **Audit Log Archival Policy:**
   - Because `platform_audit_logs` is append-only, implement PostgreSQL table partitioning by year (`platform_audit_logs_2026`, `platform_audit_logs_2027`) as multi-tenant scale exceeds 500,000 monthly audit events.
