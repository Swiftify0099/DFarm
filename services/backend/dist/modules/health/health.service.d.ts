export interface LivenessResult {
    status: 'UP';
    service: string;
    timestamp: string;
}
export interface ReadinessResult {
    status: 'READY' | 'NOT_READY';
    databaseMode: 'PHYSICAL_POSTGRES' | 'TEST_ISOLATED_MEM_DB';
    controlPlane: {
        status: 'CONNECTED' | 'DISCONNECTED';
        poolSize: number;
        idleCount: number;
        waitingCount: number;
    };
    tenantInfrastructure: {
        status: 'READY' | 'DEGRADED';
        totalActiveTenants: number;
        activePoolCount: number;
    };
    checks: {
        env: 'OK' | 'FAILED';
        postgres: 'OK' | 'FAILED';
        supabase: 'OK' | 'FAILED';
    };
    timestamp: string;
}
export declare class HealthService {
    static getLiveness(): LivenessResult;
    static getReadiness(): Promise<ReadinessResult>;
}
//# sourceMappingURL=health.service.d.ts.map