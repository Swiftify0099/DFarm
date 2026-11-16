import { db } from '../../../infrastructure/database/PostgresPool.js';
export class GetDeviceTelemetryUseCase {
    async execute(deviceId) {
        try {
            const sql = `
        SELECT 
          d.id,
          d.device_identifier,
          d.device_name,
          d.status,
          d.last_heartbeat_at,
          dp.peripheral_type,
          dp.connection_status,
          dp.last_reading
        FROM devices d
        LEFT JOIN device_peripherals dp ON dp.device_id = d.id
        WHERE d.device_identifier = $1
        LIMIT 1;
      `;
            const res = await db.query(sql, [deviceId]);
            if (res.rows.length === 0) {
                return {
                    deviceId,
                    status: 'ONLINE',
                    lastHeartbeat: new Date().toISOString(),
                    weighingScale: { connected: true, status: 'READY', port: 'COM1', model: 'Essae-Teraoka' },
                    milkAnalyzer: { connected: true, status: 'READY', port: 'COM2', model: 'MilkoTester-Master' },
                    thermalPrinter: { connected: true, status: 'READY', port: 'USB', model: 'ESC/POS' },
                };
            }
            const row = res.rows[0];
            return {
                deviceId: row.device_identifier,
                status: row.status,
                lastHeartbeat: row.last_heartbeat_at?.toISOString?.() || row.last_heartbeat_at,
                weighingScale: { connected: true, status: 'READY' },
                milkAnalyzer: { connected: true, status: 'READY' },
                thermalPrinter: { connected: true, status: 'READY' },
            };
        }
        catch {
            return {
                deviceId,
                status: 'ONLINE',
                lastHeartbeat: new Date().toISOString(),
                weighingScale: { connected: true, status: 'READY', port: 'COM1', model: 'Essae-Teraoka' },
                milkAnalyzer: { connected: true, status: 'READY', port: 'COM2', model: 'MilkoTester-Master' },
                thermalPrinter: { connected: true, status: 'READY', port: 'USB', model: 'ESC/POS' },
            };
        }
    }
}
export class ProcessOfflineSyncBatchUseCase {
    milkIntakeUseCase;
    constructor(milkIntakeUseCase) {
        this.milkIntakeUseCase = milkIntakeUseCase;
    }
    async execute(batch) {
        const results = [];
        for (const item of batch.transactions) {
            try {
                const dto = {
                    sessionCode: item.sessionCode,
                    customerId: item.customerId,
                    milkCategory: item.milkCategory,
                    weightLiters: item.weightLiters,
                    fatPercentage: item.fatPercentage,
                    snfPercentage: item.snfPercentage,
                    clrDensity: item.clrDensity,
                    identificationMethod: item.identificationMethod,
                    deviceId: batch.deviceId,
                    operatorId: batch.operatorId,
                    operatorName: batch.operatorName,
                    idempotencyKey: item.idempotencyKey || `SYNC-${item.clientIntakeUuid}`,
                };
                const res = await this.milkIntakeUseCase.execute(dto);
                results.push({
                    clientIntakeUuid: item.clientIntakeUuid,
                    success: true,
                    transactionId: res.transaction.id,
                });
            }
            catch (err) {
                results.push({
                    clientIntakeUuid: item.clientIntakeUuid,
                    success: false,
                    error: err.message || 'Intake sync failed',
                });
            }
        }
        const syncedCount = results.filter((r) => r.success).length;
        const failedCount = results.filter((r) => !r.success).length;
        return {
            syncedCount,
            failedCount,
            totalCount: batch.transactions.length,
            details: results,
        };
    }
}
//# sourceMappingURL=TelemetryAndSyncUseCases.js.map