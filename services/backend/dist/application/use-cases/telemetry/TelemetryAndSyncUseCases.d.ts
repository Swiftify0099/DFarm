import { ProcessMilkIntakeUseCase } from '../collections/MilkIntakeUseCases.js';
export declare class GetDeviceTelemetryUseCase {
    execute(deviceId: string): Promise<{
        deviceId: string;
        status: string;
        lastHeartbeat: string;
        weighingScale: {
            connected: boolean;
            status: string;
            port: string;
            model: string;
        };
        milkAnalyzer: {
            connected: boolean;
            status: string;
            port: string;
            model: string;
        };
        thermalPrinter: {
            connected: boolean;
            status: string;
            port: string;
            model: string;
        };
    } | {
        deviceId: any;
        status: any;
        lastHeartbeat: any;
        weighingScale: {
            connected: boolean;
            status: string;
            port?: undefined;
            model?: undefined;
        };
        milkAnalyzer: {
            connected: boolean;
            status: string;
            port?: undefined;
            model?: undefined;
        };
        thermalPrinter: {
            connected: boolean;
            status: string;
            port?: undefined;
            model?: undefined;
        };
    }>;
}
export declare class ProcessOfflineSyncBatchUseCase {
    private readonly milkIntakeUseCase;
    constructor(milkIntakeUseCase: ProcessMilkIntakeUseCase);
    execute(batch: {
        deviceId: string;
        operatorId: string;
        operatorName: string;
        transactions: Array<{
            clientIntakeUuid: string;
            sessionCode?: string;
            customerId: string;
            milkCategory: 'COW' | 'BUFFALO';
            weightLiters: number;
            fatPercentage: number;
            snfPercentage: number;
            clrDensity?: number;
            identificationMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH';
            idempotencyKey?: string;
        }>;
    }): Promise<{
        syncedCount: number;
        failedCount: number;
        totalCount: number;
        total: number;
        succeeded: number;
        failed: number;
        items: {
            clientIntakeUuid: string;
            success: boolean;
            error?: string;
            transactionId?: string;
            receiptNumber?: string;
            isIdempotentReplay?: boolean;
        }[];
        details: {
            clientIntakeUuid: string;
            success: boolean;
            error?: string;
            transactionId?: string;
            receiptNumber?: string;
            isIdempotentReplay?: boolean;
        }[];
    }>;
}
//# sourceMappingURL=TelemetryAndSyncUseCases.d.ts.map