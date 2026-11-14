import { getAdminSupabaseClient } from '../../config/supabase.js';
export class HealthService {
    static getLiveness() {
        return {
            status: 'UP',
            timestamp: new Date().toISOString(),
        };
    }
    static async getReadiness() {
        const checks = {
            env: 'OK',
            supabase: 'OK',
            database: 'OK',
        };
        try {
            const adminClient = getAdminSupabaseClient();
            if (!adminClient) {
                checks.supabase = 'FAILED';
                checks.database = 'FAILED';
            }
            else {
                // Ping database with a lightweight HEAD request on organizations
                const { error } = await adminClient.from('organizations').select('id', { count: 'exact', head: true });
                if (error) {
                    checks.database = 'FAILED';
                }
            }
        }
        catch {
            checks.database = 'FAILED';
        }
        const isReady = checks.env === 'OK' && checks.supabase === 'OK' && checks.database === 'OK';
        return {
            status: isReady ? 'READY' : 'NOT_READY',
            checks,
            timestamp: new Date().toISOString(),
        };
    }
}
//# sourceMappingURL=health.service.js.map