import {
  CachedCustomer,
  CachedFaceTemplate,
  CachedRateCell,
  LocalCollectionSession,
  LocalMilkCollection,
  SyncJournalEvent,
  RevocationTombstone,
} from '../types';
import { CREATE_TABLES_SQL, DATABASE_NAME, DATABASE_VERSION, MIGRATION_V1_TO_V2_SQL } from './schema';

export interface ICollectionDatabase {
  saveCustomer(customer: CachedCustomer): Promise<void>;
  getCustomer(customerId: string): Promise<CachedCustomer | null>;
  searchCustomers(query: string): Promise<CachedCustomer[]>;
  getCustomerByFarmerCode(code: string): Promise<CachedCustomer | null>;
  getCustomerByRfid(rfid: string): Promise<CachedCustomer | null>;
  saveFaceTemplate(template: CachedFaceTemplate): Promise<void>;
  getActiveFaceTemplates(): Promise<CachedFaceTemplate[]>;
  deleteFaceTemplateForCustomer(customerId: string): Promise<void>;
  saveRateCell(cell: CachedRateCell): Promise<void>;
  getApplicableRate(fat: number, snf: number): Promise<number | null>;
  saveCollectionSession(session: LocalCollectionSession): Promise<void>;
  saveMilkCollectionAndEnqueueSync(
    collection: LocalMilkCollection,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean>;
  getLocalCollections(limit?: number): Promise<LocalMilkCollection[]>;
  getPendingJournalEvents(limit?: number): Promise<SyncJournalEvent[]>;
  markJournalSynced(idempotencyKey: string): Promise<void>;
  applyTombstone(tombstone: RevocationTombstone): Promise<void>;
  getLastSyncTimestamp(): Promise<number>;
  updateSyncState(
    timestamp: number,
    customerCursor: number,
    tombstoneCursor: number
  ): Promise<void>;
  getServerCursors(): Promise<[number, number]>;
}

/**
 * In-Memory Database Implementation
 * Fully mirrors Kotlin's InMemoryCollectionDatabase for tests and web/node preview.
 */
export class InMemoryCollectionDatabase implements ICollectionDatabase {
  private customers = new Map<string, CachedCustomer>();
  private templates = new Map<string, CachedFaceTemplate>();
  private rateCells = new Map<string, CachedRateCell>();
  private sessions = new Map<string, LocalCollectionSession>();
  private collections = new Map<string, LocalMilkCollection>();
  private journal = new Map<string, SyncJournalEvent>();
  private tombstones = new Map<string, RevocationTombstone>();
  private lastSyncTs: number = Date.now();
  private custCursor: number = 0;
  private tombCursor: number = 0;

  async saveCustomer(customer: CachedCustomer): Promise<void> {
    this.customers.set(customer.customerId, { ...customer });
  }

  async getCustomer(customerId: string): Promise<CachedCustomer | null> {
    return this.customers.get(customerId) || null;
  }

  async searchCustomers(query: string): Promise<CachedCustomer[]> {
    const q = query.trim().toLowerCase();
    const results: CachedCustomer[] = [];
    for (const c of this.customers.values()) {
      if (!c.isDeleted && !c.isRevoked) {
        if (
          c.farmerCode.toLowerCase().includes(q) ||
          c.fullName.toLowerCase().includes(q) ||
          c.mobileNumber.includes(q)
        ) {
          results.push({ ...c });
        }
      }
    }
    return results.sort((a, b) => a.fullName.localeCompare(b.fullName)).slice(0, 50);
  }

  async getCustomerByFarmerCode(code: string): Promise<CachedCustomer | null> {
    const target = code.trim().toLowerCase();
    for (const c of this.customers.values()) {
      if (c.farmerCode.trim().toLowerCase() === target) {
        return { ...c };
      }
    }
    return null;
  }

  async getCustomerByRfid(rfid: string): Promise<CachedCustomer | null> {
    const target = rfid.trim().toUpperCase();
    for (const c of this.customers.values()) {
      if (c.rfidCardId && c.rfidCardId.trim().toUpperCase() === target) {
        return { ...c };
      }
    }
    return null;
  }

  async saveFaceTemplate(template: CachedFaceTemplate): Promise<void> {
    this.templates.set(template.id, { ...template });
  }

  async getActiveFaceTemplates(): Promise<CachedFaceTemplate[]> {
    const results: CachedFaceTemplate[] = [];
    for (const t of this.templates.values()) {
      const cust = this.customers.get(t.customerId);
      if (
        t.status === 'ACTIVE' &&
        cust &&
        cust.status === 'ACTIVE' &&
        !cust.isDeleted &&
        !cust.isRevoked
      ) {
        results.push({ ...t });
      }
    }
    return results;
  }

  async deleteFaceTemplateForCustomer(customerId: string): Promise<void> {
    for (const [key, t] of this.templates.entries()) {
      if (t.customerId === customerId) {
        this.templates.delete(key);
      }
    }
  }

  async saveRateCell(cell: CachedRateCell): Promise<void> {
    this.rateCells.set(cell.id, { ...cell });
  }

  async getApplicableRate(fat: number, snf: number): Promise<number | null> {
    for (const cell of this.rateCells.values()) {
      if (
        Math.abs(cell.fatPercentage - fat) < 0.001 &&
        Math.abs(cell.snfPercentage - snf) < 0.001
      ) {
        return cell.ratePerUnit;
      }
    }
    return null;
  }

  async saveCollectionSession(session: LocalCollectionSession): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async saveMilkCollectionAndEnqueueSync(
    collection: LocalMilkCollection,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean> {
    this.collections.set(collection.collectionId, { ...collection });
    const eventId =
      'evt_' + Math.random().toString(36).substring(2, 10) + Date.now();
    this.journal.set(idempotencyKey, {
      eventId,
      entityType: 'MILK_COLLECTION',
      entityId: collection.collectionId,
      action: 'INSERT',
      idempotencyKey,
      payloadJson,
      syncStatus: 'PENDING_SYNC',
      retryCount: 0,
      createdAt: Date.now(),
    });
    return true;
  }

  async getLocalCollections(limit = 100): Promise<LocalMilkCollection[]> {
    return Array.from(this.collections.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getPendingJournalEvents(limit = 50): Promise<SyncJournalEvent[]> {
    return Array.from(this.journal.values())
      .filter((e) => e.syncStatus === 'PENDING_SYNC' || e.syncStatus === 'RETRY_REQUIRED')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async markJournalSynced(idempotencyKey: string): Promise<void> {
    const j = this.journal.get(idempotencyKey);
    if (j) {
      j.syncStatus = 'SYNCED';
      j.syncedAt = Date.now();
    }
    for (const col of this.collections.values()) {
      if (col.idempotencyKey === idempotencyKey) {
        col.syncStatus = 'SYNCED';
        col.syncedAt = Date.now();
      }
    }
  }

  async applyTombstone(tombstone: RevocationTombstone): Promise<void> {
    this.tombstones.set(tombstone.tombstoneId, { ...tombstone });
    if (tombstone.entityType === 'CUSTOMER') {
      const cust = this.customers.get(tombstone.entityId);
      if (cust) {
        cust.status = 'REVOKED';
        cust.isDeleted = true;
        cust.isRevoked = true;
        cust.updatedAt = Date.now();
      }
      await this.deleteFaceTemplateForCustomer(tombstone.entityId);
    }
  }

  async getLastSyncTimestamp(): Promise<number> {
    return this.lastSyncTs;
  }

  async updateSyncState(
    timestamp: number,
    customerCursor: number,
    tombstoneCursor: number
  ): Promise<void> {
    this.lastSyncTs = timestamp;
    this.custCursor = customerCursor;
    this.tombCursor = tombstoneCursor;
  }

  async getServerCursors(): Promise<[number, number]> {
    return [this.custCursor, this.tombCursor];
  }
}

/**
 * Expo SQLite Database Implementation
 * Uses expo-sqlite v15 modern async API with transactions & WAL mode.
 */
export class ExpoSqliteCollectionDatabase implements ICollectionDatabase {
  private db: any = null;
  private initPromise: Promise<void> | null = null;
  private fallbackMemory = new InMemoryCollectionDatabase();
  private useFallback = false;

  private async getDb() {
    if (this.useFallback) return null;
    if (this.db) return this.db;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const SQLite = require('expo-sqlite');
          if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
            this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);
            // WAL mode & foreign keys
            await this.db.execAsync('PRAGMA journal_mode = WAL;');
            await this.db.execAsync('PRAGMA foreign_keys = ON;');
            await this.db.execAsync(CREATE_TABLES_SQL);
            try {
              const versionRow: any = await this.db.getFirstAsync('PRAGMA user_version;');
              const curVer = versionRow ? Number(versionRow['user_version'] || 0) : 0;
              if (curVer < DATABASE_VERSION) {
                try {
                  await this.db.execAsync(MIGRATION_V1_TO_V2_SQL);
                } catch (_migrationErr) {
                  // Ignore if columns already added
                }
                await this.db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
              }
            } catch (_vErr) {}
          } else {
            this.useFallback = true;
          }
        } catch (_e) {
          this.useFallback = true;
        }
      })();
    }

    await this.initPromise;
    return this.db;
  }

  async saveCustomer(customer: CachedCustomer): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.saveCustomer(customer);

    const categoriesStr = customer.permittedCategories.join(',');
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_customers (
        customer_id, farmer_code, full_name, mobile_number, primary_center_id,
        status, is_deleted, is_revoked, version, updated_at, permitted_categories, rfid_card_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        customer.customerId,
        customer.farmerCode,
        customer.fullName,
        customer.mobileNumber,
        customer.primaryCenterId,
        customer.status,
        customer.isDeleted ? 1 : 0,
        customer.isRevoked ? 1 : 0,
        customer.version,
        customer.updatedAt,
        categoriesStr,
        customer.rfidCardId || null,
      ]
    );
  }

  async getCustomer(customerId: string): Promise<CachedCustomer | null> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getCustomer(customerId);

    const row = await db.getFirstAsync(
      'SELECT * FROM cached_customers WHERE customer_id = ?;',
      [customerId]
    );
    return row ? this.mapCustomerRow(row) : null;
  }

  async searchCustomers(query: string): Promise<CachedCustomer[]> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.searchCustomers(query);

    const q = `%${query.trim()}%`;
    const rows = await db.getAllAsync(
      `SELECT * FROM cached_customers
       WHERE is_deleted = 0 AND is_revoked = 0
       AND (farmer_code LIKE ? OR full_name LIKE ? OR mobile_number LIKE ?)
       ORDER BY full_name ASC LIMIT 50;`,
      [q, q, q]
    );
    return rows.map((r: any) => this.mapCustomerRow(r));
  }

  async getCustomerByFarmerCode(code: string): Promise<CachedCustomer | null> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getCustomerByFarmerCode(code);

    const row = await db.getFirstAsync(
      'SELECT * FROM cached_customers WHERE farmer_code = ?;',
      [code.trim()]
    );
    return row ? this.mapCustomerRow(row) : null;
  }

  async getCustomerByRfid(rfid: string): Promise<CachedCustomer | null> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getCustomerByRfid(rfid);

    const row = await db.getFirstAsync(
      'SELECT * FROM cached_customers WHERE rfid_card_id = ?;',
      [rfid.trim()]
    );
    return row ? this.mapCustomerRow(row) : null;
  }

  async saveFaceTemplate(template: CachedFaceTemplate): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.saveFaceTemplate(template);

    await db.runAsync(
      `INSERT OR REPLACE INTO cached_face_templates (
        id, customer_id, model_version, crypto_nonce, auth_tag, encrypted_embedding, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        template.id,
        template.customerId,
        template.modelVersion,
        template.cryptoNonce,
        template.authTag,
        template.encryptedEmbedding,
        template.status,
        template.updatedAt,
      ]
    );
  }

  async getActiveFaceTemplates(): Promise<CachedFaceTemplate[]> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getActiveFaceTemplates();

    const rows = await db.getAllAsync(
      `SELECT f.* FROM cached_face_templates f
       JOIN cached_customers c ON f.customer_id = c.customer_id
       WHERE f.status = 'ACTIVE' AND c.status = 'ACTIVE' AND c.is_deleted = 0 AND c.is_revoked = 0;`
    );
    return rows.map((r: any) => ({
      id: r.id,
      customerId: r.customer_id,
      modelVersion: r.model_version,
      cryptoNonce: r.crypto_nonce,
      authTag: r.auth_tag,
      encryptedEmbedding: r.encrypted_embedding,
      status: r.status,
      updatedAt: Number(r.updated_at),
    }));
  }

  async deleteFaceTemplateForCustomer(customerId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.deleteFaceTemplateForCustomer(customerId);

    await db.runAsync('DELETE FROM cached_face_templates WHERE customer_id = ?;', [
      customerId,
    ]);
  }

  async saveRateCell(cell: CachedRateCell): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.saveRateCell(cell);

    await db.runAsync(
      `INSERT OR REPLACE INTO cached_rate_cells (
        id, rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        cell.id,
        cell.rateChartVersionId,
        cell.fatPercentage,
        cell.snfPercentage,
        cell.ratePerUnit,
        cell.updatedAt,
      ]
    );
  }

  async getApplicableRate(fat: number, snf: number): Promise<number | null> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getApplicableRate(fat, snf);

    const row: any = await db.getFirstAsync(
      'SELECT rate_per_unit FROM cached_rate_cells WHERE fat_percentage = ? AND snf_percentage = ? LIMIT 1;',
      [fat, snf]
    );
    return row ? Number(row.rate_per_unit) : null;
  }

  async saveCollectionSession(session: LocalCollectionSession): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.saveCollectionSession(session);

    await db.runAsync(
      `INSERT OR REPLACE INTO local_collection_sessions (
        session_id, customer_id, center_id, device_id, business_date, shift_type,
        milk_category, identification_method, intake_sequence_uuid, session_state, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        session.sessionId,
        session.customerId,
        session.centerId,
        session.deviceId,
        session.businessDate,
        session.shiftType,
        session.milkCategory,
        session.identificationMethod,
        session.intakeSequenceUuid,
        session.sessionState,
        session.startedAt,
        session.completedAt || null,
      ]
    );
  }

  async saveMilkCollectionAndEnqueueSync(
    collection: LocalMilkCollection,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean> {
    const db = await this.getDb();
    if (!db)
      return this.fallbackMemory.saveMilkCollectionAndEnqueueSync(
        collection,
        idempotencyKey,
        payloadJson
      );

    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO local_milk_collections (
            collection_id, session_id, customer_id, center_id, business_date, shift_type,
            milk_category, net_weight, fat_percentage, snf_percentage, applied_rate_per_unit,
            total_amount, idempotency_key, sync_status, created_at, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            collection.collectionId,
            collection.sessionId,
            collection.customerId,
            collection.centerId,
            collection.businessDate,
            collection.shiftType,
            collection.milkCategory,
            collection.netWeight,
            collection.fatPercentage,
            collection.snfPercentage,
            collection.appliedRatePerUnit,
            collection.totalAmount,
            idempotencyKey,
            'PENDING_SYNC',
            collection.createdAt,
            null,
          ]
        );

        const eventId =
          'evt_' + Math.random().toString(36).substring(2, 10) + Date.now();
        await db.runAsync(
          `INSERT OR REPLACE INTO sync_journal (
            event_id, entity_type, entity_id, action, idempotency_key, payload_json,
            sync_status, retry_count, last_error, created_at, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            eventId,
            'MILK_COLLECTION',
            collection.collectionId,
            'INSERT',
            idempotencyKey,
            payloadJson,
            'PENDING_SYNC',
            0,
            null,
            Date.now(),
            null,
          ]
        );
      });
      return true;
    } catch (_e) {
      return false;
    }
  }

  async getLocalCollections(limit = 100): Promise<LocalMilkCollection[]> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getLocalCollections(limit);

    const rows = await db.getAllAsync(
      'SELECT * FROM local_milk_collections ORDER BY created_at DESC LIMIT ?;',
      [limit]
    );
    return rows.map((r: any) => ({
      collectionId: r.collection_id,
      sessionId: r.session_id,
      customerId: r.customer_id,
      centerId: r.center_id,
      businessDate: r.business_date,
      shiftType: r.shift_type,
      milkCategory: r.milk_category,
      netWeight: Number(r.net_weight),
      fatPercentage: Number(r.fat_percentage),
      snfPercentage: Number(r.snf_percentage),
      appliedRatePerUnit: Number(r.applied_rate_per_unit),
      totalAmount: Number(r.total_amount),
      idempotencyKey: r.idempotency_key,
      syncStatus: r.sync_status,
      createdAt: Number(r.created_at),
      syncedAt: r.synced_at ? Number(r.synced_at) : null,
    }));
  }

  async getPendingJournalEvents(limit = 50): Promise<SyncJournalEvent[]> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getPendingJournalEvents(limit);

    const rows = await db.getAllAsync(
      `SELECT * FROM sync_journal
       WHERE sync_status IN ('PENDING_SYNC', 'RETRY_REQUIRED')
       ORDER BY created_at ASC LIMIT ?;`,
      [limit]
    );
    return rows.map((r: any) => ({
      eventId: r.event_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      idempotencyKey: r.idempotency_key,
      payloadJson: r.payload_json,
      syncStatus: r.sync_status,
      retryCount: Number(r.retry_count),
      lastError: r.last_error || null,
      createdAt: Number(r.created_at),
      syncedAt: r.synced_at ? Number(r.synced_at) : null,
    }));
  }

  async markJournalSynced(idempotencyKey: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.markJournalSynced(idempotencyKey);

    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'UPDATE sync_journal SET sync_status = ?, synced_at = ? WHERE idempotency_key = ?;',
        ['SYNCED', now, idempotencyKey]
      );
      await db.runAsync(
        'UPDATE local_milk_collections SET sync_status = ?, synced_at = ? WHERE idempotency_key = ?;',
        ['SYNCED', now, idempotencyKey]
      );
    });
  }

  async applyTombstone(tombstone: RevocationTombstone): Promise<void> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.applyTombstone(tombstone);

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO revocation_tombstones (
          tombstone_id, entity_type, entity_id, reason, revoked_at, applied_locally
        ) VALUES (?, ?, ?, ?, ?, 1);`,
        [
          tombstone.tombstoneId,
          tombstone.entityType,
          tombstone.entityId,
          tombstone.reason || null,
          tombstone.revokedAt,
        ]
      );

      if (tombstone.entityType === 'CUSTOMER') {
        await db.runAsync(
          `UPDATE cached_customers
           SET status = 'REVOKED', is_deleted = 1, is_revoked = 1, updated_at = ?
           WHERE customer_id = ?;`,
          [Date.now(), tombstone.entityId]
        );
        await db.runAsync(
          'DELETE FROM cached_face_templates WHERE customer_id = ?;',
          [tombstone.entityId]
        );
      }
    });
  }

  async getLastSyncTimestamp(): Promise<number> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getLastSyncTimestamp();

    const row: any = await db.getFirstAsync(
      'SELECT last_sync_timestamp FROM device_sync_state LIMIT 1;'
    );
    return row ? Number(row.last_sync_timestamp) : 0;
  }

  async updateSyncState(
    timestamp: number,
    customerCursor: number,
    tombstoneCursor: number
  ): Promise<void> {
    const db = await this.getDb();
    if (!db)
      return this.fallbackMemory.updateSyncState(
        timestamp,
        customerCursor,
        tombstoneCursor
      );

    await db.runAsync(
      `INSERT OR REPLACE INTO device_sync_state (
        device_id, last_sync_timestamp, server_customer_cursor, server_tombstone_cursor, device_status
      ) VALUES (?, ?, ?, ?, 'ACTIVE');`,
      ['DEFAULT_DEVICE', timestamp, customerCursor, tombstoneCursor]
    );
  }

  async getServerCursors(): Promise<[number, number]> {
    const db = await this.getDb();
    if (!db) return this.fallbackMemory.getServerCursors();

    const row: any = await db.getFirstAsync(
      'SELECT server_customer_cursor, server_tombstone_cursor FROM device_sync_state LIMIT 1;'
    );
    if (row) {
      return [Number(row.server_customer_cursor), Number(row.server_tombstone_cursor)];
    }
    return [0, 0];
  }

  private mapCustomerRow(r: any): CachedCustomer {
    const permRaw = r.permitted_categories;
    const permitted = permRaw ? permRaw.split(',').filter(Boolean) : ['COW', 'BUFFALO'];
    return {
      customerId: r.customer_id,
      farmerCode: r.farmer_code,
      fullName: r.full_name,
      mobileNumber: r.mobile_number,
      primaryCenterId: r.primary_center_id,
      status: r.status,
      isDeleted: r.is_deleted === 1,
      isRevoked: r.is_revoked === 1,
      version: Number(r.version),
      updatedAt: Number(r.updated_at),
      permittedCategories: permitted.length > 0 ? permitted : ['COW', 'BUFFALO'],
      rfidCardId: r.rfid_card_id || null,
    };
  }
}

export const collectionDb: ICollectionDatabase = new ExpoSqliteCollectionDatabase();
