/**
 * DFarm Registration App — SQLite-backed Registration Draft Store
 * Full parity with Kotlin RegistrationDatabaseHelper.kt using Room/SQLite.
 * Uses expo-sqlite modern async API (openDatabaseAsync / runAsync / getFirstAsync / getAllAsync).
 *
 * Database name: dfarm_registration.db
 * Database version: 1
 * WAL mode + foreign-key enforcement enabled on open.
 * Includes graceful memory store fallback for headless Node.js test runners.
 */

import { Platform } from 'react-native';
import {
  LocalRegistrationDraft,
  RegistrationSyncEvent,
  LocalSyncStatus,
} from '../types/models';
import { IRegistrationDraftStore } from './RegistrationDatabase';
import { InMemoryRegistrationDraftStore } from './InMemoryRegistrationDraftStore';

const DB_NAME = 'dfarm_registration.db';
const DB_VERSION = 1;

const CREATE_REGISTRATION_DRAFTS = `
CREATE TABLE IF NOT EXISTS registration_drafts (
  local_id                  TEXT PRIMARY KEY,
  canonical_server_id       TEXT,
  farmer_code               TEXT,
  full_name                 TEXT NOT NULL,
  mobile_number             TEXT NOT NULL,
  permitted_categories      TEXT NOT NULL,
  preferred_milk_category   TEXT NOT NULL,
  village                   TEXT NOT NULL,
  hamlet_area               TEXT,
  taluka_subdistrict        TEXT NOT NULL,
  district                  TEXT NOT NULL,
  state                     TEXT NOT NULL,
  postal_code               TEXT NOT NULL,
  bank_name                 TEXT,
  bank_account_number       TEXT,
  bank_ifsc_code            TEXT,
  bank_account_holder_name  TEXT,
  consent_obtained          INTEGER NOT NULL DEFAULT 1,
  consent_timestamp         INTEGER NOT NULL,
  face_enrolled             INTEGER NOT NULL DEFAULT 0,
  face_template_ciphertext  TEXT,
  rfid_card_number          TEXT,
  category                  TEXT NOT NULL,
  center_id                 TEXT,
  enrollment_status         TEXT NOT NULL DEFAULT 'NOT_ENROLLED',
  sync_status               TEXT NOT NULL,
  pending_sync              INTEGER NOT NULL DEFAULT 1,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  retry_count               INTEGER NOT NULL DEFAULT 0,
  conflict_reason           TEXT,
  last_sync_error           TEXT,
  version                   INTEGER NOT NULL DEFAULT 1
);
`;

const CREATE_SYNC_EVENTS = `
CREATE TABLE IF NOT EXISTS registration_sync_events (
  event_id          TEXT PRIMARY KEY,
  draft_id          TEXT NOT NULL REFERENCES registration_drafts(local_id),
  entity_type       TEXT NOT NULL,
  action            TEXT NOT NULL,
  idempotency_key   TEXT UNIQUE NOT NULL,
  payload_json      TEXT NOT NULL,
  status            TEXT NOT NULL,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_at        INTEGER NOT NULL,
  synced_at         INTEGER
);
`;

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_reg_drafts_sync_status ON registration_drafts (sync_status);
CREATE INDEX IF NOT EXISTS idx_reg_events_status ON registration_sync_events (status);
`;

function makeEventId(): string {
  return 'evt_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
}

function rowToDraft(row: Record<string, unknown>): LocalRegistrationDraft {
  let permittedCategories: string[] = ['COW'];
  try {
    if (row['permitted_categories']) {
      permittedCategories = JSON.parse(String(row['permitted_categories']));
    }
  } catch {}

  return {
    localId: String(row['local_id'] ?? ''),
    canonicalServerId: row['canonical_server_id'] != null ? String(row['canonical_server_id']) : undefined,
    farmerCode: row['farmer_code'] != null ? String(row['farmer_code']) : undefined,
    fullName: String(row['full_name'] ?? ''),
    mobileNumber: String(row['mobile_number'] ?? ''),
    permittedCategories,
    preferredMilkCategory: String(row['preferred_milk_category'] ?? 'COW'),
    village: String(row['village'] ?? ''),
    hamletArea: row['hamlet_area'] != null ? String(row['hamlet_area']) : null,
    talukaSubdistrict: String(row['taluka_subdistrict'] ?? ''),
    district: String(row['district'] ?? ''),
    state: String(row['state'] ?? 'Maharashtra'),
    postalCode: String(row['postal_code'] ?? ''),
    bankName: row['bank_name'] != null ? String(row['bank_name']) : null,
    bankAccountNumber: row['bank_account_number'] != null ? String(row['bank_account_number']) : null,
    bankIfscCode: row['bank_ifsc_code'] != null ? String(row['bank_ifsc_code']) : null,
    bankAccountHolderName: row['bank_account_holder_name'] != null ? String(row['bank_account_holder_name']) : null,
    consentObtained: Boolean(Number(row['consent_obtained'] ?? 1)),
    consentTimestamp: Number(row['consent_timestamp'] ?? Date.now()),
    faceEnrolled: Boolean(Number(row['face_enrolled'] ?? 0)),
    faceTemplateCiphertext: row['face_template_ciphertext'] != null ? String(row['face_template_ciphertext']) : null,
    rfidCardNumber: row['rfid_card_number'] != null ? String(row['rfid_card_number']) : null,
    category: row['category'] as LocalRegistrationDraft['category'],
    centerId: row['center_id'] != null ? String(row['center_id']) : undefined,
    enrollmentStatus: String(row['enrollment_status'] ?? 'NOT_ENROLLED') as LocalRegistrationDraft['enrollmentStatus'],
    syncStatus: String(row['sync_status'] ?? LocalSyncStatus.PENDING_SYNC) as LocalSyncStatus,
    pendingSync: Boolean(Number(row['pending_sync'] ?? 1)),
    createdAt: Number(row['created_at'] ?? Date.now()),
    updatedAt: Number(row['updated_at'] ?? Date.now()),
    retryCount: Number(row['retry_count'] ?? 0),
    conflictReason: row['conflict_reason'] != null ? String(row['conflict_reason']) : undefined,
    version: Number(row['version'] ?? 1),
  };
}

function rowToEvent(row: Record<string, unknown>): RegistrationSyncEvent {
  return {
    eventId: String(row['event_id'] ?? ''),
    draftId: String(row['draft_id'] ?? ''),
    entityType: String(row['entity_type'] ?? 'CUSTOMER_REGISTRATION'),
    action: String(row['action'] ?? 'INSERT'),
    idempotencyKey: String(row['idempotency_key'] ?? ''),
    payloadJson: String(row['payload_json'] ?? '{}'),
    status: String(row['status'] ?? LocalSyncStatus.PENDING_SYNC) as LocalSyncStatus,
    retryCount: Number(row['retry_count'] ?? 0),
    lastError: row['last_error'] != null ? String(row['last_error']) : null,
    createdAt: Number(row['created_at'] ?? Date.now()),
    syncedAt: row['synced_at'] != null ? Number(row['synced_at']) : null,
  };
}

export class SQLiteRegistrationDatabase implements IRegistrationDraftStore {
  private db: any = null;
  private initPromise: Promise<void> | null = null;
  private fallbackMemory = new InMemoryRegistrationDraftStore();
  private useFallback = false;

  private async getDb(): Promise<any> {
    if (this.useFallback) return null;
    if (this.db) return this.db;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          if (Platform.OS === 'web') {
            this.useFallback = true;
            return;
          }
          const modName = 'expo-sqlite';
          const SQLite = require(modName);
          if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
            const database = await SQLite.openDatabaseAsync(DB_NAME);
            await database.execAsync('PRAGMA journal_mode=WAL;');
            await database.execAsync('PRAGMA foreign_keys=ON;');

            await database.execAsync(CREATE_REGISTRATION_DRAFTS);
            await database.execAsync(CREATE_SYNC_EVENTS);
            await database.execAsync(CREATE_INDEXES);
            await database.execAsync(`PRAGMA user_version = ${DB_VERSION};`);

            this.db = database;
          } else {
            this.useFallback = true;
          }
        } catch (_err) {
          this.useFallback = true;
        }
      })();
    }

    await this.initPromise;
    return this.db;
  }

  async saveDraftAndEnqueueEvent(
    draft: LocalRegistrationDraft,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.saveDraftAndEnqueueEvent(draft, idempotencyKey, payloadJson);
    }

    const now = Date.now();
    const eventId = makeEventId();

    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO registration_drafts (
            local_id, canonical_server_id, farmer_code, full_name, mobile_number,
            permitted_categories, preferred_milk_category, village, hamlet_area,
            taluka_subdistrict, district, state, postal_code, bank_name,
            bank_account_number, bank_ifsc_code, bank_account_holder_name,
            consent_obtained, consent_timestamp, face_enrolled, face_template_ciphertext,
            rfid_card_number, category, center_id, enrollment_status, sync_status,
            pending_sync, created_at, updated_at, retry_count, conflict_reason,
            last_sync_error, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            draft.localId,
            draft.canonicalServerId ?? null,
            draft.farmerCode ?? null,
            draft.fullName,
            draft.mobileNumber,
            JSON.stringify(draft.permittedCategories || ['COW']),
            draft.preferredMilkCategory || 'COW',
            draft.village || '',
            draft.hamletArea ?? null,
            draft.talukaSubdistrict || '',
            draft.district || '',
            draft.state || 'Maharashtra',
            draft.postalCode || '',
            draft.bankName ?? null,
            draft.bankAccountNumber ?? null,
            draft.bankIfscCode ?? null,
            draft.bankAccountHolderName ?? null,
            draft.consentObtained !== false ? 1 : 0,
            draft.consentTimestamp || now,
            draft.faceEnrolled ? 1 : 0,
            draft.faceTemplateCiphertext ?? null,
            draft.rfidCardNumber ?? null,
            draft.category || 'COW',
            draft.centerId ?? null,
            draft.enrollmentStatus ?? 'NOT_ENROLLED',
            LocalSyncStatus.PENDING_SYNC,
            1,
            draft.createdAt || now,
            now,
            draft.retryCount ?? 0,
            draft.conflictReason ?? null,
            draft.lastSyncError ?? null,
            draft.version ?? 1,
          ]
        );

        await db.runAsync(
          `INSERT OR IGNORE INTO registration_sync_events (
            event_id, draft_id, entity_type, action, idempotency_key,
            payload_json, status, retry_count, last_error, created_at, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            eventId,
            draft.localId,
            'CUSTOMER_REGISTRATION',
            'INSERT',
            idempotencyKey,
            payloadJson,
            LocalSyncStatus.PENDING_SYNC,
            0,
            null,
            now,
            null,
          ]
        );
      });
      return true;
    } catch {
      return false;
    }
  }

  async getPendingSyncEvents(limit: number = 50): Promise<RegistrationSyncEvent[]> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.getPendingSyncEvents(limit);
    }

    const rows: Record<string, unknown>[] = await db.getAllAsync(
      `SELECT * FROM registration_sync_events
       WHERE status IN (?, ?)
       ORDER BY created_at ASC
       LIMIT ?;`,
      [LocalSyncStatus.PENDING_SYNC, LocalSyncStatus.RETRY_REQUIRED, limit]
    );
    return rows.map(rowToEvent);
  }

  async markEventSynced(idempotencyKey: string, canonicalId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.markEventSynced(idempotencyKey, canonicalId);
    }

    const now = Date.now();
    const eventRow: Record<string, unknown> | null = await db.getFirstAsync(
      'SELECT draft_id FROM registration_sync_events WHERE idempotency_key = ?;',
      [idempotencyKey]
    );
    if (!eventRow) return;

    const draftId = eventRow['draft_id'] as string;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE registration_sync_events
         SET status = ?, synced_at = ?
         WHERE idempotency_key = ?;`,
        [LocalSyncStatus.SYNCED, now, idempotencyKey]
      );
      await db.runAsync(
        `UPDATE registration_drafts
         SET sync_status = ?, canonical_server_id = ?, pending_sync = 0, updated_at = ?
         WHERE local_id = ?;`,
        [LocalSyncStatus.SYNCED, canonicalId, now, draftId]
      );
    });
  }

  async markEventConflict(idempotencyKey: string, conflictReason: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.markEventConflict(idempotencyKey, conflictReason);
    }

    const now = Date.now();
    const eventRow: Record<string, unknown> | null = await db.getFirstAsync(
      'SELECT draft_id FROM registration_sync_events WHERE idempotency_key = ?;',
      [idempotencyKey]
    );
    if (!eventRow) return;

    const draftId = eventRow['draft_id'] as string;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE registration_sync_events
         SET status = ?, last_error = ?
         WHERE idempotency_key = ?;`,
        [LocalSyncStatus.CONFLICT, conflictReason, idempotencyKey]
      );
      await db.runAsync(
        `UPDATE registration_drafts
         SET sync_status = ?, conflict_reason = ?, updated_at = ?
         WHERE local_id = ?;`,
        [LocalSyncStatus.CONFLICT, conflictReason, now, draftId]
      );
    });
  }

  async getDraftByLocalId(localId: string): Promise<LocalRegistrationDraft | null> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.getDraftByLocalId(localId);
    }

    const row: Record<string, unknown> | null = await db.getFirstAsync(
      'SELECT * FROM registration_drafts WHERE local_id = ?;',
      [localId]
    );
    return row ? rowToDraft(row) : null;
  }

  async getRecoverableDrafts(): Promise<LocalRegistrationDraft[]> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.getRecoverableDrafts();
    }

    const rows: Record<string, unknown>[] = await db.getAllAsync(
      `SELECT * FROM registration_drafts
       WHERE sync_status IN (?, ?, ?)
       ORDER BY updated_at DESC;`,
      [LocalSyncStatus.LOCAL_ONLY, LocalSyncStatus.PENDING_SYNC, LocalSyncStatus.RETRY_REQUIRED]
    );
    return rows.map(rowToDraft);
  }

  async clearAll(): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackMemory.clearAll();
    }

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM registration_sync_events;');
      await db.runAsync('DELETE FROM registration_drafts;');
    });
  }
}

export const registrationDb = new SQLiteRegistrationDatabase();
