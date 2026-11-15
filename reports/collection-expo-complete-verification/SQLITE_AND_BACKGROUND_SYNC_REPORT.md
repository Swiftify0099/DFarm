# Offline SQLite Database & Background Sync Engine Report
## Schema Parity, V1-V2 Migrations, Outbox Sync Journal, Revocation Guard & Daemon Worker

**Document Version**: 1.0.0  
**Verification Date**: 2026-11-15  
**Target Modules**: `apps/collection-expo/src/database/` & `domain/sync/`  
**Reference Kotlin Modules**: `CollectionDatabaseHelper.kt`, `OfflineSyncQueue.kt`, `OfflineRevocationGuard.kt`, `DFarmSyncWorker.kt`  
**Verification Status**: **FIXED AND VERIFIED**

---

### 1. Database Architecture & Schema Parity

The Expo application operates on a local SQLite database (`dfarm_collection.db`) matching the Kotlin Room/SQLite architecture:

| Table Name | Purpose | Primary Key | Key Foreign Keys & Indexes |
| :--- | :--- | :--- | :--- |
| **`cached_customers`** | Offline farmer registry cache | `customer_id` | Index: `idx_cached_cust_code` (`farmer_code`) |
| **`cached_face_templates`** | Encrypted 512D biometric templates | `id` | FK: `customer_id` $\to$ `cached_customers` (CASCADE); Index: `idx_cached_face_cust` |
| **`cached_rate_cells`** | Active rate grid slab cells | `id` | `rate_chart_version_id`, `fat_percentage`, `snf_percentage` |
| **`local_collection_sessions`**| Session state machine records | `session_id` | `customer_id`, `intake_sequence_uuid` |
| **`local_milk_collections`** | Complete intake transactions | `collection_id` | `idempotency_key` (UNIQUE), FK: `session_id` $\to$ `local_collection_sessions` |
| **`pending_receipts`** | Thermal slip print queue | `receipt_id` | FK: `collection_id` $\to$ `local_milk_collections`; Index: `idx_pending_receipts_col` |
| **`sync_journal`** | Durable outbox event queue | `event_id` | `idempotency_key` (UNIQUE); Index: `idx_journal_status` (`sync_status`) |
| **`revocation_tombstones`** | Revoked customer & card markers | `tombstone_id` | `entity_type`, `entity_id`, `revoked_at` |
| **`device_sync_state`** | Monotonic cursors & timestamps | `device_id` | `server_customer_cursor`, `server_tombstone_cursor` |

---

### 2. V1 to V2 Schema Migration

The migration DDL safely upgrades legacy offline databases without data loss:
```sql
ALTER TABLE local_milk_collections ADD COLUMN unit TEXT NOT NULL DEFAULT 'KG';
ALTER TABLE local_milk_collections ADD COLUMN rate_chart_version_id TEXT;
ALTER TABLE local_milk_collections ADD COLUMN weight_source TEXT NOT NULL DEFAULT 'MANUAL_ENTRY';
ALTER TABLE local_milk_collections ADD COLUMN quality_source TEXT NOT NULL DEFAULT 'MANUAL_ENTRY';

CREATE TABLE IF NOT EXISTS pending_receipts (
    receipt_id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    receipt_json TEXT NOT NULL,
    printed_at INTEGER,
    print_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES local_milk_collections (collection_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_col ON pending_receipts (collection_id);
```

---

### 3. Synchronization Pipeline & Monotonic Cursors

```
               [ Upstream Sync: Outbox Push ]
                              │
  [ SQLite `sync_journal` (status = 'PENDING_SYNC') ]
                              │
                              ▼
                POST /api/v1/sync/push (Batch)
                              │
           ├── Network Success ──▶ UPDATE `sync_journal` SET status = 'SYNCED'
           └── Network Failure ──▶ Increments retry_count, stores last_error

                              │
               [ Downstream Sync: Changes Pull ]
                              │
                GET /api/v1/sync/pull?cursor=...
                              │
                              ▼
    1. Apply incremental customer updates
    2. Apply new approved rate versions and cells
    3. Insert newly revoked tombstones
    4. Advance `server_customer_cursor` and `server_tombstone_cursor`
    5. POST /api/v1/sync/acknowledge
```

---

### 4. Offline Revocation Guard & Freshness Window

1. **Tombstone Enforcement**:
   When an admin revokes a stolen RFID card or deactivates a farmer, the tombstone synchronizes downstream.
   `OfflineRevocationGuard.assertCustomerActive` immediately blocks local collections even while disconnected from the Internet (`DeviceRevokedException` / `CustomerRevokedException`).
2. **72-Hour Freshness Window**:
   If the device has not synchronized with the backend for $> 72$ hours:
   $$\text{hoursSinceSync} = \frac{\text{Now} - \text{lastSyncTimestamp}}{3600 \times 1000} > 72$$
   The terminal enters safety lock with `OFFLINE_FRESHNESS_EXPIRED` until an upstream sync succeeds.

---

### 5. Automated Test Evidence

All 7 offline database and sync tests pass in `database-and-sync.test.ts`:
```
TAP version 13
# Subtest: Offline SQLite Database & Sync Engine Test Suite
    ok 1 - 1. Database Initialization & Schema Parity: All 9 tables exist (PASS)
    ok 2 - 2. Customer Cache: Insert, Retrieve & Search by Farmer Code / RFID (PASS)
    ok 3 - 3. Face Template Cache: Encrypted envelope persistence & deletion (PASS)
    ok 4 - 4. Rate Cell Cache: Matrix persistence & lookup (PASS)
    ok 5 - 5. Collection Session & Outbox Sync Queue: Atomic journal commit (PASS)
    ok 6 - 6. Offline Revocation Guard: Blocks revoked customer / card via Tombstones (PASS)
    ok 7 - 7. Offline Revocation Guard: Enforces 72h offline ceiling (PASS)
```

**Conclusion**: SQLite persistence, outbox journaling, and offline security guards fully replicate Kotlin Room capabilities.
