import type { Request, Response, NextFunction } from 'express';
import { payoutService } from './payout.service.js';
import { receiptService } from './receipt.service.js';
import { batchService } from './batch.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class PaymentController {
  // Payout Endpoints
  public static async createPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await payoutService.createPayout(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async approvePayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { payoutId } = req.params as { payoutId: string };
      const result = await payoutService.approvePayout(payoutId, req.auth, req.body?.comments);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async submitPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { payoutId } = req.params as { payoutId: string };
      const result = await payoutService.submitPayout(payoutId, req.auth, req.body?.paymentReference);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async confirmPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { payoutId } = req.params as { payoutId: string };
      const { paymentReference, settledAt, notes } = req.body;
      const result = await payoutService.confirmPayout(payoutId, req.auth, paymentReference, settledAt, notes);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async failPayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { payoutId } = req.params as { payoutId: string };
      const { failureReason } = req.body;
      const result = await payoutService.failPayout(payoutId, req.auth, failureReason);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async reversePayout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { payoutId } = req.params as { payoutId: string };
      const { reason, idempotencyKey } = req.body;
      const result = await payoutService.reversePayout(payoutId, req.auth, reason, idempotencyKey);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getPayoutById(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { paymentId } = req.params as { paymentId: string };
      const result = await payoutService.getPayoutById(paymentId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getPayoutReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { paymentId } = req.params as { paymentId: string };
      const result = await payoutService.getPayoutReceipt(paymentId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getCustomerPayouts(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { customerId } = req.params as { customerId: string };
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;
      const result = await payoutService.getCustomerPayouts(customerId, req.auth, { limit, offset });
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getCustomerPaymentSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { customerId } = req.params as { customerId: string };
      const result = await payoutService.getCustomerPaymentSummary(customerId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  // Receipt Endpoints (Farmer Debt Repayment)
  public static async createReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await receiptService.createReceipt(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async confirmReceipt(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { receiptId } = req.params as { receiptId: string };
      const { referenceNumber } = req.body || {};
      const result = await receiptService.confirmReceipt(receiptId, req.auth, referenceNumber);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async getReceiptById(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { receiptId } = req.params as { receiptId: string };
      const result = await receiptService.getReceiptById(receiptId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  // Batch Endpoints
  public static async createBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await batchService.createBatch(req.body, req.auth);
      return ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getBatchById(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { batchId } = req.params as { batchId: string };
      const result = await batchService.getBatchById(batchId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async approveBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { batchId } = req.params as { batchId: string };
      const result = await batchService.approveBatch(batchId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async submitBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { batchId } = req.params as { batchId: string };
      const result = await batchService.submitBatch(batchId, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async reconcileBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { batchId } = req.params as { batchId: string };
      const { results } = req.body;
      const result = await batchService.reconcileBatch(batchId, results, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async exportBatch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const { batchId } = req.params as { batchId: string };
      const format = (req.query['format'] as string) || 'NEFT_STANDARD';
      const result = await batchService.exportBatch(batchId, format, req.auth);
      return ApiResponse.success(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  public static async downloadBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query['token'] as string) || '';
      if (!token) {
        res.status(400).json({ success: false, error: 'Download token is required' });
        return;
      }
      const file = batchService.downloadBatch(token);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Checksum-SHA256', file.checksumSha256);
      res.status(200).send(file.content);
    } catch (err) {
      next(err);
    }
  }
}

