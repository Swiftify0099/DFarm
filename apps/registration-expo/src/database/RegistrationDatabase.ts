/**
 * DFarm Registration App - Local Offline Drafts & Sync Journal Store
 * Full parity with Kotlin RegistrationDatabaseHelper.kt & SQLite Schema
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LocalRegistrationDraft,
  RegistrationSyncEvent,
  LocalSyncStatus,
} from '../types/models';

const STORAGE_KEY_DRAFTS = '@dfarm_registration_drafts_v1';
const STORAGE_KEY_EVENTS = '@dfarm_registration_sync_events_v1';

export interface IRegistrationDraftStore {
  saveDraftAndEnqueueEvent(
    draft: LocalRegistrationDraft,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean>;
  getPendingSyncEvents(limit?: number): Promise<RegistrationSyncEvent[]>;
  markEventSynced(idempotencyKey: string, canonicalId: string): Promise<void>;
  markEventConflict(idempotencyKey: string, conflictReason: string): Promise<void>;
  getDraftByLocalId(localId: string): Promise<LocalRegistrationDraft | null>;
  getRecoverableDrafts(): Promise<LocalRegistrationDraft[]>;
  clearAll(): Promise<void>;
}

export class PersistentRegistrationDatabase implements IRegistrationDraftStore {
  private draftsMap: Map<string, LocalRegistrationDraft> = new Map();
  private eventsMap: Map<string, RegistrationSyncEvent> = new Map();
  private isLoaded = false;

  private async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const rawDrafts = await AsyncStorage.getItem(STORAGE_KEY_DRAFTS);
      if (rawDrafts) {
        const parsed: LocalRegistrationDraft[] = JSON.parse(rawDrafts);
        parsed.forEach((d) => this.draftsMap.set(d.localId, d));
      }

      const rawEvents = await AsyncStorage.getItem(STORAGE_KEY_EVENTS);
      if (rawEvents) {
        const parsed: RegistrationSyncEvent[] = JSON.parse(rawEvents);
        parsed.forEach((e) => this.eventsMap.set(e.idempotencyKey, e));
      }
    } catch {
      // In non-async-storage environments (e.g. node tests), memory map suffices
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    try {
      const draftsArr = Array.from(this.draftsMap.values());
      await AsyncStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(draftsArr));

      const eventsArr = Array.from(this.eventsMap.values());
      await AsyncStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(eventsArr));
    } catch {
      // Memory fallback
    }
  }

  async saveDraftAndEnqueueEvent(
    draft: LocalRegistrationDraft,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean> {
    await this.load();

    const now = Date.now();
    const updatedDraft: LocalRegistrationDraft = {
      ...draft,
      syncStatus: LocalSyncStatus.PENDING_SYNC,
      createdAt: draft.createdAt || now,
      updatedAt: now,
      version: draft.version || 1,
    };
    this.draftsMap.set(updatedDraft.localId, updatedDraft);

    const eventId =
      'evt_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();

    const event: RegistrationSyncEvent = {
      eventId,
      draftId: updatedDraft.localId,
      entityType: 'CUSTOMER_REGISTRATION',
      action: 'INSERT',
      idempotencyKey,
      payloadJson,
      status: LocalSyncStatus.PENDING_SYNC,
      retryCount: 0,
      createdAt: now,
      syncedAt: null,
    };
    this.eventsMap.set(idempotencyKey, event);

    await this.persist();
    return true;
  }

  async getPendingSyncEvents(limit: number = 50): Promise<RegistrationSyncEvent[]> {
    await this.load();
    const list = Array.from(this.eventsMap.values()).filter(
      (e) =>
        e.status === LocalSyncStatus.PENDING_SYNC ||
        e.status === LocalSyncStatus.RETRY_REQUIRED
    );
    list.sort((a, b) => a.createdAt - b.createdAt);
    return list.slice(0, limit);
  }

  async markEventSynced(idempotencyKey: string, canonicalId: string): Promise<void> {
    await this.load();
    const event = this.eventsMap.get(idempotencyKey);
    if (!event) return;

    const now = Date.now();
    event.status = LocalSyncStatus.SYNCED;
    event.syncedAt = now;

    const draft = this.draftsMap.get(event.draftId);
    if (draft) {
      draft.syncStatus = LocalSyncStatus.SYNCED;
      draft.canonicalServerId = canonicalId;
      draft.updatedAt = now;
    }

    await this.persist();
  }

  async markEventConflict(idempotencyKey: string, conflictReason: string): Promise<void> {
    await this.load();
    const event = this.eventsMap.get(idempotencyKey);
    if (!event) return;

    const now = Date.now();
    event.status = LocalSyncStatus.CONFLICT;
    event.lastError = conflictReason;

    const draft = this.draftsMap.get(event.draftId);
    if (draft) {
      draft.syncStatus = LocalSyncStatus.CONFLICT;
      draft.conflictReason = conflictReason;
      draft.updatedAt = now;
    }

    await this.persist();
  }

  async getDraftByLocalId(localId: string): Promise<LocalRegistrationDraft | null> {
    await this.load();
    return this.draftsMap.get(localId) || null;
  }

  async getRecoverableDrafts(): Promise<LocalRegistrationDraft[]> {
    await this.load();
    const recoverableStatuses = [
      LocalSyncStatus.LOCAL_ONLY,
      LocalSyncStatus.PENDING_SYNC,
      LocalSyncStatus.RETRY_REQUIRED,
    ];
    return Array.from(this.draftsMap.values())
      .filter((d) => recoverableStatuses.includes(d.syncStatus))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async clearAll(): Promise<void> {
    this.draftsMap.clear();
    this.eventsMap.clear();
    await this.persist();
  }
}

export const registrationDb = new PersistentRegistrationDatabase();
