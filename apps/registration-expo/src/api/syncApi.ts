/**
 * DFarm Registration App - Synchronization API Client
 * Parity with backend /api/v1/sync/push
 */

import { apiClient } from './apiClient';

export interface PushSyncRequest {
  deviceId: string;
  centerId: string;
  events: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    idempotencyKey: string;
    createdAt: string;
    payload: any;
  }>;
}

export interface PushSyncResponseItem {
  status: 'COMMITTED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  eventId: string;
  entityId: string;
  canonicalId?: string;
  reason?: string;
}

export interface PushSyncResponse {
  applied: number;
  conflicts: number;
  results: PushSyncResponseItem[];
}

export const syncApi = {
  async pushRegistrations(
    deviceId: string,
    centerId: string,
    events: PushSyncRequest['events']
  ): Promise<PushSyncResponse> {
    const res = await apiClient.post<PushSyncResponse>('api/v1/sync/push', {
      deviceId,
      centerId,
      events,
    });
    return (
      res.data || {
        applied: 0,
        conflicts: 0,
        results: [],
      }
    );
  },
};
