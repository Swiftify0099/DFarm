import type { Request, Response, NextFunction } from 'express';
export declare class PayrollController {
    static initiatePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void>;
    static calculatePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void>;
    static approvePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void>;
    static finalizePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void>;
    static recordSalaryPayment(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listPayrollRuns(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getPayrollRun(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getPayslip(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=payroll.controller.d.ts.map