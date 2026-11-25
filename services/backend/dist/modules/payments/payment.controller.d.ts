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
    static calculateSettlementPreview(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static createBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static submitForReview(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static rejectBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static submitBatchToUnionBank(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static reconcileBatchWithUnionBank(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static queryBatchItemStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static markBatchTimeout(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getBeneficiaryAuditHistory(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static updateBeneficiaryBankDetails(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getFarmerPaymentOverview(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getBatchById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static approveBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static submitBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static reconcileBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static exportBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static downloadBatch(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=payment.controller.d.ts.map