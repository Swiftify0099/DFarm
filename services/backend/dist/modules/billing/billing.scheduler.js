import { pool } from '../../db.js';
import { BillingService } from './billing.service.js';
import { BillingCycleType, UserRole } from '@dfarm/shared-types';
export class BillingScheduler {
    /**
     * System Auth context used for automated scheduler runs.
     */
    static getSystemAuthContext(orgId, centerId) {
        return {
            authUser: { id: '00000000-0000-0000-0000-000000000001' },
            actorType: 'STAFF',
            userId: '00000000-0000-0000-0000-000000000001',
            organizationId: orgId,
            role: UserRole.SUPER_ADMIN,
            centerIds: [centerId],
            token: 'SYSTEM_SCHEDULER_TOKEN',
            userSupabaseClient: null,
        };
    }
    /**
     * Executes scheduled billing generation for all active dairy centers or a specific center.
     * Can be triggered by background cron or manually via API.
     */
    static async executeScheduledBilling(options) {
        const triggerType = options.triggerType || 'CRON';
        const results = [];
        // Query active centers with their center_settings
        let centerQuery = `
      SELECT dc.id, dc.name, dc.organization_id, COALESCE(cs.billing_cycle_type, 'CALENDAR_MONTH') as billing_cycle_type
      FROM dairy_centers dc
      LEFT JOIN center_settings cs ON cs.center_id = dc.id
      WHERE dc.status = 'ACTIVE'
    `;
        const params = [];
        if (options.centerId) {
            centerQuery += ` AND dc.id = $1`;
            params.push(options.centerId);
        }
        const centersRes = await pool.query(centerQuery, params);
        for (const center of centersRes.rows) {
            const startTime = Date.now();
            let farmersProcessed = 0;
            let periodId;
            let errorMessage;
            try {
                // Compute period date range based on cycle type
                const cycleType = center.billing_cycle_type;
                const { startDate, endDate, periodName } = this.calculatePeriodDates(cycleType, options.targetDate);
                // Check if billing period already exists
                const existingPeriodRes = await pool.query(`SELECT id, status FROM billing_periods 
           WHERE center_id = $1 AND start_date = $2 AND end_date = $3;`, [center.id, startDate, endDate]);
                let bp;
                if (existingPeriodRes.rows.length > 0) {
                    bp = existingPeriodRes.rows[0];
                    periodId = bp.id;
                    // If period is already FINALIZED, skip generation to prevent duplicate/overwrite
                    if (bp.status === 'FINALIZED') {
                        results.push({
                            centerId: center.id,
                            centerName: center.name,
                            billingPeriodId: periodId,
                            status: 'SKIPPED',
                            farmersProcessed: 0,
                            executionTimeMs: Date.now() - startTime,
                            message: `Period '${periodName}' is already FINALIZED for center '${center.name}'. Skipped.`,
                        });
                        await this.logExecution(center.id, periodId, triggerType, 'SKIPPED', 0, Date.now() - startTime, 'Period already finalized');
                        continue;
                    }
                }
                else {
                    // Create new period
                    const auth = options.callerAuth || this.getSystemAuthContext(center.organization_id, center.id);
                    const newPeriod = await BillingService.createPeriod({
                        centerId: center.id,
                        periodName,
                        startDate,
                        endDate,
                        cycleType,
                    }, auth);
                    periodId = newPeriod.id;
                    bp = { id: newPeriod.id, status: newPeriod.status };
                }
                // If dryRun, do not generate
                if (options.dryRun) {
                    results.push({
                        centerId: center.id,
                        centerName: center.name,
                        billingPeriodId: periodId,
                        status: 'SKIPPED',
                        farmersProcessed: 0,
                        executionTimeMs: Date.now() - startTime,
                        message: 'Dry run completed. Billing period prepared but bills not generated.',
                    });
                    continue;
                }
                // Run Bill Generation
                const auth = options.callerAuth || this.getSystemAuthContext(center.organization_id, center.id);
                const genResult = await BillingService.generateBills(periodId, {}, auth);
                farmersProcessed = genResult.billsGenerated;
                const duration = Date.now() - startTime;
                results.push({
                    centerId: center.id,
                    centerName: center.name,
                    billingPeriodId: periodId,
                    status: 'SUCCESS',
                    farmersProcessed,
                    executionTimeMs: duration,
                    message: `Successfully generated ${farmersProcessed} bills for '${periodName}'. Awaiting review.`,
                });
                await this.logExecution(center.id, periodId, triggerType, 'SUCCESS', farmersProcessed, duration);
            }
            catch (err) {
                errorMessage = err.message || 'Unknown scheduler error';
                const duration = Date.now() - startTime;
                results.push({
                    centerId: center.id,
                    centerName: center.name,
                    billingPeriodId: periodId,
                    status: 'FAILED',
                    farmersProcessed: 0,
                    executionTimeMs: duration,
                    message: errorMessage,
                });
                await this.logExecution(center.id, periodId, triggerType, 'FAILED', 0, duration, errorMessage);
            }
        }
        return results;
    }
    /**
     * Helper to compute calendar period boundaries.
     */
    static calculatePeriodDates(cycleType, targetDateStr) {
        const baseDate = targetDateStr ? new Date(targetDateStr) : new Date();
        if (cycleType === BillingCycleType.CALENDAR_MONTH) {
            // Current or previous month calendar span
            const year = baseDate.getFullYear();
            const month = baseDate.getMonth(); // 0-indexed
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0); // last day of month
            const startStr = start.toISOString().slice(0, 10);
            const endStr = end.toISOString().slice(0, 10);
            const monthName = start.toLocaleString('default', { month: 'long' });
            const periodName = `${monthName} ${year}`;
            return { startDate: startStr, endDate: endStr, periodName };
        }
        if (cycleType === BillingCycleType.TEN_DAY) {
            const year = baseDate.getFullYear();
            const month = baseDate.getMonth();
            const day = baseDate.getDate();
            let startDay = 1;
            let endDay = 10;
            let slot = '1st Decad';
            if (day > 20) {
                startDay = 21;
                endDay = new Date(year, month + 1, 0).getDate();
                slot = '3rd Decad';
            }
            else if (day > 10) {
                startDay = 11;
                endDay = 20;
                slot = '2nd Decad';
            }
            const startStr = new Date(year, month, startDay).toISOString().slice(0, 10);
            const endStr = new Date(year, month, endDay).toISOString().slice(0, 10);
            const monthName = baseDate.toLocaleString('default', { month: 'short' });
            const periodName = `${slot} (${monthName} ${year})`;
            return { startDate: startStr, endDate: endStr, periodName };
        }
        // Default fallback
        const startStr = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).toISOString().slice(0, 10);
        const endStr = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).toISOString().slice(0, 10);
        return { startDate: startStr, endDate: endStr, periodName: `Period ${startStr} to ${endStr}` };
    }
    /**
     * Records execution log into billing_scheduler_execution_logs table.
     */
    static async logExecution(centerId, periodId, triggerType, status, farmersProcessed, executionTimeMs, errorMessage) {
        try {
            await pool.query(`INSERT INTO billing_scheduler_execution_logs (
           center_id, billing_period_id, trigger_type, status, farmers_processed, execution_time_ms, error_message, executed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());`, [centerId, periodId || null, triggerType, status, farmersProcessed, executionTimeMs, errorMessage || null]);
        }
        catch {
            // Best-effort logging
        }
    }
}
//# sourceMappingURL=billing.scheduler.js.map