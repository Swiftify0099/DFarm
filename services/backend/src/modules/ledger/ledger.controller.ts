import type { Request, Response, NextFunction } from 'express';
import { pool } from '../../db.js';
import { LedgerService } from './ledger.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class LedgerController {
  /**
   * GET /api/v1/ledger/entries (Farmer Passbook Stream)
   */
  public static async getFarmerPassbookEntries(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const customerId = req.auth.customerProfile?.customerId || req.auth.userId;
      
      const txns = await pool.query(
        `SELECT * FROM ledger_transactions WHERE customer_id = $1 ORDER BY created_at DESC;`,
        [customerId]
      );
      const mapped = txns.rows.map((tx: any) => ({
        id: tx.id,
        transactionType: tx.transaction_type,
        direction: tx.direction,
        amount: parseFloat(tx.amount),
        balanceAfter: parseFloat(tx.balance_after),
        referenceEntity: tx.reference_entity,
        referenceId: tx.reference_id,
        description: tx.description,
        createdAt: tx.created_at,
      }));
      return ApiResponse.success(res, mapped, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/ledger/summary (Farmer Khata Summary)
   */
  public static async getMySummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const customerId = req.auth.userId;
      const result = await LedgerService.getCustomerSummary(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
  /**
   * 1. GET /api/v1/ledger/accounts
   */
  public static async getAccounts(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getAccounts(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 2. GET /api/v1/customers/:customerId/ledger/summary OR /api/v1/ledger/:customerId/summary
   */
  public static async getSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.getCustomerSummary(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 3. GET /api/v1/customers/:customerId/ledger/transactions OR /api/v1/ledger/:customerId/transactions
   */
  public static async getTransactions(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.getCustomerTransactions(customerId, req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 4. GET /api/v1/customers/:customerId/ledger/statement
   */
  public static async getStatement(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.getCustomerStatement(customerId, req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 5. GET /api/v1/customers/:customerId/ledger (Combined overview with summary and recent transactions)
   */
  public static async getCustomerLedger(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const summary = await LedgerService.getCustomerSummary(customerId, req.auth);
      const txns = await LedgerService.getCustomerTransactions(customerId, req.query, req.auth);
      return ApiResponse.success(res, { summary, ...txns }, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 6. POST /api/v1/ledger/:customerId/advances
   */
  public static async createAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.createAdvance(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 7. POST /api/v1/ledger/advances/:advanceId/approve
   */
  public static async approveAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { advanceId } = req.params as { advanceId: string };
      const result = await LedgerService.approveAdvance(advanceId, req.body.approvedAmount, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 8. POST /api/v1/ledger/advances/:advanceId/reject
   */
  public static async rejectAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { advanceId } = req.params as { advanceId: string };
      const result = await LedgerService.rejectAdvance(advanceId, req.body.reason, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 9. POST /api/v1/ledger/advances/:advanceId/recover
   */
  public static async recoverAdvance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { advanceId } = req.params as { advanceId: string };
      const result = await LedgerService.recoverAdvance(advanceId, req.body, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 10. POST /api/v1/ledger/:customerId/deductions
   */
  public static async createDeduction(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.createDeduction(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 11. POST /api/v1/ledger/:customerId/opening-balance
   */
  public static async createOpeningBalance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.createOpeningBalance(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12. POST /api/v1/ledger/:customerId/adjustments
   */
  public static async createAdjustment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const { customerId } = req.params as { customerId: string };
      const result = await LedgerService.createAdjustment(customerId, req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 13. POST /api/v1/ledger/reconcile
   */
  public static async reconcile(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const customerId = req.body.customerId || (req.query.customerId as string);
      const centerId = req.body.centerId || (req.query.centerId as string);
      const result = await LedgerService.reconcile(customerId, centerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 14. Reports
   */
  public static async getBalancesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getCustomerBalancesReport(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getDailySummaryReport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getDailySummaryReport(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getCenterLiabilitiesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getCenterLiabilitiesReport(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getOutstandingAdvancesReport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getOutstandingAdvancesReport(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getTransactionRegisterReport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.getTransactionRegisterReport(req.query, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 15. Feed Debit Integration Contract Endpoint (For module handoff)
   */
  public static async processFeedPurchase(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError('Authentication required');
      const result = await LedgerService.processFeedPurchaseDebit(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
}
