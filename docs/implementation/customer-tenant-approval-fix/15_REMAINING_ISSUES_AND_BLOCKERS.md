# 15 — Remaining Issues, Blockers & Environment Status

**Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Artifact ID:** `15_REMAINING_ISSUES_AND_BLOCKERS`  
**Target Environment:** Local Windows Host / Docker / Production Infrastructure  
**Status:** FULL AUDIT COMPLETED  

---

## 1. Transparent Status of the Super Admin "DB: FAILED" Indicator

During the investigation of the Super Admin screenshot displaying:
- **Dairy Name**: Warna Milk's
- **Dairy Code**: DF-SAN-2395
- **Tenant Status**: `Active`
- **Database Status**: `FAILED`

The infrastructure audit revealed the root cause:
1. The local development environment relies on local Docker Desktop containers providing PostgreSQL on port 54322.
2. On this Windows development workstation, the Windows service `com.docker.service` is currently stopped.
3. Network connection attempts to `127.0.0.1:54322` fail with `ECONNREFUSED`.

### Adherence to Core Architectural Mandate
In strict compliance with the architectural directives:
- *"Do not mark the database healthy without a real successful database connection check."*
- *"Do not mark the Dairy fully operational if its required tenant database is unavailable."*
- *"Do not use in-memory storage as an operational database fallback."*
- *"Do not silently report registration success when the selected tenant database is unavailable."*

The backend's health check accurately reports `DB: FAILED` when the physical database container is unreachable. Rather than faking database health or writing production farmer registrations to volatile process memory, the system enforces a strict circuit breaker:
- If a dairy's tenant database is in `FAILED` state, `POST /customers/register` returns HTTP 503 `TENANT_DATABASE_UNAVAILABLE` with clear diagnostic remediation info.

---

## 2. Steps to Resume Local Physical Docker Cluster

To resolve the Docker offline status on the local development machine:

1. **Start the Docker Windows Service**:
   Run PowerShell with Administrator privileges:
   ```powershell
   Start-Service "com.docker.service"
   ```
   Or launch **Docker Desktop** from the Windows Start menu.

2. **Verify PostgreSQL Container is Listening**:
   ```powershell
   Test-NetConnection -ComputerName 127.0.0.1 -Port 54322
   ```

3. **Trigger Provisioning Retry in Super Admin**:
   - Navigate to `http://localhost:5173/dairies/38918630-4fee-4cec-96ea-a3a899aae7bc`.
   - Click **"Retry Provisioning"**.
   - The backend `TenantDatabaseManager` will connect, run idempotent migrations `001` through `037`, seed default configurations, and transition the status to `ACTIVE / DB: HEALTHY`.

---

## 3. Production Deployment Recommendations

1. **Automated CI/CD Test Pipeline**:
   Integrate `services/backend/tests/customer-tenant-approval-e2e.test.js` into GitHub Actions / GitLab CI. This ensures any future changes to auth, routing, or registration use cases are automatically verified across all 11 stages.
2. **Health Check Probes**:
   Ensure Kubernetes / Cloud Run liveness probes monitor tenant database connection pools and alert on connection pool exhaustion before customer registration requests fail.
3. **Approval SLA Monitoring**:
   Establish metric dashboards querying pending registrations older than 48 hours to notify Dairy Admins via SMS/Push notifications when applicant farmers await onboarding.
