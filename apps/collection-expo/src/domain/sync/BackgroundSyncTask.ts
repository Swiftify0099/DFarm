/**
 * DFarm Collection App — Background Synchronization Daemon
 * 
 * Provides periodic background synchronization equivalent to Android WorkManager
 * (DFarmSyncWorker.kt).
 * - Minimum Interval: 15 minutes (900 seconds)
 * - Behavior: Wake up, inspect SQLite outbox (sync_journal), flush pending collections,
 *   pull downstream updates (rate cells, tombstones), advance sync cursor.
 * - Enforces stopOnTerminate: false, startOnBoot: true
 */

import { ICollectionDatabase, collectionDb } from '../../database/CollectionDatabase';
import { DFarmSyncEngine } from './DFarmSyncEngine';
import { OfflineRevocationGuard } from './OfflineRevocationGuard';
import { SessionManager } from '../../storage/SessionManager';
import { collectionApiClient } from '../../api/client';

export const DFARM_SYNC_TASK_NAME = 'DFARM_COLLECTION_BACKGROUND_SYNC';

export interface BackgroundSyncConfig {
  intervalMinutes: number;
  stopOnTerminate: boolean;
  startOnBoot: boolean;
}

export const DEFAULT_BACKGROUND_SYNC_CONFIG: BackgroundSyncConfig = {
  intervalMinutes: 15,
  stopOnTerminate: false,
  startOnBoot: true,
};

/**
 * Core background sync worker logic.
 * Safe to invoke from Expo TaskManager, foreground timer, or Network state listener.
 */
export async function executeCollectionBackgroundSync(
  database: ICollectionDatabase = collectionDb
): Promise<{ flushed: number; success: boolean; error?: string }> {
  try {
    const sessionManager = new SessionManager();
    const token = await sessionManager.getToken();
    const centerId = await sessionManager.getActiveCenterId();
    const deviceId = await sessionManager.getDeviceId();

    if (!token || !centerId || !deviceId) {
      return { flushed: 0, success: true }; // No active authenticated session
    }

    const revocationGuard = new OfflineRevocationGuard(database);
    const syncEngine = new DFarmSyncEngine(database, revocationGuard);

    // Push pending collections
    const pushed = await syncEngine.pushPendingJournal(
      deviceId,
      centerId,
      async (url, bodyJson) => {
        try {
          const res = await collectionApiClient.post(url, JSON.parse(bodyJson));
          return { status: res.status, body: JSON.stringify(res.data) };
        } catch (err: any) {
          return { status: err?.response?.status || 500, body: null };
        }
      }
    );

    // Pull downstream updates
    await syncEngine.pullDownstreamUpdates(
      centerId,
      async (url) => {
        try {
          const res = await collectionApiClient.get(url);
          return { status: res.status, body: JSON.stringify(res.data) };
        } catch (err: any) {
          return { status: err?.response?.status || 500, body: null };
        }
      },
      async (url, bodyJson) => {
        try {
          const res = await collectionApiClient.post(url, JSON.parse(bodyJson));
          return { status: res.status, body: JSON.stringify(res.data) };
        } catch (err: any) {
          return { status: err?.response?.status || 500, body: null };
        }
      }
    );

    return { flushed: pushed, success: true };
  } catch (err: any) {
    return { flushed: 0, success: false, error: err.message };
  }
}

/**
 * Register background periodic task via expo-background-fetch / expo-task-manager.
 */
export async function registerCollectionBackgroundSync(
  config: BackgroundSyncConfig = DEFAULT_BACKGROUND_SYNC_CONFIG
): Promise<{ registered: boolean; reason?: string }> {
  try {
    const TaskManager = require('expo-task-manager');
    const BackgroundFetch = require('expo-background-fetch');

    // Define task if not already defined
    if (!TaskManager.isTaskDefined(DFARM_SYNC_TASK_NAME)) {
      TaskManager.defineTask(DFARM_SYNC_TASK_NAME, async () => {
        const result = await executeCollectionBackgroundSync();
        return result.flushed > 0
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      });
    }

    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return {
        registered: false,
        reason: 'Background fetch restricted or denied by Android battery/permission settings',
      };
    }

    await BackgroundFetch.registerTaskAsync(DFARM_SYNC_TASK_NAME, {
      minimumInterval: config.intervalMinutes * 60,
      stopOnTerminate: config.stopOnTerminate,
      startOnBoot: config.startOnBoot,
    });

    return { registered: true };
  } catch (err: any) {
    return {
      registered: false,
      reason: err.message || 'BackgroundFetch registration unsupported in current environment',
    };
  }
}
