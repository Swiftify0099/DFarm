import { PayrollService } from './payroll.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { InitiatePayrollRunSchema, ApprovePayrollRunSchema, FinalizePayrollRunSchema, RecordSalaryPaymentSchema, } from '@dfarm/shared-validation';
export class PayrollController {
    static async initiatePayrollRun(req, res, next) {
        try {
            const parsed = InitiatePayrollRunSchema.parse(req.body);
            const run = await PayrollService.initiatePayrollRun(parsed, req.auth);
            ApiResponse.success(res, run, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async calculatePayrollRun(req, res, next) {
        try {
            const runId = req.params['id'];
            const run = await PayrollService.calculatePayrollRun(runId, req.auth);
            ApiResponse.success(res, run);
        }
        catch (err) {
            next(err);
        }
    }
    static async approvePayrollRun(req, res, next) {
        try {
            const runId = req.params['id'];
            const parsed = ApprovePayrollRunSchema.parse(req.body);
            const run = await PayrollService.approvePayrollRun(runId, parsed, req.auth);
            ApiResponse.success(res, run);
        }
        catch (err) {
            next(err);
        }
    }
    static async finalizePayrollRun(req, res, next) {
        try {
            const runId = req.params['id'];
            const parsed = FinalizePayrollRunSchema.parse(req.body);
            const run = await PayrollService.finalizePayrollRun(runId, parsed.notes, req.auth);
            ApiResponse.success(res, run);
        }
        catch (err) {
            next(err);
        }
    }
    static async recordSalaryPayment(req, res, next) {
        try {
            const parsed = RecordSalaryPaymentSchema.parse(req.body);
            const payment = await PayrollService.recordSalaryPayment(parsed, req.auth);
            ApiResponse.success(res, payment, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async listPayrollRuns(req, res, next) {
        try {
            const filters = {
                centerId: req.query['centerId'],
                year: req.query['year'] ? parseInt(req.query['year'], 10) : undefined,
            };
            const runs = await PayrollService.listPayrollRuns(filters, req.auth);
            ApiResponse.success(res, runs);
        }
        catch (err) {
            next(err);
        }
    }
    static async getPayrollRun(req, res, next) {
        try {
            const runId = req.params['id'];
            const details = await PayrollService.getPayrollRunById(runId, req.auth);
            ApiResponse.success(res, details);
        }
        catch (err) {
            next(err);
        }
    }
    static async getPayslip(req, res, next) {
        try {
            const payslipId = req.params['id'];
            const payslip = await PayrollService.getPayslipById(payslipId, req.auth);
            ApiResponse.success(res, payslip);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=payroll.controller.js.map