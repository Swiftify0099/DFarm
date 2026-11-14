package com.dfarm.collection.domain.sync

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class DFarmSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    companion object {
        const val PERIODIC_WORK_NAME = "DFarmPeriodicSyncWork"
        const val ONE_TIME_WORK_NAME = "DFarmImmediateSyncWork"
        const val TAG_SYNC = "DFARM_SYNC_TAG"

        /**
         * Schedules periodic background sync with battery-aware & network constraints.
         * Enforces ExistingPeriodicWorkPolicy.KEEP to prevent duplicate work instances.
         */
        fun schedulePeriodicSync(context: Context, intervalMinutes: Long = 15) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build()

            val periodicRequest = PeriodicWorkRequestBuilder<DFarmSyncWorker>(
                intervalMinutes, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .addTag(TAG_SYNC)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest
            )
        }

        /**
         * Triggers an immediate "Sync Now" foreground action when user requests manual sync
         * or when network connectivity is re-established.
         */
        fun syncImmediatelyNow(context: Context): Operation {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val oneTimeRequest = OneTimeWorkRequestBuilder<DFarmSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag(TAG_SYNC)
                .build()

            return WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_TIME_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                oneTimeRequest
            )
        }

        /**
         * Cancels all scheduled sync workers.
         */
        fun cancelAllSyncWork(context: Context) {
            WorkManager.getInstance(context).cancelAllWorkByTag(TAG_SYNC)
        }
    }

    override fun doWork(): Result {
        return try {
            // Execution hook for background synchronization
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 5) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}
