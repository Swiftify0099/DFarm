import type { Request, Response, NextFunction } from 'express';
import { PayrollService } from './payroll.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import {
  InitiatePayrollRunSchema,
  ApprovePayrollRunSchema,
  FinalizePayrollRunSchema,
  RecordSalaryPaymentSchema,
} from '@dfarm/shared-validation';

export class PayrollController {
  public static async initiatePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = InitiatePayrollRunSchema.parse(req.body);
      const run = await PayrollService.initiatePayrollRun(parsed, req.auth!);
      ApiResponse.success(res, run, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async calculatePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params['id'] as string;
      const run = await PayrollService.calculatePayrollRun(runId, req.auth!);
      ApiResponse.success(res, run);
    } catch (err) {
      next(err);
    }
  }

  public static async approvePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params['id'] as string;
      const parsed = ApprovePayrollRunSchema.parse(req.body);
      const run = await PayrollService.approvePayrollRun(runId, parsed, req.auth!);
      ApiResponse.success(res, run);
    } catch (err) {
      next(err);
    }
  }

  public static async finalizePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params['id'] as string;
      const parsed = FinalizePayrollRunSchema.parse(req.body);
      const run = await PayrollService.finalizePayrollRun(runId, parsed.notes, req.auth!);
      ApiResponse.success(res, run);
    } catch (err) {
      next(err);
    }
  }

  public static async recordSalaryPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = RecordSalaryPaymentSchema.parse(req.body);
      const payment = await PayrollService.recordSalaryPayment(parsed, req.auth!);
      ApiResponse.success(res, payment, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async listPayrollRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        centerId: req.query['centerId'] as string | undefined,
        year: req.query['year'] ? parseInt(req.query['year'] as string, 10) : undefined,
      };
      const runs = await PayrollService.listPayrollRuns(filters, req.auth!);
      ApiResponse.success(res, runs);
    } catch (err) {
      next(err);
    }
  }

  public static async getPayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params['id'] as string;
      const details = await PayrollService.getPayrollRunById(runId, req.auth!);
      ApiResponse.success(res, details);
    } catch (err) {
      next(err);
    }
  }

  public static async getPayslip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payslipId = req.params['id'] as string;
      const payslip = await PayrollService.getPayslipById(payslipId, req.auth!);
      ApiResponse.success(res, payslip);
    } catch (err) {
      next(err);
    }
  }
}
