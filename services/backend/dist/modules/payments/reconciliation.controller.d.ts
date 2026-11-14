import type { Request, Response, NextFunction } from 'express';
export declare class ReconciliationController {
    static importBankStatement(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getRecords(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static resolveRecord(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static handleWebhook(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=reconciliation.controller.d.ts.map