/**
 * DFarm Registration App - Upstream Sync Engine
 * Parity with Kotlin RegistrationSyncEngine.kt
 */

import { IRegistrationDraftStore } from '../database/RegistrationDatabase';
import { syncApi, PushSyncResponse } from '../api/syncApi';

export interface SyncResult {
  totalProcessed: number;
  committedCount: number;
  conflictCount: number;
  duplicateCount: number;
  errorCount: number;
  isNetworkAvailable: boolean;
}

export class RegistrationSyncEngine {
  private db: IRegistrationDraftStore;

  constructor(db: IRegistrationDraftStore) {
    this.db = db;
  }

  async pushPendingRegistrations(
    deviceId: string,
    centerId: string,
    customSender?: (payload: {
      deviceId: string;
      centerId: string;
      events: any[];
    }) => Promise<{ statusCode: number; body: PushSyncResponse | null }>
  ): Promise<SyncResult> {
    const pendingEvents = await this.db.getPendingSyncEvents(25);
    if (pendingEvents.length === 0) {
      return {
        totalProcessed: 0,
        committedCount: 0,
        conflictCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        isNetworkAvailable: true,
      };
    }

    const eventsPayload = pendingEvents.map((evt) => ({
      id: evt.eventId,
      entityType: evt.entityType,
      entityId: evt.draftId,
      action: evt.action,
      idempotencyKey: evt.idempotencyKey,
      createdAt: new Date(evt.createdAt).toISOString(),
      payload: (() => {
        try {
          return JSON.parse(evt.payloadJson);
        } catch {
          return {};
        }
      })(),
    }));

    let responseData: PushSyncResponse | null = null;
    let isNetworkOk = true;

    try {
      if (customSender) {
        const res = await customSender({
          deviceId,
          centerId,
          events: eventsPayload,
        });
        if (res.statusCode >= 200 && res.statusCode < 300) {
          responseData = res.body;
        } else {
          isNetworkOk = false;
        }
      } else {
        responseData = await syncApi.pushRegistrations(
          deviceId,
          centerId,
          eventsPayload
        );
      }
    } catch {
      return {
        totalProcessed: pendingEvents.length,
        committedCount: 0,
        conflictCount: 0,
        duplicateCount: 0,
        errorCount: pendingEvents.length,
        isNetworkAvailable: false,
      };
    }

    let committed = 0;
    let conflicts = 0;
    let duplicates = 0;
    let errors = 0;

    if (responseData && Array.isArray(responseData.results)) {
      for (const item of responseData.results) {
        const matchingEvt = pendingEvents.find((e) => e.eventId === item.eventId);
        const idempotencyKey = matchingEvt?.idempotencyKey || '';
        const canonicalId = item.canonicalId || item.entityId;

        switch (item.status) {
          case 'COMMITTED':
            committed++;
            if (idempotencyKey) {
              await this.db.markEventSynced(idempotencyKey, canonicalId);
            }
            break;
          case 'DUPLICATE':
            duplicates++;
            if (idempotencyKey) {
              await this.db.markEventSynced(idempotencyKey, canonicalId);
            }
            break;
          case 'CONFLICT':
            conflicts++;
            if (idempotencyKey) {
              await this.db.markEventConflict(
                idempotencyKey,
                item.reason || 'DUPLICATE_MOBILE_NUMBER'
              );
            }
            break;
          default:
            errors++;
            break;
        }
      }
    } else {
      errors = pendingEvents.length;
    }

    return {
      totalProcessed: pendingEvents.length,
      committedCount: committed,
      conflictCount: conflicts,
      duplicateCount: duplicates,
      errorCount: errors,
      isNetworkAvailable: isNetworkOk,
    };
  }
}
