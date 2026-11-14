export const DATABASE_NAME = 'dfarm_collection.db';
export const DATABASE_VERSION = 2;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS cached_customers (
    customer_id TEXT PRIMARY KEY,
    farmer_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    primary_center_id TEXT NOT NULL,
    status TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    is_revoked INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    permitted_categories TEXT DEFAULT 'COW,BUFFALO',
    rfid_card_id TEXT
);

CREATE TABLE IF NOT EXISTS cached_face_templates (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    crypto_nonce TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    encrypted_embedding TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES cached_customers (customer_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cached_rate_cells (
    id TEXT PRIMARY KEY,
    rate_chart_version_id TEXT NOT NULL,
    fat_percentage REAL NOT NULL,
    snf_percentage REAL NOT NULL,
    rate_per_unit REAL NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_collection_sessions (
    session_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    center_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    milk_category TEXT NOT NULL,
    identification_method TEXT NOT NULL,
    intake_sequence_uuid TEXT NOT NULL,
    session_state TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS local_milk_collections (
    collection_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    center_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    milk_category TEXT NOT NULL,
    net_weight REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'KG',
    fat_percentage REAL NOT NULL,
    snf_percentage REAL NOT NULL,
    applied_rate_per_unit REAL NOT NULL,
    rate_chart_version_id TEXT,
    total_amount REAL NOT NULL,
    weight_source TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',
    quality_source TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',
    idempotency_key TEXT UNIQUE NOT NULL,
    sync_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    synced_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES local_collection_sessions (session_id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS sync_journal (
    event_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    payload_json TEXT NOT NULL,
    sync_status TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS revocation_tombstones (
    tombstone_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reason TEXT,
    revoked_at INTEGER NOT NULL,
    applied_locally INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device_sync_state (
    device_id TEXT PRIMARY KEY,
    last_sync_timestamp INTEGER NOT NULL,
    server_customer_cursor INTEGER NOT NULL DEFAULT 0,
    server_tombstone_cursor INTEGER NOT NULL DEFAULT 0,
    max_offline_hours INTEGER NOT NULL DEFAULT 72,
    device_status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_cached_cust_code ON cached_customers (farmer_code);
CREATE INDEX IF NOT EXISTS idx_cached_face_cust ON cached_face_templates (customer_id);
CREATE INDEX IF NOT EXISTS idx_journal_status ON sync_journal (sync_status);
CREATE INDEX IF NOT EXISTS idx_pending_receipts_col ON pending_receipts (collection_id);
`;

export const MIGRATION_V1_TO_V2_SQL = `
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
`;
