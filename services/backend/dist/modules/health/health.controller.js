import { HealthService } from './health.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
export class HealthController {
    static live(_req, res) {
        const data = HealthService.getLiveness();
        return ApiResponse.success(res, data, 200);
    }
    static async ready(_req, res, next) {
        try {
            const data = await HealthService.getReadiness();
            const statusCode = data.status === 'READY' ? 200 : 503;
            return ApiResponse.success(res, data, statusCode);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=health.controller.js.map