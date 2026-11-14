import type { Request, Response, NextFunction } from 'express';
export declare class PaymentController {
    static createPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static approvePayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static submitPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static confirmPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static failPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static reversePayout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getPayoutById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getPayoutReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getCustomerPayouts(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getCustomerPaymentSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static createReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static confirmReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getReceiptById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static createBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getBatchById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static approveBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static submitBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static reconcileBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=payment.controller.d.ts.map