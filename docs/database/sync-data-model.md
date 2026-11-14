# DFarm: Edge-to-Cloud Synchronization Data Model
**Phase 03 of 20: Offline Replication & Idempotency Specification**

---

## 1. Synchronization Architecture & Topologies

Edge devices operate autonomously against an embedded **SQLite** database, executing collection intakes and farmer registrations without an internet connection. When connectivity is established, a bi-directional replication protocol synchronizes transactions with the central **Supabase PostgreSQL** cloud database.

```mermaid
flowchart LR
    subgraph Edge_Terminal [Edge Client Terminal (SQLite)]
        LocalApp[Intake / Registration App] --> LocalStore[(Local SQLite Database)]
        LocalStore --> SyncJournal[(sync_journal Table)]
        SyncWorker[Background Sync Worker] --> SyncJournal
    end

    subgraph Transport_Layer [Secure HTTPS Transport]
        SyncWorker <==>|Push: Unsynced Local Batches<br/>Pull: Incremental Cloud Changesets| SyncGateway[Sync Gateway (Node.js API)]
    end

    subgraph Central_Cloud [Central PostgreSQL Database]
        SyncGateway --> CloudEvents[(sync_events Log)]
        SyncGateway --> CloudTombstones[(sync_tombstones Log)]
        SyncGateway --> MasterTables[(Master & Transaction Tables)]
    end
```

---

## 2. Client-Side SQLite Schemas

### 2.1 Collection Counter Application Schema (`apps/collection-app`)

```sql
-- 1. Authorized Customer Cache (Read-only replica for intake matching)
CREATE TABLE cached_customers (
    id TEXT PRIMARY KEY,               -- Canonical customer_id (UUID string)
    farmer_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    normalized_mobile_number TEXT NOT NULL,
    status TEXT NOT NULL,              -- 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED'
    allows_cow INTEGER NOT NULL,       -- 1 = True, 0 = False
    allows_buffalo INTEGER NOT NULL,   -- 1 = True, 0 = False
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Local Biometric Matching Cache (Encrypted face embedding vectors)
CREATE TABLE cached_face_templates (
    id TEXT PRIMARY KEY,               -- face_enrollment_id (UUID string)
    customer_id TEXT NOT NULL,
    model_version_id TEXT NOT NULL,
    embedding_blob BLOB NOT NULL,      -- AES-256 encrypted vector
    embedding_iv BLOB NOT NULL,
    status TEXT NOT NULL,              -- 'ACTIVE', 'REVOKED'
    FOREIGN KEY (customer_id) REFERENCES cached_customers(id)
);

-- 3. Local RFID Assignment Cache
CREATE TABLE cached_rfid_cards (
    card_uid TEXT PRIMARY KEY,         -- Normalized uppercase hex string
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL,              -- 'ACTIVE', 'REVOKED'
    FOREIGN KEY (customer_id) REFERENCES cached_customers(id)
);

-- 4. Local Rate Chart Grid Cache
CREATE TABLE cached_rate_cells (
    id TEXT PRIMARY KEY,
    rate_chart_version_id TEXT NOT NULL,
    milk_category TEXT NOT NULL,       -- 'COW', 'BUFFALO'
    fat_percentage REAL NOT NULL,
    snf_percentage REAL NOT NULL,
    rate_per_unit REAL NOT NULL
);

-- 5. Outbound Synchronization Journal (Append-only queue)
CREATE TABLE sync_journal (
    event_id TEXT PRIMARY KEY,         -- RFC4122 v4 UUID
    device_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,         -- 'MILK_COLLECTION', 'SUPERVISOR_AUDIT'
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,             -- JSON stringified transaction
    idempotency_key TEXT NOT NULL UNIQUE,
    synced INTEGER NOT NULL DEFAULT 0, -- 0 = Pending, 1 = Synced
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_sync_journal_pending ON sync_journal(synced, created_at);
```

---

### 2.2 Customer Registration Application Schema (`apps/registration-android`)

```sql
-- Local Registration Drafts & Staged Workflow
CREATE TABLE local_registration_drafts (
    id TEXT PRIMARY KEY,               -- Local registration UUID
    canonical_customer_uuid TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    normalized_mobile_number TEXT NOT NULL,
    milk_categories TEXT NOT NULL,     -- 'COW', 'BUFFALO', 'BOTH'
    consent_granted INTEGER NOT NULL,
    face_embedding BLOB,
    face_quality_score REAL,
    rfid_card_uid TEXT,
    staged_status TEXT NOT NULL,       -- 'DRAFT', 'PENDING_FACE', 'PENDING_RFID', 'PENDING_SYNC'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

## 3. Central Cloud Synchronization Entities

### 3.1 `devices` & `device_sync_state`
Tracks registered hardware devices and high-water cursors:
- `devices`: `id`, `organization_id`, `center_id`, `device_identifier`, `device_type`, `public_key`, `status`, `last_seen_at`.
- `device_sync_state`: `id`, `device_id`, `last_upstream_sync_at`, `last_downstream_sync_at`, `downstream_cursor` (bigint).

### 3.2 `sync_events` (Downstream Cloud Event Stream)
Append-only log of changes applied on the central server for edge terminals to pull:
- `event_sequence` (`BIGSERIAL UNIQUE`): Monotonically increasing 64-bit integer cursor.
- `entity_type`: `'CUSTOMER'`, `'FACE_ENROLLMENT'`, `'RFID_CARD'`, `'RATE_CHART'`.
- `entity_id`: UUID of modified entity.
- `action`: `'INSERT'`, `'UPDATE'`, `'DELETE'`, `'RESTORE'`.
- `payload`: JSONB representation of the entity.

### 3.3 `sync_tombstones` (Immediate Edge Invalidation)
Records deleted or revoked identities so that edge devices immediately remove them from local matching indexes:
- `tombstone_sequence` (`BIGSERIAL UNIQUE`): Monotonic cursor.
- `entity_type`: `'CUSTOMER'`, `'FACE_ENROLLMENT'`, `'RFID_CARD'`.
- `entity_id`: Target UUID.
- `deleted_at`: UTC timestamp.

---

## 4. Idempotency & Multiple Legitimate Collections Rule

### 4.1 The Flawed Assumption Corrected
A common mistake in dairy software is defining idempotency as:
$$\text{Hash}(\text{customer\_id} + \text{date} + \text{shift} + \text{milk\_category})$$
This rule is **fundamentally flawed** because in real dairy operations, a farmer frequently makes **multiple legitimate deliveries** within the same shift (e.g. morning Cow delivery in trip 1, morning Buffalo delivery in trip 2, or two separate cans of cow milk from different cattle pens).

### 4.2 Approved Idempotency Engine
DFarm generates a unique `client_intake_uuid` at the collection terminal the exact second the physical delivery transaction begins:
$$\text{IdempotencyKey} = \text{SHA256}(\text{client\_intake\_uuid} + \text{device\_identifier})$$
- If network transmission fails, the sync worker **retries with the exact same `IdempotencyKey`**.
- If a farmer steps up 15 minutes later with a second container, a **new `client_intake_uuid`** is generated. Both transactions are successfully recorded without conflict.

---

## 5. Offline Recovery & Disconnection Policies

1. **Application Crash Recovery:** On app startup, the sync worker queries `SELECT * FROM sync_journal WHERE synced = 0 ORDER BY created_at ASC;` and resumes transmission. No completed transaction is ever lost in volatile memory.
2. **Freshness & Revocation Expiry Policy:**
   - If a counter terminal cannot reach the cloud for greater than `offline_sync_max_disconnection_hours` (default 72 hours), an alert banner is displayed.
   - Offline terminals **can never reactivate a deleted customer**; local updates are strictly additive for collections and reject modifications to authoritative customer statuses.

