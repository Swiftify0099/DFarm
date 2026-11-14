import { ReportsService } from './reports.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
export class ReportsController {
    static async getDailyCollection(req, res, next) {
        try {
            const date = req.query['date'] || new Date().toISOString().split('T')[0];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getDailyCollectionReport(req.auth, date, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getMonthlyCollection(req, res, next) {
        try {
            const month = parseInt(req.query['month'] || String(new Date().getMonth() + 1), 10);
            const year = parseInt(req.query['year'] || String(new Date().getFullYear()), 10);
            const centerId = req.query['centerId'];
            const data = await ReportsService.getMonthlyCollectionReport(req.auth, month, year, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getFarmerWise(req, res, next) {
        try {
            const startDate = req.query['startDate'] || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            const endDate = req.query['endDate'] || new Date().toISOString().split('T')[0];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getFarmerWiseReport(req.auth, startDate, endDate, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getCowBuffalo(req, res, next) {
        try {
            const startDate = req.query['startDate'] || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            const endDate = req.query['endDate'] || new Date().toISOString().split('T')[0];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getCowBuffaloComparison(req.auth, startDate, endDate, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getFatSnf(req, res, next) {
        try {
            const startDate = req.query['startDate'] || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            const endDate = req.query['endDate'] || new Date().toISOString().split('T')[0];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getFatSnfDistribution(req.auth, startDate, endDate, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getBilling(req, res, next) {
        try {
            const periodId = req.query['periodId'];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getBillingReport(req.auth, periodId, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
    static async getPayouts(req, res, next) {
        try {
            const startDate = req.query['startDate'];
            const endDate = req.query['endDate'];
            const centerId = req.query['centerId'];
            const data = await ReportsService.getPayoutsReport(req.auth, startDate, endDate, centerId);
            ApiResponse.success(res, data);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=reports.controller.js.map