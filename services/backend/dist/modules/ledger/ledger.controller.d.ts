import type { Request, Response, NextFunction } from 'express';
export declare class LedgerController {
    /**
     * 1. GET /api/v1/ledger/accounts
     */
    static getAccounts(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 2. GET /api/v1/customers/:customerId/ledger/summary OR /api/v1/ledger/:customerId/summary
     */
    static getSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 3. GET /api/v1/customers/:customerId/ledger/transactions OR /api/v1/ledger/:customerId/transactions
     */
    static getTransactions(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 4. GET /api/v1/customers/:customerId/ledger/statement
     */
    static getStatement(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 5. GET /api/v1/customers/:customerId/ledger (Combined overview with summary and recent transactions)
     */
    static getCustomerLedger(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 6. POST /api/v1/ledger/:customerId/advances
     */
    static createAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 7. POST /api/v1/ledger/advances/:advanceId/approve
     */
    static approveAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 8. POST /api/v1/ledger/advances/:advanceId/reject
     */
    static rejectAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 9. POST /api/v1/ledger/advances/:advanceId/recover
     */
    static recoverAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 10. POST /api/v1/ledger/:customerId/deductions
     */
    static createDeduction(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 11. POST /api/v1/ledger/:customerId/opening-balance
     */
    static createOpeningBalance(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 12. POST /api/v1/ledger/:customerId/adjustments
     */
    static createAdjustment(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 13. POST /api/v1/ledger/reconcile
     */
    static reconcile(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 14. Reports
     */
    static getBalancesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getDailySummaryReport(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getCenterLiabilitiesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getOutstandingAdvancesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getTransactionRegisterReport(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * 15. Feed Debit Integration Contract Endpoint (For module handoff)
     */
    static processFeedPurchase(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=ledger.controller.d.ts.map