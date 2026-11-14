/**
 * DFarm Registration App — Background Sync Daemon
 * 
 * Periodically drains offline registration drafts and sync events from SQLite
 * to central backend.
 */

import { IRegistrationDraftStore, registrationDb } from '../database/RegistrationDatabase';
import { RegistrationSyncEngine } from './RegistrationSyncEngine';
import { syncApi } from '../api/syncApi';

export const REGISTRATION_SYNC_TASK_NAME = 'DFARM_REGISTRATION_BACKGROUND_SYNC';

export interface RegistrationBackgroundSyncConfig {
  intervalMinutes: number;
  stopOnTerminate: boolean;
  startOnBoot: boolean;
}

export const DEFAULT_REGISTRATION_SYNC_CONFIG: RegistrationBackgroundSyncConfig = {
  intervalMinutes: 15,
  stopOnTerminate: false,
  startOnBoot: true,
};

export async function executeRegistrationBackgroundSync(
  db: IRegistrationDraftStore = registrationDb,
  deviceId: string = 'REG_TABLET_DEVICE_01',
  centerId: string = 'CENTER_DEFAULT'
): Promise<{ committed: number; success: boolean; error?: string }> {
  try {
    const engine = new RegistrationSyncEngine(db);
    const result = await engine.pushPendingRegistrations(
      deviceId,
      centerId,
      async (payload) => {
        try {
          const res = await syncApi.pushRegistrations(
            payload.deviceId,
            payload.centerId,
            payload.events
          );
          return { statusCode: 200, body: res };
        } catch (err: any) {
          return { statusCode: err?.response?.status || 500, body: null };
        }
      }
    );

    return { committed: result.committedCount, success: true };
  } catch (err: any) {
    return { committed: 0, success: false, error: err.message };
  }
}

export async function registerRegistrationBackgroundSync(
  config: RegistrationBackgroundSyncConfig = DEFAULT_REGISTRATION_SYNC_CONFIG
): Promise<{ registered: boolean; reason?: string }> {
  try {
    const TaskManager = require('expo-task-manager');
    const BackgroundFetch = require('expo-background-fetch');

    if (!TaskManager.isTaskDefined(REGISTRATION_SYNC_TASK_NAME)) {
      TaskManager.defineTask(REGISTRATION_SYNC_TASK_NAME, async () => {
        const result = await executeRegistrationBackgroundSync();
        return result.committed > 0
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

    await BackgroundFetch.registerTaskAsync(REGISTRATION_SYNC_TASK_NAME, {
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
