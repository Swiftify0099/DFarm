export interface LivenessResult {
    status: 'UP';
    timestamp: string;
}
export interface ReadinessResult {
    status: 'READY' | 'NOT_READY';
    checks: {
        env: 'OK' | 'FAILED';
        supabase: 'OK' | 'FAILED';
        database: 'OK' | 'FAILED';
    };
    timestamp: string;
}
export declare class HealthService {
    static getLiveness(): LivenessResult;
    static getReadiness(): Promise<ReadinessResult>;
}
//# sourceMappingURL=health.service.d.ts.map