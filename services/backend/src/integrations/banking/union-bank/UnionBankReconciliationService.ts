// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: RECONCILIATION SERVICE (PROMPT 7)
// ==============================================================================

import crypto from 'node:crypto';
import { query, pool } from '../../../config/db.js';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import { payoutService } from '../../../modules/payments/payout.service.js';
import { UnionBankResponseParser } from './UnionBankResponseParser.js';
import type {
  UnionBankReconciliationItemResult,
  UnionBankReconciliationSummary,
} from './types.js';

export class UnionBankReconciliationService {
  /**
   * Reconciles a payment batch against Union Bank response data (raw string content, Reverse MIS, or parsed items).
   * Fully idempotent: duplicate reconciliation calls for the same item return the existing result without double-debiting.
   */
  public static async reconcileBatchWithBankData(
    batchId: string,
    bankResponseContentOrItems: string | UnionBankReconciliationItemResult[],
    auth: AuthContext
  ): Promise<{
    batchId: string;
    batchStatus: string;
    reconciliationStatus: string;
    totalBeneficiaries: number;
    paidCount: number;
    successfulCount: number;
    failedCount: number;
    reversedCount: number;
    unknownCount: number;
    processedItems: Array<{
      itemId: string;
      customerReference: string;
      farmerCode: string;
      expectedAmount: number;
      bankAmount: number;
      bankUtr?: string;
      status: string;
      message: string;
      isIdempotentReplay: boolean;
    }>;
    exceptions: Array<{
      reference: string;
      reason: string;
    }>;
  }> {
    // 1. Fetch Batch
    const batchRes = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (batchRes.rows.length === 0) {
      throw new NotFoundError(`Payment batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const batch = batchRes.rows[0];

    // Multi-tenant check
    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId !== batch.organization_id) {
      throw new ForbiddenError('Cross-organization batch reconciliation is prohibited', 'CROSS_ORG_ACCESS_DENIED');
    }

    // 2. Parse items if string passed
    let parsedSummary: UnionBankReconciliationSummary;
    if (typeof bankResponseContentOrItems === 'string') {
      parsedSummary = UnionBankResponseParser.parseResponse(bankResponseContentOrItems, batch.bank_batch_reference);
    } else {
      parsedSummary = {
        submissionReference: batch.bank_batch_reference,
        totalProcessed: bankResponseContentOrItems.length,
        paidCount: bankResponseContentOrItems.filter(i => i.status === 'PAID').length,
        paidAmount: bankResponseContentOrItems.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0),
        failedCount: bankResponseContentOrItems.filter(i => i.status === 'FAILED').length,
        failedAmount: bankResponseContentOrItems.filter(i => i.status === 'FAILED').reduce((s, i) => s + i.amount, 0),
        reversedCount: bankResponseContentOrItems.filter(i => i.status === 'REVERSED').length,
        unknownCount: bankResponseContentOrItems.filter(i => i.status === 'UNKNOWN').length,
        items: bankResponseContentOrItems,
      };
    }

    // 3. Load all batch items for matching
    const itemsRes = await query(
      `SELECT bi.*, c.farmer_code, c.full_name, c.bank_account_number, cp.amount as payout_amount, cp.status as payout_status
       FROM payment_batch_items bi
       JOIN customers c ON c.id = bi.customer_id
       JOIN customer_payouts cp ON cp.id = bi.payout_id
       WHERE bi.batch_id = $1;`,
      [batchId]
    );

    // Build lookup maps: by itemId, by beneficiary_reference, by farmer_code
    const itemsById = new Map<string, any>();
    const itemsByRef = new Map<string, any>();
    const itemsByFarmerCode = new Map<string, any>();

    for (const it of itemsRes.rows) {
      itemsById.set(it.id, it);
      if (it.beneficiary_reference) itemsByRef.set(it.beneficiary_reference.trim(), it);
      if (it.farmer_code) itemsByFarmerCode.set(it.farmer_code.trim(), it);
    }

    const processedResults: any[] = [];
    const exceptions: any[] = [];

    // 4. Process each bank item transactionally
    for (const bankItem of parsedSummary.items) {
      const cleanRef = (bankItem.customerReference || '').trim();
      const matchedItem = itemsById.get(cleanRef) || itemsByRef.get(cleanRef) || itemsByFarmerCode.get(cleanRef);

      if (!matchedItem) {
        exceptions.push({
          reference: cleanRef,
          reason: `No matching batch item found for reference '${cleanRef}' in batch ${batch.batch_number}`,
        });
        continue;
      }

      const expectedAmount = Number(matchedItem.amount);
      const bankAmount = bankItem.amount || expectedAmount;

      // Amount Discrepancy Check
      if (bankItem.status === 'PAID' && Math.abs(expectedAmount - bankAmount) > 0.01) {
        exceptions.push({
          reference: cleanRef,
          reason: `Amount mismatch: expected ₹${expectedAmount.toFixed(2)}, bank reported ₹${bankAmount.toFixed(2)}`,
        });

        // Record reconciliation mismatch record
        await query(
          `INSERT INTO payment_reconciliation_records (
            organization_id, source, external_reference, transaction_date, amount,
            direction, matched_payout_id, matched_batch_id, reconciliation_status,
            resolution_action, resolution_notes, created_by
          ) VALUES (
            $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
            'DEBIT', $5, $6, 'AMOUNT_MISMATCH',
            'MANUAL_REVIEW_REQUIRED', $7, $8
          );`,
          [
            batch.organization_id,
            bankItem.bankUtr || cleanRef,
            bankItem.transactionDate || new Date().toISOString().slice(0, 10),
            bankAmount,
            matchedItem.payout_id,
            batchId,
            `Expected ₹${expectedAmount.toFixed(2)}, got ₹${bankAmount.toFixed(2)}`,
            auth.userId,
          ]
        );
        continue;
      }

      // Check for Idempotent Replay: Item already SETTLED or PAID
      if (matchedItem.status === 'SETTLED' || matchedItem.status === 'PAID') {
        processedResults.push({
          itemId: matchedItem.id,
          customerReference: cleanRef,
          farmerCode: matchedItem.farmer_code,
          expectedAmount,
          bankAmount,
          bankUtr: matchedItem.bank_utr || bankItem.bankUtr,
          status: 'PAID',
          message: 'Item already settled in ledger (idempotent replay)',
          isIdempotentReplay: true,
        });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (bankItem.status === 'PAID') {
          // Authoritatively settled by Union Bank
          // Post double-entry ledger debit atomically via payoutService
          const utr = bankItem.bankUtr || `UBI-UTR-${batch.batch_number}-${matchedItem.farmer_code}`;
          await payoutService.confirmPayout(matchedItem.payout_id, auth, utr);

          await client.query(
            `UPDATE payment_batch_items
             SET status = 'PAID', bank_utr = $1, settled_at = NOW(), updated_at = NOW()
             WHERE id = $2;`,
            [utr, matchedItem.id]
          );

          // Record clean match in payment_reconciliation_records
          await client.query(
            `INSERT INTO payment_reconciliation_records (
              organization_id, source, external_reference, transaction_date, amount,
              direction, matched_payout_id, matched_batch_id, reconciliation_status, created_by
            ) VALUES (
              $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
              'DEBIT', $5, $6, 'MATCHED', $7
            );`,
            [
              batch.organization_id,
              utr,
              bankItem.transactionDate || new Date().toISOString().slice(0, 10),
              bankAmount,
              matchedItem.payout_id,
              batchId,
              auth.userId,
            ]
          );

          processedResults.push({
            itemId: matchedItem.id,
            customerReference: cleanRef,
            farmerCode: matchedItem.farmer_code,
            expectedAmount,
            bankAmount,
            bankUtr: utr,
            status: 'PAID',
            message: 'Successfully settled and posted to ledger',
            isIdempotentReplay: false,
          });
        } else if (bankItem.status === 'FAILED') {
          // Bank rejected payout item -> Does NOT deduct farmer balance
          await payoutService.failPayout(
            matchedItem.payout_id,
            auth,
            bankItem.failureReason || 'Rejected by Union Bank clearing house'
          );

          await client.query(
            `UPDATE payment_batch_items
             SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
             WHERE id = $2;`,
            [bankItem.failureReason || 'Bank transfer rejected', matchedItem.id]
          );

          processedResults.push({
            itemId: matchedItem.id,
            customerReference: cleanRef,
            farmerCode: matchedItem.farmer_code,
            expectedAmount,
            bankAmount,
            status: 'FAILED',
            message: `Bank transfer failed: ${bankItem.failureReason || 'Rejected'}`,
            isIdempotentReplay: false,
          });
        } else if (bankItem.status === 'REVERSED') {
          // Bank reversed a previously cleared payout -> Post compensating reversal credit
          await client.query(
            `UPDATE payment_batch_items
             SET status = 'REVERSED', failure_reason = 'Payment returned by clearing house', updated_at = NOW()
             WHERE id = $1;`,
            [matchedItem.id]
          );

          // Create Compensating Reversal in payment_adjustments & ledger
          const reversalId = crypto.randomUUID();
          await client.query(
            `INSERT INTO payment_adjustments (
              id, organization_id, center_id, customer_id, payout_id,
              adjustment_type, amount, reason, approved_by, created_at
            ) VALUES (
              $1, $2, $3, $4, $5,
              'REVERSAL_CREDIT', $6, $7, $8, NOW()
            );`,
            [
              reversalId,
              batch.organization_id,
              matchedItem.center_id,
              matchedItem.customer_id,
              matchedItem.payout_id,
              expectedAmount,
              `Compensating reversal for returned payout ${matchedItem.payout_id}. UTR: ${bankItem.bankUtr || 'N/A'}`,
              auth.userId,
            ]
          );

          // Credit back the farmer's ledger account
          await client.query(
            `UPDATE customer_ledger_accounts
             SET current_balance = current_balance + $1, last_transaction_at = NOW(), updated_at = NOW()
             WHERE customer_id = $2;`,
            [expectedAmount, matchedItem.customer_id]
          );

          await client.query(
            `INSERT INTO ledger_transactions (
              id, organization_id, center_id, customer_id, transaction_type,
              direction, amount, balance_after, reference_entity, reference_id,
              description, idempotency_key, created_by
            ) SELECT 
              $1, $2, $3, $4, 'PAYOUT_REVERSAL_CREDIT',
              'CREDIT', $5, cla.current_balance, 'CUSTOMER_PAYOUT', $6,
              $7, $8, $9
            FROM customer_ledger_accounts cla WHERE cla.customer_id = $4;`,
            [
              reversalId,
              batch.organization_id,
              matchedItem.center_id,
              matchedItem.customer_id,
              expectedAmount,
              matchedItem.payout_id,
              `Compensating reversal credit for returned payout ${matchedItem.payout_id}`,
              `REV-${reversalId}-${Date.now()}`,
              auth.userId,
            ]
          );

          processedResults.push({
            itemId: matchedItem.id,
            customerReference: cleanRef,
            farmerCode: matchedItem.farmer_code,
            expectedAmount,
            bankAmount,
            bankUtr: bankItem.bankUtr,
            status: 'REVERSED',
            message: 'Compensating ledger reversal credit applied successfully',
            isIdempotentReplay: false,
          });
        } else {
          // UNKNOWN status
          await client.query(
            `UPDATE payment_batch_items
             SET status = 'UNKNOWN', bank_status_description = $1, updated_at = NOW()
             WHERE id = $2;`,
            [bankItem.failureReason || 'Awaiting bank clearance', matchedItem.id]
          );

          processedResults.push({
            itemId: matchedItem.id,
            customerReference: cleanRef,
            farmerCode: matchedItem.farmer_code,
            expectedAmount,
            bankAmount,
            status: 'UNKNOWN',
            message: 'Status remains unknown, manual inquiry or statement check required',
            isIdempotentReplay: false,
          });
        }

        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        exceptions.push({
          reference: cleanRef,
          reason: `Reconciliation transaction failed: ${err.message}`,
        });
      } finally {
        client.release();
      }
    }

    // 5. Update Payment Batch Aggregates
    const statsRes = await query(
      `SELECT 
        COUNT(id)::int as total,
        COUNT(CASE WHEN status IN ('PAID', 'SETTLED') THEN 1 END)::int as successful_count,
        COALESCE(SUM(CASE WHEN status IN ('PAID', 'SETTLED') THEN amount ELSE 0 END), 0)::numeric(12,2) as successful_amount,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int as failed_count,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0)::numeric(12,2) as failed_amount,
        COUNT(CASE WHEN status = 'REVERSED' THEN 1 END)::int as reversed_count,
        COUNT(CASE WHEN status = 'UNKNOWN' THEN 1 END)::int as unknown_count,
        COUNT(CASE WHEN status IN ('PENDING', 'SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING') THEN 1 END)::int as pending_count
       FROM payment_batch_items
       WHERE batch_id = $1;`,
      [batchId]
    );

    const stats = statsRes.rows[0];
    const total = Number(stats.total);
    const success = Number(stats.successful_count);
    const failed = Number(stats.failed_count);
    const reversed = Number(stats.reversed_count);
    const unknown = Number(stats.unknown_count);
    const pending = Number(stats.pending_count);

    let batchStatus = 'PROCESSING';
    let reconStatus = 'PARTIALLY_RECONCILED';

    if (success === total) {
      batchStatus = 'PAID';
      reconStatus = 'FULLY_RECONCILED';
    } else if (failed === total) {
      batchStatus = 'FAILED';
      reconStatus = 'FULLY_RECONCILED';
    } else if (success > 0 && pending === 0 && unknown === 0) {
      batchStatus = 'PARTIALLY_PAID';
      reconStatus = 'FULLY_RECONCILED';
    } else if (unknown > 0) {
      batchStatus = 'UNKNOWN';
    }

    await query(
      `UPDATE payment_batches
       SET status = $1,
           reconciliation_status = $2,
           successful_count = $3,
           successful_amount = $4,
           failed_count = $5,
           failed_amount = $6,
           completed_at = CASE WHEN $7 = 0 THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $8;`,
      [
        batchStatus,
        reconStatus,
        success,
        stats.successful_amount,
        failed,
        stats.failed_amount,
        pending,
        batchId,
      ]
    );

    return {
      batchId,
      batchStatus,
      reconciliationStatus: reconStatus,
      totalBeneficiaries: total,
      paidCount: success,
      successfulCount: success,
      failedCount: failed,
      reversedCount: reversed,
      unknownCount: unknown,
      processedItems: processedResults,
      exceptions,
    };
  }
}
