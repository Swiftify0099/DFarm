import { query, pool } from '../../config/db.js';
import {
  BadRequestError,
  NotFoundError,
  AppError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { payoutService } from './payout.service.js';
import { PaymentProviderFactory } from './providers/provider.factory.js';
import crypto from 'node:crypto';

export interface BankStatementRowInput {
  transactionDate: string;
  referenceNumber: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  description?: string | null;
}

export interface BankStatementImportParams {
  fileName: string;
  rows: BankStatementRowInput[];
}

export class ReconciliationService {
  async importBankStatementCsv(params: BankStatementImportParams, auth: AuthContext) {
    if (!params.rows || params.rows.length === 0) {
      throw new BadRequestError('Bank statement import cannot be empty', 'EMPTY_STATEMENT');
    }

    const statementImportId = crypto.randomUUID();
    let matchedCount = 0;
    let unmatchedCount = 0;
    let mismatchCount = 0;
    let duplicateCount = 0;

    const previewRecords: any[] = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const row of params.rows) {
        const cleanRef = row.referenceNumber.trim();
        const amount = Number(row.amount);
        const recordId = crypto.randomUUID();

        // 1. Check duplicate external reference
        const dupRes = await client.query(
          `SELECT id, reconciliation_status FROM payment_reconciliation_records 
           WHERE organization_id = $1 AND external_reference = $2;`,
          [auth.organizationId, cleanRef]
        );

        let status = 'UNMATCHED';
        let matchedPayoutId: string | null = null;
        let matchedReceiptId: string | null = null;
        let matchedBatchId: string | null = null;

        if (dupRes.rows.length > 0) {
          status = 'DUPLICATE_REFERENCE';
          duplicateCount++;
        } else {
          // 2. Attempt to match with customer_payouts by reference or UTR
          const payoutRes = await client.query(
            `SELECT id, amount, status FROM customer_payouts 
             WHERE organization_id = $1 AND (reference_number = $2 OR reference_number ILIKE '%' || $2 || '%')
             LIMIT 1;`,
            [auth.organizationId, cleanRef]
          );

          if (payoutRes.rows.length > 0) {
            matchedPayoutId = payoutRes.rows[0].id;
            const expectedAmount = Number(payoutRes.rows[0].amount);

            if (Math.abs(expectedAmount - amount) < 0.01) {
              status = 'MATCHED';
              matchedCount++;
            } else {
              status = 'AMOUNT_MISMATCH';
              mismatchCount++;
            }
          } else {
            // Attempt to match with customer_receipts
            const receiptRes = await client.query(
              `SELECT id, amount, status FROM customer_receipts 
               WHERE organization_id = $1 AND (reference_number = $2 OR reference_number ILIKE '%' || $2 || '%')
               LIMIT 1;`,
              [auth.organizationId, cleanRef]
            );

            if (receiptRes.rows.length > 0) {
              matchedReceiptId = receiptRes.rows[0].id;
              const expectedAmount = Number(receiptRes.rows[0].amount);

              if (Math.abs(expectedAmount - amount) < 0.01) {
                status = 'MATCHED';
                matchedCount++;
              } else {
                status = 'AMOUNT_MISMATCH';
                mismatchCount++;
              }
            } else {
              // Attempt to match with payment_batches
              const batchRes = await client.query(
                `SELECT id, total_amount FROM payment_batches 
                 WHERE organization_id = $1 AND batch_number = $2 LIMIT 1;`,
                [auth.organizationId, cleanRef]
              );

              if (batchRes.rows.length > 0) {
                matchedBatchId = batchRes.rows[0].id;
                const expectedAmount = Number(batchRes.rows[0].total_amount);
                if (Math.abs(expectedAmount - amount) < 0.01) {
                  status = 'MATCHED';
                  matchedCount++;
                } else {
                  status = 'AMOUNT_MISMATCH';
                  mismatchCount++;
                }
              } else {
                status = 'UNMATCHED';
                unmatchedCount++;
              }
            }
          }
        }

        // Insert reconciliation record
        await client.query(
          `INSERT INTO payment_reconciliation_records (
            id, organization_id, statement_import_id, source, external_reference,
            transaction_date, amount, currency, direction, raw_details,
            matched_payout_id, matched_receipt_id, matched_batch_id,
            reconciliation_status, created_by, created_at
          ) VALUES (
            $1, $2, $3, 'BANK_STATEMENT_CSV', $4,
            $5, $6, 'INR', $7, $8,
            $9, $10, $11,
            $12, $13, NOW()
          );`,
          [
            recordId,
            auth.organizationId,
            statementImportId,
            cleanRef,
            row.transactionDate,
            amount,
            row.direction,
            JSON.stringify(row),
            matchedPayoutId,
            matchedReceiptId,
            matchedBatchId,
            status,
            auth.userId,
          ]
        );

        previewRecords.push({
          recordId,
          referenceNumber: cleanRef,
          transactionDate: row.transactionDate,
          amount,
          direction: row.direction,
          status,
          matchedPayoutId,
          matchedReceiptId,
        });
      }

      await client.query('COMMIT');

      return {
        statementImportId,
        fileName: params.fileName,
        totalImportedRows: params.rows.length,
        summary: {
          matchedCount,
          unmatchedCount,
          mismatchCount,
          duplicateCount,
        },
        records: previewRecords,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new AppError(err.message, 500, 'STATEMENT_IMPORT_FAILED');
    } finally {
      client.release();
    }
  }

  async processWebhook(
    payload: string | Buffer,
    signature: string,
    timestampHeader?: string,
    authContext?: AuthContext
  ) {
    const provider = PaymentProviderFactory.getProvider();
    const verification = await provider.verifyWebhook(payload, signature, timestampHeader);

    if (!verification.isValid) {
      throw new BadRequestError(`Webhook verification failed: ${verification.error}`, 'INVALID_WEBHOOK_SIGNATURE');
    }

    const event = verification.payload;
    const eventId = verification.eventId!;
    const reference = event.referenceNumber || event.utr || event.transactionId || event.paymentId;
    const amount = Number(event.amount);
    const orgId = authContext?.organizationId || event.organizationId;

    if (!reference) {
      throw new BadRequestError('Webhook payload missing transaction reference', 'MISSING_PAYLOAD_REFERENCE');
    }

    // Enforce idempotency: check if event ID was already processed
    const existingEvt = await query(
      'SELECT id, reconciliation_status, matched_payout_id FROM payment_reconciliation_records WHERE external_event_id = $1;',
      [eventId]
    );

    if (existingEvt.rows.length > 0) {
      return {
        reconciliationId: existingEvt.rows[0].id,
        status: existingEvt.rows[0].reconciliation_status,
        matchedPayoutId: existingEvt.rows[0].matched_payout_id,
        isIdempotentReplay: true,
      };
    }

    // Match against payout
    const payoutRes = await query(
      `SELECT id, amount, status FROM customer_payouts 
       WHERE (reference_number = $1 OR reference_number ILIKE '%' || $1 || '%')
       LIMIT 1;`,
      [reference]
    );

    let status = 'UNMATCHED';
    let matchedPayoutId: string | null = null;

    if (payoutRes.rows.length > 0) {
      matchedPayoutId = payoutRes.rows[0].id;
      const expectedAmount = Number(payoutRes.rows[0].amount);
      if (Math.abs(expectedAmount - amount) < 0.01) {
        status = 'MATCHED';
      } else {
        status = 'AMOUNT_MISMATCH';
      }
    }

    const recordId = crypto.randomUUID();
    await query(
      `INSERT INTO payment_reconciliation_records (
        id, organization_id, source, external_reference, external_event_id,
        transaction_date, amount, currency, direction, raw_details,
        matched_payout_id, reconciliation_status, created_at
      ) VALUES (
        $1, $2, 'PAYMENT_GATEWAY_WEBHOOK', $3, $4,
        CURRENT_DATE, $5, 'INR', 'DEBIT', $6,
        $7, $8, NOW()
      );`,
      [
        recordId,
        orgId || (await this.resolveDefaultOrgId()),
        reference,
        eventId,
        amount,
        JSON.stringify(event),
        matchedPayoutId,
        status,
      ]
    );

    return {
      reconciliationId: recordId,
      eventId,
      status,
      matchedPayoutId,
      isIdempotentReplay: false,
    };
  }

  async resolveRecord(
    recordId: string,
    action: 'CONFIRMED_SETTLED' | 'FLAGGED_MISMATCH' | 'REJECTED_DUPLICATE' | 'MANUALLY_MATCHED' | 'DISMISSED',
    notes: string,
    auth: AuthContext,
    matchedPayoutId?: string | null
  ) {
    const res = await query('SELECT * FROM payment_reconciliation_records WHERE id = $1;', [recordId]);
    if (res.rows.length === 0) {
      throw new NotFoundError(`Reconciliation record '${recordId}' not found`, 'RECON_NOT_FOUND');
    }
    const record = res.rows[0];

    const targetPayoutId = matchedPayoutId || record.matched_payout_id;

    // If confirmed settled, execute payout confirmation atomically
    if (action === 'CONFIRMED_SETTLED' && targetPayoutId) {
      await payoutService.confirmPayout(targetPayoutId, auth, record.external_reference);
    }

    await query(
      `UPDATE payment_reconciliation_records
       SET resolution_action = $1::varchar,
           resolution_notes = $2::text,
           matched_payout_id = COALESCE($3::uuid, matched_payout_id),
           reconciliation_status = CASE WHEN $1::text = 'CONFIRMED_SETTLED' THEN 'MATCHED'::varchar ELSE reconciliation_status END,
           resolved_by = $4::uuid,
           resolved_at = NOW()
       WHERE id = $5::uuid;`,
      [action, notes, targetPayoutId || null, auth.userId, recordId]
    );

    return {
      recordId,
      action,
      notes,
      resolvedBy: auth.userId,
      resolvedAt: new Date().toISOString(),
    };
  }

  async getReconciliationRecords(auth: AuthContext, filters?: { status?: string; limit?: number; offset?: number }) {
    let q = 'SELECT * FROM payment_reconciliation_records WHERE organization_id = $1';
    const params: any[] = [auth.organizationId];

    if (filters?.status) {
      params.push(filters.status);
      q += ` AND reconciliation_status = $${params.length}`;
    }

    q += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2) + ';';
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const offset = Math.max(0, filters?.offset || 0);
    params.push(limit, offset);

    const res = await query(q, params);
    return res.rows.map(r => ({
      ...r,
      amount: Number(r.amount),
    }));
  }

  private async resolveDefaultOrgId(): Promise<string> {
    const org = await query('SELECT id FROM organizations LIMIT 1;');
    return org.rows[0]?.id || crypto.randomUUID();
  }
}

export const reconciliationService = new ReconciliationService();
