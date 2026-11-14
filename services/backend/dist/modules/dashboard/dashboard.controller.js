import { DashboardService } from './dashboard.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
export class DashboardController {
    static async getMetrics(req, res, next) {
        try {
            const centerId = req.query['centerId'];
            const targetDate = req.query['date'];
            const metrics = await DashboardService.getMetrics(req.auth, centerId, targetDate);
            ApiResponse.success(res, metrics);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=dashboard.controller.js.map