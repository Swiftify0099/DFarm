import { query, pool } from '../../config/db.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  AppError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { payoutService } from './payout.service.js';
import crypto from 'node:crypto';

export interface CreateBatchParams {
  centerId?: string | null;
  billingCycleId?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  paymentMethod?: string;
  customerIds?: string[];
  payoutIds?: string[];
  idempotencyKey: string;
}

export interface ReconcileBatchItemInput {
  itemId: string;
  status: 'SETTLED' | 'FAILED';
  beneficiaryReference?: string | null;
  failureReason?: string | null;
}

function formatDateOnly(d: any): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.split('T')[0] ?? null;
  if (d instanceof Date || (typeof d === 'object' && typeof d.toISOString === 'function')) {
    const dateObj = d instanceof Date ? d : new Date(d);
    // If stored as UTC midnight or offset, handle IST
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).split('T')[0] ?? null;
}

export class BatchService {
  async createBatch(params: CreateBatchParams, auth: AuthContext) {
    const existing = await query('SELECT * FROM payment_batches WHERE idempotency_key = $1;', [params.idempotencyKey]);
    if (existing.rows.length > 0) {
      const b = existing.rows[0];
      return {
        batchId: b.id,
        batchNumber: b.batch_number,
        status: b.status,
        totalBeneficiaries: b.total_beneficiaries,
        totalAmount: Number(b.total_amount),
        isIdempotentReplay: true,
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const batchId = crypto.randomUUID();
      const batchNumber = 'BATCH-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

      // Find eligible beneficiaries with payable balance > 0
      let customersQuery = `
        SELECT c.id, c.primary_center_id, c.full_name, c.farmer_code, c.bank_name,
               c.bank_account_number, c.bank_ifsc_code, cla.current_balance
        FROM customers c
        JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
        WHERE c.organization_id = $1 AND c.is_deleted = FALSE AND cla.current_balance > 0.00
      `;
      const queryArgs: any[] = [auth.organizationId];

      if (params.centerId) {
        queryArgs.push(params.centerId);
        customersQuery += ` AND c.primary_center_id = $${queryArgs.length}`;
      }

      if (params.customerIds && params.customerIds.length > 0) {
        queryArgs.push(params.customerIds);
        customersQuery += ` AND c.id = ANY($${queryArgs.length}::uuid[])`;
      }

      const eligibleRes = await client.query(customersQuery, queryArgs);

      if (eligibleRes.rows.length === 0) {
        throw new BadRequestError('No eligible customers with payable balance found for batch creation', 'NO_ELIGIBLE_CUSTOMERS');
      }

      let totalBatchAmount = 0.00;
      for (const cust of eligibleRes.rows) {
        totalBatchAmount += Number(cust.current_balance);
      }

      // Create Payment Batch Header FIRST so payouts and batch items can reference it via foreign key
      await client.query(
        `INSERT INTO payment_batches (
          id, organization_id, center_id, batch_number, billing_cycle_id,
          billing_period_start, billing_period_end, payment_method, status,
          total_beneficiaries, total_amount, pending_count, pending_amount,
          idempotency_key, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, 'DRAFT',
          $9, $10, $9, $10,
          $11, $12, NOW(), NOW()
        );`,
        [
          batchId,
          auth.organizationId,
          params.centerId || null,
          batchNumber,
          params.billingCycleId || null,
          params.billingPeriodStart || null,
          params.billingPeriodEnd || null,
          params.paymentMethod || 'BANK_TRANSFER',
          eligibleRes.rows.length,
          totalBatchAmount,
          params.idempotencyKey,
          auth.userId,
        ]
      );

      const batchItems: any[] = [];

      for (const cust of eligibleRes.rows) {
        const payableAmount = Number(cust.current_balance);

        const payoutId = crypto.randomUUID();
        const mask = cust.bank_account_number && cust.bank_account_number.length >= 4
          ? 'XXXX-XXXX-' + cust.bank_account_number.slice(-4)
          : null;

        const payoutIdempotency = `BATCH-ITEM-${batchId}-${cust.id}`;

        // Insert Payout in DRAFT status linked to batch
        await client.query(
          `INSERT INTO customer_payouts (
            id, organization_id, center_id, customer_id, batch_id, direction,
            amount, currency, payment_method, status, reference_number,
            source_transaction_type, source_transaction_id, idempotency_key,
            bank_account_mask, bank_ifsc, recipient_name, created_by,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'DAIRY_PAYS_CUSTOMER',
            $6, 'INR', $7, 'DRAFT', $8,
            'BATCH_DISBURSEMENT', $9, $10,
            $11, $12, $13, $14,
            NOW(), NOW()
          );`,
          [
            payoutId,
            auth.organizationId,
            cust.primary_center_id,
            cust.id,
            batchId,
            payableAmount,
            params.paymentMethod || 'BANK_TRANSFER',
            `REF-${batchNumber}-${cust.farmer_code}`,
            batchId,
            payoutIdempotency,
            mask,
            cust.bank_ifsc_code,
            cust.full_name,
            auth.userId,
          ]
        );

        const itemId = crypto.randomUUID();
        await client.query(
          `INSERT INTO payment_batch_items (
            id, batch_id, payout_id, customer_id, amount, currency,
            bank_account_mask, bank_ifsc, status, beneficiary_reference, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'INR',
            $6, $7, 'PENDING', $8, NOW(), NOW()
          );`,
          [
            itemId,
            batchId,
            payoutId,
            cust.id,
            payableAmount,
            mask,
            cust.bank_ifsc_code,
            `REF-${batchNumber}-${cust.farmer_code}`,
          ]
        );

        batchItems.push({
          itemId,
          payoutId,
          customerId: cust.id,
          customerName: cust.full_name,
          farmerCode: cust.farmer_code,
          amount: payableAmount,
          bankAccountMask: mask,
          bankIfsc: cust.bank_ifsc_code,
        });
      }

      await client.query('COMMIT');

      return {
        batchId,
        batchNumber,
        status: 'DRAFT',
        totalBeneficiaries: batchItems.length,
        totalAmount: totalBatchAmount,
        currency: 'INR',
        beneficiaries: batchItems,
        isIdempotentReplay: false,
        createdAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err instanceof AppError) throw err;
      if (err.code === '23505') {
        throw new ConflictError('A batch with this idempotency key already exists', 'BATCH_CONFLICT');
      }
      throw new AppError(err.message, 500, 'BATCH_CREATION_FAILED');
    } finally {
      client.release();
    }
  }

  async approveBatch(batchId: string, auth: AuthContext) {
    const res = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (res.rows.length === 0) {
      throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const batch = res.rows[0];

    if (batch.status !== 'DRAFT' && batch.status !== 'PENDING_APPROVAL') {
      throw new BadRequestError(`Batch cannot be approved from status '${batch.status}'`, 'INVALID_BATCH_STATUS');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE payment_batches
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2;`,
        [auth.userId, batchId]
      );

      await client.query(
        `UPDATE customer_payouts
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE batch_id = $2;`,
        [auth.userId, batchId]
      );

      await client.query(
        `INSERT INTO payment_approvals (
          organization_id, entity_type, entity_id, approver_id, action, comments
        ) VALUES ($1, 'BATCH', $2, $3, 'APPROVED', 'Batch approved for payout submission');`,
        [batch.organization_id, batchId, auth.userId]
      );

      await client.query('COMMIT');

      return {
        batchId,
        status: 'APPROVED',
        approvedBy: auth.userId,
        approvedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new AppError(err.message, 500, 'BATCH_APPROVAL_FAILED');
    } finally {
      client.release();
    }
  }

  async submitBatch(batchId: string, _auth: AuthContext) {
    const res = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (res.rows.length === 0) {
      throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const batch = res.rows[0];

    if (batch.status !== 'APPROVED') {
      throw new BadRequestError(`Batch must be APPROVED before submission (current: '${batch.status}')`, 'INVALID_BATCH_STATUS');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE payment_batches
         SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1;`,
        [batchId]
      );

      await client.query(
        `UPDATE customer_payouts
         SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'SUBMITTED', updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      await client.query('COMMIT');

      return {
        batchId,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        ledgerEffectApplied: false,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new AppError(err.message, 500, 'BATCH_SUBMISSION_FAILED');
    } finally {
      client.release();
    }
  }

  async reconcileBatch(batchId: string, results: ReconcileBatchItemInput[], auth: AuthContext) {
    const res = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (res.rows.length === 0) {
      throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const batch = res.rows[0];

    let settledCount = 0;
    let failedCount = 0;
    const processedItems: any[] = [];

    for (const itemResult of results) {
      const itemRes = await query('SELECT * FROM payment_batch_items WHERE id = $1 AND batch_id = $2;', [itemResult.itemId, batchId]);
      if (itemRes.rows.length === 0) {
        continue;
      }
      const item = itemRes.rows[0];

      if (itemResult.status === 'SETTLED') {
        try {
          const settlement = await payoutService.confirmPayout(
            item.payout_id,
            auth,
            itemResult.beneficiaryReference || item.beneficiary_reference || `BATCH-UTR-${batch.batch_number}`
          );
          settledCount++;
          processedItems.push({
            itemId: item.id,
            payoutId: item.payout_id,
            status: 'SETTLED',
            amount: Number(item.amount),
            settledAt: settlement.settledAt,
          });
        } catch (err: any) {
          processedItems.push({
            itemId: item.id,
            payoutId: item.payout_id,
            status: 'FAILED',
            amount: Number(item.amount),
            error: err.message,
          });
          failedCount++;
        }
      } else {
        // Beneficiary transfer failed
        await payoutService.failPayout(
          item.payout_id,
          auth,
          itemResult.failureReason || 'Bank account invalid or rejected by beneficiary clearing house'
        );
        failedCount++;
        processedItems.push({
          itemId: item.id,
          payoutId: item.payout_id,
          status: 'FAILED',
          amount: Number(item.amount),
          failureReason: itemResult.failureReason,
        });
      }
    }

    // Refresh batch stats
    const updatedStatsRes = await query(
      `SELECT successful_count, failed_count, total_beneficiaries
       FROM payment_batches WHERE id = $1;`,
      [batchId]
    );
    const updatedStats = updatedStatsRes.rows[0];
    const total = updatedStats.total_beneficiaries;
    const success = updatedStats.successful_count;
    const failed = updatedStats.failed_count;

    let finalBatchStatus = 'PARTIALLY_SETTLED';
    if (success === total) {
      finalBatchStatus = 'SETTLED';
    } else if (failed === total) {
      finalBatchStatus = 'FAILED';
    }

    const reconStatus = (success + failed === total) ? 'FULLY_RECONCILED' : 'PARTIALLY_RECONCILED';

    await query(
      `UPDATE payment_batches
       SET status = $1, reconciliation_status = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $3;`,
      [finalBatchStatus, reconStatus, batchId]
    );

    return {
      batchId,
      batchStatus: finalBatchStatus,
      reconciliationStatus: reconStatus,
      totalBeneficiaries: total,
      successfulCount: success,
      failedCount: failed,
      processedInCall: processedItems.length,
      items: processedItems,
    };
  }

  async getBatchById(batchId: string, _auth: AuthContext) {
    const res = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (res.rows.length === 0) {
      throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const b = res.rows[0];

    const itemsRes = await query(
      `SELECT bi.*, c.full_name as customer_name, c.farmer_code
       FROM payment_batch_items bi
       JOIN customers c ON c.id = bi.customer_id
       WHERE bi.batch_id = $1
       ORDER BY bi.created_at ASC;`,
      [batchId]
    );

    return {
      id: b.id,
      organizationId: b.organization_id,
      centerId: b.center_id,
      batchNumber: b.batch_number,
      billingCycleId: b.billing_cycle_id,
      billingPeriodStart: formatDateOnly(b.billing_period_start),
      billingPeriodEnd: formatDateOnly(b.billing_period_end),
      paymentMethod: b.payment_method,
      status: b.status,
      totalBeneficiaries: b.total_beneficiaries,
      totalAmount: Number(b.total_amount),
      successfulCount: b.successful_count,
      successfulAmount: Number(b.successful_amount),
      failedCount: b.failed_count,
      failedAmount: Number(b.failed_amount),
      pendingCount: b.pending_count,
      pendingAmount: Number(b.pending_amount),
      reconciliationStatus: b.reconciliation_status,
      createdAt: b.created_at,
      items: itemsRes.rows.map(i => ({
        id: i.id,
        payoutId: i.payout_id,
        customerId: i.customer_id,
        customerName: i.customer_name,
        farmerCode: i.farmer_code,
        amount: Number(i.amount),
        currency: i.currency,
        bankAccountMask: i.bank_account_mask,
        bankIfsc: i.bank_ifsc,
        status: i.status,
        beneficiaryReference: i.beneficiary_reference,
        failureReason: i.failure_reason,
        settledAt: i.settled_at,
      })),
    };
  }
}

export const batchService = new BatchService();

