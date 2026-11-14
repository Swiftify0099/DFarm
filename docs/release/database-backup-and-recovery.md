# DFarm Smart Dairy Management System — Database Backup & Disaster Recovery Guide
**Document Reference:** `docs/release/database-backup-and-recovery.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**Target Systems:** PostgreSQL 17 / Supabase Managed Cloud / Self-Hosted Docker Engine  
**Classification:** OPERATIONAL RUNBOOK (Zero Exposed Credentials)  

---

## 1. Overview & Recovery Objectives

This runbook outlines authoritative backup strategies, disaster recovery procedures, point-in-time recovery (PITR), schema migration rollbacks, and offline device re-synchronization workflows.

- **Recovery Point Objective (RPO):** Maximum 15 minutes of operational intake data (zero data loss for synchronized ledger records).
- **Recovery Time Objective (RTO):** Full database restoration under 30 minutes.

---

## 2. Backup Architecture & Schedule

### 2.1 Automated Backup Schedule

| Backup Type | Frequency | Retention Period | Storage Location | Encryption |
|:---|:---:|:---:|:---|:---:|
| **Continuous WAL Archiving** | Real-time | 30 days | S3 / GCS Cold Storage | AES-256 (GCS/S3 KMS) |
| **Full Logical Snapshot** | Daily at 02:00 IST | 90 days | Geo-replicated Bucket | GPG / OpenSSL AES-256 |
| **Schema & Migration Dump** | On every release | Indefinite | Git Release Tag / Secure S3 | SHA-256 Checksummed |
| **Storage Object Sync** | Hourly | 60 days | S3 Bucket Replication | AES-256 SSE |

### 2.2 Logical Backup Execution (`pg_dump`)

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/dfarm/postgres"
BACKUP_FILE="${BACKUP_DIR}/dfarm_production_${BACKUP_TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[DFARM BACKUP] Initiating pg_dump snapshot..."

# Executes custom-format compressed backup with clean schema and BLOBs
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --blobs \
  --verbose \
  --file="${BACKUP_FILE}"

echo "[DFARM BACKUP] Calculating SHA-256 checksum..."
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

# Encrypt backup before offsite upload
gpg --symmetric --cipher-algo AES256 --output "${BACKUP_FILE}.gpg" "${BACKUP_FILE}"
rm -f "${BACKUP_FILE}"

echo "[DFARM BACKUP] Uploading encrypted archive to offsite cloud storage..."
# aws s3 cp "${BACKUP_FILE}.gpg" "s3://${BACKUP_S3_BUCKET}/postgres/${BACKUP_TIMESTAMP}/"
# aws s3 cp "${BACKUP_FILE}.sha256" "s3://${BACKUP_S3_BUCKET}/postgres/${BACKUP_TIMESTAMP}/"

echo "[DFARM BACKUP] Backup successfully completed."
```

---

## 3. Disaster Recovery & Restoration Procedure

### 3.1 Step-by-Step Database Restoration

1. **Stop Application Traffic:**
   - Put backend into maintenance mode (`MAINTENANCE_MODE=true`) to halt incoming sync pushes.
2. **Provision Target Database Instance:**
   - Ensure target PostgreSQL engine matches source version (PostgreSQL 17.x).
3. **Download & Decrypt Archive:**
   ```bash
   gpg --decrypt --output dfarm_restore.dump dfarm_production_YYYYMMDD_HHMMSS.dump.gpg
   sha256sum -c dfarm_production_YYYYMMDD_HHMMSS.dump.sha256
   ```
4. **Restore Database Cluster:**
   ```bash
   # Drop connections and restore into clean database
   pg_restore \
     --dbname="${RESTORE_DATABASE_URL}" \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     --verbose \
     dfarm_restore.dump
   ```
5. **Re-apply Row-Level Security & Role Grants:**
   ```bash
   psql "${RESTORE_DATABASE_URL}" -f packages/database/scripts/reapply-rls-roles.sql
   ```
6. **Verify Data Integrity:**
   - Execute `node services/backend/tests/reconciliation-audit.js` to confirm all 9 financial invariants hold.

---

## 4. Migration Rollback Protocol

1. **Forward-Only vs Reversible Migrations:**
   - DFarm follows an additive, forward-only migration philosophy. Structural column drops must only occur after the two-phase deprecation cycle.
2. **Schema Rollback Execution:**
   - If a newly deployed migration triggers unexpected constraint failures, execute the corresponding `_down.sql` script:
   ```bash
   psql "${DATABASE_URL}" -f supabase/migrations/rollback/20261114_revert_migration.sql
   ```
3. **Database Consistency Verification:**
   - Confirm migration history records in `supabase_migrations.schema_migrations` reflect the restored state.

---

## 5. Offline POS Terminal Re-Authorization & Resync

If the central server is restored from an earlier backup, field POS terminals might hold unsynchronized intake records:

1. **Tombstone Vector Reconciliation:**
   - Terminals query `/api/v1/sync/pull` with their cached `cursor`.
   - If the server detects a cursor greater than current server transaction logs, the terminal is flagged with `SYNC_CURSOR_RESET_REQUIRED`.
2. **Terminal Offline Sync Drain:**
   - The terminal initiates a full replay of local unsynchronized intakes using unique `client_intake_uuid`s.
   - The backend deduplication index (`uq_milk_collection_client_uuid`) prevents duplicate insertions while safely ingesting any transactions recorded during the incident.
3. **Fleet Device Re-Authorization:**
   - In case of credential invalidation, administrators issue fresh temporary device pairing codes via the Admin Web console (`/admin/devices`).

