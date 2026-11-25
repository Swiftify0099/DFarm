// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: STATUS INQUIRY SERVICE (PROMPT 7)
// ==============================================================================

import { query, pool } from '../../../config/db.js';
import { NotFoundError, ForbiddenError, AppError } from '../../../shared/errors/app-error.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import { UnionBankApiClient } from './UnionBankApiClient.js';
import { payoutService } from '../../../modules/payments/payout.service.js';

export class UnionBankStatusInquiryService {
  private static apiClient = new UnionBankApiClient();

  /**
   * Performs an authoritative status inquiry for a timed-out or UNKNOWN batch item.
   * Strict rule: A timeout is NEVER automatically marked as failed.
   */
  public static async queryItemStatus(
    itemId: string,
    auth: AuthContext
  ): Promise<{
    itemId: string;
    customerReference: string;
    previousStatus: string;
    currentStatus: string;
    bankUtr?: string;
    settledAt?: string;
    canSafeRetry: boolean;
    inquiryNotes: string;
  }> {
    const itemRes = await query(
      `SELECT bi.*, pb.organization_id, pb.batch_number, c.farmer_code
       FROM payment_batch_items bi
       JOIN payment_batches pb ON pb.id = bi.batch_id
       JOIN customers c ON c.id = bi.customer_id
       WHERE bi.id = $1;`,
      [itemId]
    );

    if (itemRes.rows.length === 0) {
      throw new NotFoundError(`Payment batch item '${itemId}' not found`, 'ITEM_NOT_FOUND');
    }
    const item = itemRes.rows[0];

    // Multi-tenant check
    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId !== item.organization_id) {
      throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
    }

    const customerRef = item.beneficiary_reference || `REF-${item.batch_number}-${item.farmer_code}`;
    const previousStatus = item.status;

    // Execute bank inquiry
    const bankResult = await this.apiClient.queryPaymentStatus(customerRef, item.bank_utr);

    let currentStatus = item.status;
    let canSafeRetry = false;
    let inquiryNotes = '';
    let settledAt: string | undefined;

    if (bankResult.status === 'PAID') {
      // Authoritatively confirmed paid by bank -> Post ledger debit
      const settlement = await payoutService.confirmPayout(
        item.payout_id,
        auth,
        bankResult.bankUtr || item.bank_utr || `UBI-UTR-${Date.now()}`
      );
      currentStatus = 'PAID';
      settledAt = settlement.settledAt;
      canSafeRetry = false;
      inquiryNotes = `Bank confirmed successful settlement with UTR ${bankResult.bankUtr}. Ledger debit posted.`;
    } else if (bankResult.status === 'FAILED') {
      // Confirmed rejected by bank -> Safe to retry
      await payoutService.failPayout(
        item.payout_id,
        auth,
        bankResult.failureReason || 'Confirmed rejected by Union Bank clearing house'
      );
      currentStatus = 'FAILED';
      canSafeRetry = true;
      inquiryNotes = `Bank confirmed transaction failed: ${bankResult.failureReason}. Re-inclusion in future batch is permitted.`;
    } else if (bankResult.status === 'PENDING') {
      currentStatus = 'PROCESSING';
      canSafeRetry = false;
      inquiryNotes = 'Transaction is in clearing at Union Bank. Automatic retry is strictly prohibited until final resolution.';
    } else {
      // UNKNOWN
      currentStatus = 'UNKNOWN';
      canSafeRetry = false;
      inquiryNotes = 'Bank status remains UNKNOWN. Manual bank statement verification or treasury confirmation required.';
    }

    // Update item record with inquiry timestamp and bank UTR if present
    await query(
      `UPDATE payment_batch_items
       SET status = $1, bank_utr = COALESCE($2, bank_utr), last_inquiry_at = NOW(), updated_at = NOW()
       WHERE id = $3;`,
      [currentStatus, bankResult.bankUtr || null, itemId]
    );

    return {
      itemId,
      customerReference: customerRef,
      previousStatus,
      currentStatus,
      bankUtr: bankResult.bankUtr || item.bank_utr,
      settledAt,
      canSafeRetry,
      inquiryNotes,
    };
  }

  /**
   * Marks in-flight items whose bank submission timed out as UNKNOWN.
   */
  public static async markTimeoutUnknown(
    batchId: string,
    auth: AuthContext,
    reason: string = 'Network timeout waiting for Union Bank acknowledgement'
  ): Promise<{ updatedCount: number }> {
    const batchRes = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (batchRes.rows.length === 0) throw new NotFoundError('Batch not found', 'BATCH_NOT_FOUND');
    const batch = batchRes.rows[0];

    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId !== batch.organization_id) {
      throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE payment_batch_items
         SET status = 'UNKNOWN', bank_status_description = $1, updated_at = NOW()
         WHERE batch_id = $2 AND status IN ('SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING')
         RETURNING id;`,
        [reason, batchId]
      );

      await client.query(
        `UPDATE payment_batches
         SET status = 'UNKNOWN', updated_at = NOW()
         WHERE id = $1;`,
        [batchId]
      );

      await client.query('COMMIT');
      return { updatedCount: updateRes.rowCount || 0 };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new AppError(err.message, 500, 'TIMEOUT_UPDATE_FAILED');
    } finally {
      client.release();
    }
  }
}
