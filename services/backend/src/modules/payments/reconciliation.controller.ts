import type { Request, Response, NextFunction } from 'express';
import { reconciliationService } from './reconciliation.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class ReconciliationController {
  public static async importBankStatement(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await reconciliationService.importBankStatementCsv(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getRecords(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const status = req.query['status'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;
      const result = await reconciliationService.getReconciliationRecords(req.auth, { status, limit, offset });
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async resolveRecord(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { recordId } = req.params as { recordId: string };
      const { action, notes, matchedPayoutId } = req.body;
      const result = await reconciliationService.resolveRecord(recordId, action, notes, req.auth, matchedPayoutId);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const signature = (req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature']) as string;
      const timestamp = (req.headers['x-webhook-timestamp'] || req.headers['x-timestamp']) as string | undefined;
      const rawPayload = JSON.stringify(req.body);

      const result = await reconciliationService.processWebhook(rawPayload, signature, timestamp, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
}

