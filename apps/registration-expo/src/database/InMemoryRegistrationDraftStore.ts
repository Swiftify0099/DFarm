/**
 * DFarm Registration App - In-Memory Draft Store
 * Parity with Kotlin InMemoryRegistrationDraftStore (used in OfflineRegistrationSyncTest)
 */

import {
  LocalRegistrationDraft,
  RegistrationSyncEvent,
  LocalSyncStatus,
} from '../types/models';
import { IRegistrationDraftStore } from './RegistrationDatabase';

export class InMemoryRegistrationDraftStore implements IRegistrationDraftStore {
  private draftsMap: Map<string, LocalRegistrationDraft> = new Map();
  private eventsMap: Map<string, RegistrationSyncEvent> = new Map();

  async saveDraftAndEnqueueEvent(
    draft: LocalRegistrationDraft,
    idempotencyKey: string,
    payloadJson: string
  ): Promise<boolean> {
    const now = Date.now();
    const updatedDraft: LocalRegistrationDraft = {
      ...draft,
      syncStatus: LocalSyncStatus.PENDING_SYNC,
      createdAt: draft.createdAt || now,
      updatedAt: now,
      version: draft.version || 1,
    };
    this.draftsMap.set(draft.localId, updatedDraft);

    const event: RegistrationSyncEvent = {
      eventId: `EVT-${draft.localId}-${now}`,
      draftId: draft.localId,
      entityType: 'CUSTOMER',
      action: 'CREATE',
      payloadJson,
      idempotencyKey,
      retryCount: 0,
      status: LocalSyncStatus.PENDING_SYNC,
      createdAt: now,
    };
    this.eventsMap.set(idempotencyKey, event);
    return true;
  }

  async getPendingSyncEvents(limit: number = 50): Promise<RegistrationSyncEvent[]> {
    const list = Array.from(this.eventsMap.values()).filter(
      (e) =>
        e.status === LocalSyncStatus.PENDING_SYNC ||
        e.status === LocalSyncStatus.RETRY_REQUIRED
    );
    list.sort((a, b) => a.createdAt - b.createdAt);
    return list.slice(0, limit);
  }

  async markEventSynced(idempotencyKey: string, canonicalId: string): Promise<void> {
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
  }

  async markEventConflict(idempotencyKey: string, conflictReason: string): Promise<void> {
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
  }

  async getDraftByLocalId(localId: string): Promise<LocalRegistrationDraft | null> {
    return this.draftsMap.get(localId) || null;
  }

  async getRecoverableDrafts(): Promise<LocalRegistrationDraft[]> {
    return Array.from(this.draftsMap.values()).filter(
      (d) => d.syncStatus === LocalSyncStatus.PENDING_SYNC
    );
  }

  async clearAll(): Promise<void> {
    this.draftsMap.clear();
    this.eventsMap.clear();
  }
}
