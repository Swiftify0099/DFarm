import type { AuthContext } from '../../middleware/authenticate.js';
export interface SchedulerExecutionResult {
    centerId: string;
    centerName: string;
    billingPeriodId?: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    farmersProcessed: number;
    executionTimeMs: number;
    message?: string;
}
export declare class BillingScheduler {
    /**
     * System Auth context used for automated scheduler runs.
     */
    private static getSystemAuthContext;
    /**
     * Executes scheduled billing generation for all active dairy centers or a specific center.
     * Can be triggered by background cron or manually via API.
     */
    static executeScheduledBilling(options: {
        centerId?: string;
        targetDate?: string;
        triggerType?: 'CRON' | 'MANUAL';
        dryRun?: boolean;
        callerAuth?: AuthContext;
    }): Promise<SchedulerExecutionResult[]>;
    /**
     * Helper to compute calendar period boundaries.
     */
    private static calculatePeriodDates;
    /**
     * Records execution log into billing_scheduler_execution_logs table.
     */
    private static logExecution;
}
//# sourceMappingURL=billing.scheduler.d.ts.map