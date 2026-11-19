import { query } from '../../config/db.js';
import crypto from 'node:crypto';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { formatPaymentReceipt } from './payment-receipt-formatter.js';
import { PaymentProviderFactory } from './providers/provider.factory.js';
import { UserRole, NotificationEventType } from '@dfarm/shared-types';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';

export interface CreatePayoutParams {
  centerId: string;
  customerId: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  sourceTransactionType?: string;
  sourceTransactionId?: string | null;
  idempotencyKey: string;
  notes?: string | null;
  allowOverpaymentAdvance?: boolean;
}

export class PayoutService {
  async createPayout(params: CreatePayoutParams, auth: AuthContext) {
    try {
      const res = await query(
        `SELECT public.create_customer_payout(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) AS payout;`,
        [
          auth.organizationId,
          params.centerId,
          params.customerId,
          params.amount,
          params.paymentMethod,
          params.referenceNumber || null,
          params.sourceTransactionType || 'MANUAL_PAYOUT',
          params.sourceTransactionId || null,
          params.idempotencyKey,
          Boolean(params.allowOverpaymentAdvance),
          params.notes || null,
          auth.userId,
        ]
      );

      const payout = res.rows[0].payout;
      return payout;
    } catch (err: any) {
      if (err.message?.includes('OVERPAYMENT_NOT_PERMITTED')) {
        throw new BadRequestError(err.message, 'OVERPAYMENT_NOT_PERMITTED');
      }
      if (err.code === 'P0002' || err.message?.includes('does not exist')) {
        throw new NotFoundError(err.message, 'CUSTOMER_NOT_FOUND');
      }
      if (err.code === '23505' || err.message?.includes('duplicate key')) {
        // Fetch existing by idempotency key
        const existing = await query('SELECT * FROM customer_payouts WHERE idempotency_key = $1;', [params.idempotencyKey]);
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          return {
            payoutId: row.id,
            customerId: row.customer_id,
            amount: Number(row.amount),
            currency: row.currency,
            paymentMethod: row.payment_method,
            status: row.status,
            referenceNumber: row.reference_number,
            idempotencyKey: row.idempotency_key,
            isIdempotentReplay: true,
          };
        }
        throw new ConflictError('A payout with this idempotency key already exists', 'IDEMPOTENCY_CONFLICT');
      }
      throw new AppError(err.message, 500, 'PAYOUT_CREATION_FAILED');
    }
  }

  async approvePayout(payoutId: string, auth: AuthContext, comments?: string | null) {
    try {
      // 1. Separation of duties: Creator cannot approve their own payout unless OWNER or SUPER_ADMIN
      const payoutRes = await query('SELECT * FROM customer_payouts WHERE id = $1;', [payoutId]);
      if (payoutRes.rows.length === 0) {
        throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
      }
      const payout = payoutRes.rows[0];

      if (payout.created_by === auth.userId && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_ADMIN) {
        throw new ForbiddenError(
          'Separation of duties policy: You cannot approve a payout you created. An independent supervisor or owner must approve it.',
          'SELF_APPROVAL_PROHIBITED'
        );
      }

      let result: any;
      try {
        const res = await query(
          'SELECT public.approve_customer_payout($1, $2, $3) AS result;',
          [payoutId, auth.userId, comments || null]
        );
        result = res.rows[0].result;
      } catch (rpcErr: any) {
        if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
          await query(
            `UPDATE customer_payouts
             SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
             WHERE id = $2;`,
            [auth.userId, payoutId]
          );
          await query(
            `INSERT INTO payment_approvals (
              organization_id, entity_type, entity_id, approver_id, action, comments
            ) VALUES ($1, 'PAYOUT', $2, $3, 'APPROVED', $4);`,
            [payout.organization_id, payoutId, auth.userId, comments || 'Approved for payout submission']
          );
          result = {
            payoutId,
            status: 'APPROVED',
            approvedBy: auth.userId,
            approvedAt: new Date().toISOString(),
          };
        } else {
          throw rpcErr;
        }
      }
      return result;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      if (err.message?.includes('SELF_APPROVAL_PROHIBITED')) {
        throw new ForbiddenError(err.message, 'SELF_APPROVAL_PROHIBITED');
      }
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_APPROVAL_FAILED');
    }
  }

  async submitPayout(payoutId: string, auth: AuthContext, paymentReference?: string | null) {
    try {
      let result: any;
      try {
        const res = await query(
          'SELECT public.submit_customer_payout($1, $2, $3) AS result;',
          [payoutId, auth.userId, paymentReference || null]
        );
        result = res.rows[0].result;
      } catch (rpcErr: any) {
        if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
          const pRes = await query('SELECT * FROM customer_payouts WHERE id = $1;', [payoutId]);
          if (pRes.rows.length === 0) throw new NotFoundError('Payout not found', 'PAYOUT_NOT_FOUND');
          const p = pRes.rows[0];
          await query(
            `UPDATE customer_payouts
             SET status = 'SUBMITTED', submitted_at = NOW(), reference_number = COALESCE($1, reference_number), updated_at = NOW()
             WHERE id = $2;`,
            [paymentReference || null, payoutId]
          );
          result = {
            payoutId,
            status: 'SUBMITTED',
            amount: Number(p.amount),
            referenceNumber: paymentReference || p.reference_number,
            submittedAt: new Date().toISOString(),
          };
        } else {
          throw rpcErr;
        }
      }

      // Submit through provider adapter without fake immediate settlement
      const provider = PaymentProviderFactory.getProvider();
      await provider.submitPayment({
        payoutId,
        amount: result.amount,
        currency: 'INR',
        recipientName: result.recipientName || 'Beneficiary',
        referenceNumber: result.referenceNumber || 'N/A',
      });

      return result;
    } catch (err: any) {
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_SUBMISSION_FAILED');
    }
  }

  private async executeSettlePayoutFallback(
    payoutId: string,
    auth: AuthContext,
    paymentReference: string,
    settledAt: Date
  ) {
    const pRes = await query('SELECT * FROM customer_payouts WHERE id = $1;', [payoutId]);
    if (pRes.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' does not exist`, 'PAYOUT_NOT_FOUND');
    }
    const payout = pRes.rows[0];

    // Idempotency check: If already SETTLED, return existing record
    if (payout.status === 'SETTLED') {
      const balRes = await query('SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1;', [payout.customer_id]);
      const currentBal = balRes.rows.length > 0 ? Number(balRes.rows[0].current_balance) : 0;
      return {
        payoutId: payout.id,
        status: 'SETTLED',
        amount: Number(payout.amount),
        referenceNumber: payout.reference_number,
        settledAt: payout.settled_at,
        ledgerTransactionId: payout.ledger_transaction_id,
        customerBalanceAfter: currentBal,
        isIdempotentReplay: true,
      };
    }

    if (payout.status !== 'SUBMITTED' && payout.status !== 'APPROVED' && payout.status !== 'PENDING') {
      throw new BadRequestError(`Payout ${payoutId} cannot be settled from status ${payout.status}`, 'INVALID_PAYOUT_STATUS');
    }

    const custRes = await query('SELECT * FROM customers WHERE id = $1;', [payout.customer_id]);
    const cust = custRes.rows[0] || {};
    const centerRes = await query('SELECT * FROM dairy_centers WHERE id = $1;', [payout.center_id]);
    const center = centerRes.rows[0] || {};

    const ledRes = await query('SELECT * FROM customer_ledger_accounts WHERE customer_id = $1;', [payout.customer_id]);
    let ledgerAccountId: string;
    let prevBalance = 0;
    if (ledRes.rows.length === 0) {
      ledgerAccountId = crypto.randomUUID();
      await query(
        `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at)
         VALUES ($1, $2, $3, 'INR', 0.00, NOW(), NOW());`,
        [ledgerAccountId, payout.customer_id, payout.organization_id]
      );
    } else {
      ledgerAccountId = ledRes.rows[0].id;
      prevBalance = Number(ledRes.rows[0].current_balance);
    }

    const newBalance = Number((prevBalance - Number(payout.amount)).toFixed(2));

    await query(
      `UPDATE customer_ledger_accounts
       SET current_balance = $1, last_transaction_at = $2, updated_at = NOW()
       WHERE id = $3;`,
      [newBalance, settledAt, ledgerAccountId]
    );

    if (payout.organization_id) {
      try {
        const tenantDb = await tenantDbManager.getTenantDb(payout.organization_id);
        await tenantDb.query(
          `UPDATE customer_ledger_accounts
           SET current_balance = GREATEST(0.00, current_balance - $1), last_transaction_at = $2, updated_at = NOW()
           WHERE customer_id = $3;`,
          [Number(payout.amount), settledAt, payout.customer_id]
        );
      } catch (tErr: any) {
        logger.warn({ error: tErr.message }, 'Failed to debit tenant db ledger in executeSettlePayoutFallback');
      }
    }

    const ledgerTxnId = crypto.randomUUID();
    await query(
      `INSERT INTO ledger_transactions (
        id, organization_id, center_id, customer_id,
        transaction_type, direction, amount, balance_after,
        reference_entity, reference_id, description,
        idempotency_key, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4,
        'PAYMENT_PAYOUT_DEBIT', 'DEBIT', $5, $6,
        'CUSTOMER_PAYMENT', $7, $8,
        $9, $10, $11
      );`,
      [
        ledgerTxnId,
        payout.organization_id,
        payout.center_id,
        payout.customer_id,
        Number(payout.amount),
        newBalance,
        payout.id,
        `Settled Payout via ${payout.payment_method} Ref: ${paymentReference}`,
        payout.idempotency_key || `txn_${ledgerTxnId}`,
        auth.userId,
        settledAt,
      ]
    );

    await query(
      `INSERT INTO ledger_entries (
        id, transaction_id, account_id, account_type, entry_type, amount
      ) VALUES (
        $1, $2, $3, 'CUSTOMER_PAYABLE', 'DEBIT', $4
      );`,
      [crypto.randomUUID(), ledgerTxnId, ledgerAccountId, Number(payout.amount)]
    );

    await query(
      `INSERT INTO ledger_entries (
        id, transaction_id, account_id, account_type, entry_type, amount
      ) VALUES (
        $1, $2, $3, 'CASH_BANK', 'CREDIT', $4
      );`,
      [crypto.randomUUID(), ledgerTxnId, payout.center_id, Number(payout.amount)]
    );

    await query(
      `UPDATE customer_payouts
       SET status = 'SETTLED', reference_number = $1, settled_at = $2, ledger_transaction_id = $3, updated_at = NOW()
       WHERE id = $4;`,
      [paymentReference, settledAt, ledgerTxnId, payoutId]
    );

    if (payout.batch_id) {
      await query(
        `UPDATE payment_batch_items
         SET status = 'SETTLED', settled_at = $1, beneficiary_reference = $2, updated_at = NOW()
         WHERE batch_id = $3 AND payout_id = $4;`,
        [settledAt, paymentReference, payout.batch_id, payoutId]
      );

      await query(
        `UPDATE payment_batches
         SET successful_count = successful_count + 1,
             successful_amount = successful_amount + $1,
             pending_count = GREATEST(0, pending_count - 1),
             pending_amount = GREATEST(0.00, pending_amount - $1),
             updated_at = NOW()
         WHERE id = $2;`,
        [Number(payout.amount), payout.batch_id]
      );
    }

    const receiptNumber = 'RCP-PAY-' + payout.id.substring(0, 8).toUpperCase();
    const orgRes = await query('SELECT name FROM organizations WHERE id = $1;', [payout.organization_id]);
    const orgName = orgRes.rows.length > 0 ? orgRes.rows[0].name : 'DFarm Cooperative';

    return {
      payoutId: payout.id,
      receiptNumber,
      organizationName: orgName,
      centerName: center.name || 'Intake Center',
      customerName: cust.full_name,
      farmerCode: cust.farmer_code,
      customerId: payout.customer_id,
      amount: Number(payout.amount),
      currency: payout.currency || 'INR',
      paymentMethod: payout.payment_method,
      status: 'SETTLED',
      referenceNumber: paymentReference,
      settledAt: settledAt.toISOString(),
      previousBalance: prevBalance,
      customerBalanceAfter: newBalance,
      ledgerTransactionId: ledgerTxnId,
      isIdempotentReplay: false,
    };
  }

  private async executeFailPayoutFallback(
    payoutId: string,
    _auth: AuthContext,
    failureReason: string
  ) {
    const pRes = await query('SELECT * FROM customer_payouts WHERE id = $1;', [payoutId]);
    if (pRes.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' does not exist`, 'PAYOUT_NOT_FOUND');
    }
    const payout = pRes.rows[0];

    if (payout.status === 'SETTLED') {
      throw new BadRequestError('CANNOT_FAIL_SETTLED_PAYOUT: Payout is already settled; use reversal instead', 'CANNOT_FAIL_SETTLED_PAYOUT');
    }

    await query(
      `UPDATE customer_payouts
       SET status = 'FAILED', failed_at = NOW(), failure_reason = $1, updated_at = NOW()
       WHERE id = $2;`,
      [failureReason, payoutId]
    );

    if (payout.batch_id) {
      await query(
        `UPDATE payment_batch_items
         SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
         WHERE batch_id = $2 AND payout_id = $3;`,
        [failureReason, payout.batch_id, payoutId]
      );

      await query(
        `UPDATE payment_batches
         SET failed_count = failed_count + 1,
             failed_amount = failed_amount + $1,
             pending_count = GREATEST(0, pending_count - 1),
             pending_amount = GREATEST(0.00, pending_amount - $1),
             updated_at = NOW()
         WHERE id = $2;`,
        [Number(payout.amount), payout.batch_id]
      );
    }

    return {
      payoutId,
      status: 'FAILED',
      failureReason,
      failedAt: new Date().toISOString(),
    };
  }

  async confirmPayout(
    payoutId: string,
    auth: AuthContext,
    paymentReference: string,
    settledAt?: string,
    _notes?: string | null
  ) {
    if (!paymentReference || paymentReference.trim().length === 0) {
      throw new BadRequestError('Genuine bank payment reference is mandatory for confirmed settlement', 'MISSING_PAYMENT_REFERENCE');
    }

    try {
      const parsedSettledAt = settledAt ? new Date(settledAt) : new Date();

      let receipt: any;
      try {
        const res = await query(
          'SELECT public.settle_customer_payout($1, $2, $3, $4) AS receipt;',
          [payoutId, auth.userId, paymentReference.trim(), parsedSettledAt]
        );
        receipt = res.rows[0].receipt;
      } catch (rpcErr: any) {
        if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
          receipt = await this.executeSettlePayoutFallback(payoutId, auth, paymentReference.trim(), parsedSettledAt);
        } else {
          throw rpcErr;
        }
      }

      // Ensure physical tenant database ledger is synchronized with settled payout debit
      let targetOrgId = receipt?.organizationId || receipt?.organization_id || auth.organizationId;
      let syncCustomerId = receipt?.customerId || receipt?.customer_id;
      let syncAmount = Number(receipt?.amount || 0);

      if (!syncCustomerId || syncAmount <= 0) {
        try {
          const pRes = await query('SELECT customer_id, organization_id, amount FROM customer_payouts WHERE id = $1', [payoutId]);
          if (pRes.rows[0]) {
            syncCustomerId = pRes.rows[0].customer_id;
            targetOrgId = pRes.rows[0].organization_id || targetOrgId;
            syncAmount = Number(pRes.rows[0].amount);
          }
        } catch {
          // fallback query safe ignore
        }
      }

      if (targetOrgId && syncCustomerId && syncAmount > 0) {
        try {
          const tenantDb = await tenantDbManager.getTenantDb(targetOrgId);
          await tenantDb.query(
            `UPDATE customer_ledger_accounts
             SET current_balance = GREATEST(0.00, current_balance - $1), last_transaction_at = $2, updated_at = NOW()
             WHERE customer_id = $3;`,
            [syncAmount, parsedSettledAt, syncCustomerId]
          );
        } catch {
          // ignore if tenant db is central fallback
        }
      }

      // Generate structured receipt with 40-column slip text
      const formatted = formatPaymentReceipt({
        organizationName: receipt.organizationName || 'DFarm Cooperative',
        centerName: receipt.centerName || 'Intake Center',
        customerName: receipt.customerName,
        farmerCode: receipt.farmerCode,
        paymentId: receipt.payoutId,
        receiptNumber: receipt.receiptNumber,
        direction: 'DAIRY_PAYS_CUSTOMER',
        amount: Number(receipt.amount),
        currency: receipt.currency || 'INR',
        paymentMethod: receipt.paymentMethod,
        referenceNumber: receipt.referenceNumber,
        status: receipt.status,
        timestamp: receipt.settledAt,
        authorizedActor: auth.authUser.email || auth.authUser.phone || auth.userId,
        previousBalance: Number(receipt.previousBalance || 0),
        balanceAfter: Number(receipt.customerBalanceAfter),
      });

      // Enqueue payment settled notification after commit
      const targetCustomerId = receipt.customerId || receipt.customer_id;
      if (targetCustomerId) {
        NotificationService.enqueueNotification({
          organizationId: auth.organizationId,
          centerId: auth.centerId,
          customerId: targetCustomerId,
          eventType: NotificationEventType.PAYMENT_SETTLED,
          eventId: `evt_payout_settled_${payoutId}`,
          idempotencyKey: `notif_payout_${payoutId}`,
          metadata: {
            payoutId,
            amount: Number(receipt.amount),
            currency: receipt.currency || 'INR',
            paymentMethod: receipt.paymentMethod,
            referenceNumber: paymentReference.trim(),
            bankAccountMask: receipt.bankAccountMask || 'XXXX-XXXX-XXXX',
            settledDate: parsedSettledAt.toLocaleDateString('en-GB'),
          },
        }).catch(e => logger.error({ error: e.message }, 'Failed to enqueue payment settled notification'));
      }

      return {
        ...receipt,
        formattedReceipt: formatted,
      };
    } catch (err: any) {
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_SETTLEMENT_FAILED');
    }
  }

  async failPayout(payoutId: string, auth: AuthContext, failureReason: string) {
    if (!failureReason || failureReason.trim().length === 0) {
      throw new BadRequestError('Failure reason must be documented', 'MISSING_FAILURE_REASON');
    }

    try {
      let result: any;
      try {
        const res = await query(
          'SELECT public.fail_customer_payout($1, $2, $3) AS result;',
          [payoutId, auth.userId, failureReason.trim()]
        );
        result = res.rows[0].result;
      } catch (rpcErr: any) {
        if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
          result = await this.executeFailPayoutFallback(payoutId, auth, failureReason.trim());
        } else {
          throw rpcErr;
        }
      }

      // Enqueue payment failed notification
      query('SELECT customer_id, amount, reference_number FROM customer_payouts WHERE id = $1;', [payoutId])
        .then(pRes => {
          if (pRes.rows.length > 0) {
            const p = pRes.rows[0];
            NotificationService.enqueueNotification({
              organizationId: auth.organizationId,
              centerId: auth.centerId,
              customerId: p.customer_id,
              eventType: NotificationEventType.PAYMENT_FAILED,
              eventId: `evt_payout_failed_${payoutId}`,
              idempotencyKey: `notif_payout_fail_${payoutId}`,
              metadata: {
                payoutId,
                amount: Number(p.amount),
                referenceNumber: p.reference_number || 'N/A',
                failureReason: failureReason.trim(),
              },
            }).catch(e => logger.error({ error: e.message }, 'Failed to enqueue payment failed notification'));
          }
        })
        .catch(e => logger.error({ error: e.message }, 'Failed to lookup payout for fail notification'));

      return result;
    } catch (err: any) {
      if (err.message?.includes('CANNOT_FAIL_SETTLED_PAYOUT')) {
        throw new BadRequestError(err.message, 'CANNOT_FAIL_SETTLED_PAYOUT');
      }
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_FAIL_FAILED');
    }
  }

  async reversePayout(payoutId: string, auth: AuthContext, reason: string, idempotencyKey: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError('Detailed reversal reason is required (min 5 chars)', 'INVALID_REVERSAL_REASON');
    }

    try {
      const res = await query(
        'SELECT public.reverse_customer_payout($1, $2, $3, $4) AS result;',
        [payoutId, auth.userId, reason.trim(), idempotencyKey]
      );
      return res.rows[0].result;
    } catch (err: any) {
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_REVERSAL_FAILED');
    }
  }

  async getPayoutById(payoutId: string, auth: AuthContext) {
    const res = await query(
      `SELECT p.*, c.full_name as customer_name, c.farmer_code, dc.name as center_name, o.name as organization_name
       FROM customer_payouts p
       JOIN customers c ON c.id = p.customer_id
       JOIN dairy_centers dc ON dc.id = p.center_id
       JOIN organizations o ON o.id = p.organization_id
       WHERE p.id = $1;`,
      [payoutId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
    }

    const row = res.rows[0];

    // Customer ownership & organization security check
    if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== row.customer_id) {
      throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
    }

    if (auth.organizationId !== row.organization_id && auth.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Cross-organization access is strictly prohibited', 'CROSS_ORG_ACCESS_DENIED');
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      centerId: row.center_id,
      centerName: row.center_name,
      customerId: row.customer_id,
      customerName: row.customer_name,
      farmerCode: row.farmer_code,
      batchId: row.batch_id,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency,
      paymentMethod: row.payment_method,
      status: row.status,
      referenceNumber: row.reference_number,
      bankAccountMask: row.bank_account_mask,
      recipientName: row.recipient_name,
      notes: row.notes,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      submittedAt: row.submitted_at,
      settledAt: row.settled_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      ledgerTransactionId: row.ledger_transaction_id,
      createdAt: row.created_at,
    };
  }

  async getPayoutReceipt(payoutId: string, auth: AuthContext) {
    const payout = await this.getPayoutById(payoutId, auth);

    // Get ledger balance after if settled
    let balanceAfter: number | null = null;
    if (payout.ledgerTransactionId) {
      const txnRes = await query('SELECT balance_after FROM ledger_transactions WHERE id = $1;', [payout.ledgerTransactionId]);
      if (txnRes.rows.length > 0) {
        balanceAfter = Number(txnRes.rows[0].balance_after);
      }
    }

    const receiptNumber = 'RCP-PAY-' + payout.id.substring(0, 8).toUpperCase();

    const formatted = formatPaymentReceipt({
      organizationName: payout.organizationName,
      centerName: payout.centerName,
      customerName: payout.customerName,
      farmerCode: payout.farmerCode,
      paymentId: payout.id,
      receiptNumber,
      direction: 'DAIRY_PAYS_CUSTOMER',
      amount: payout.amount,
      currency: payout.currency,
      paymentMethod: payout.paymentMethod,
      referenceNumber: payout.referenceNumber,
      status: payout.status,
      timestamp: payout.settledAt || payout.createdAt,
      authorizedActor: payout.approvedBy || payout.createdBy,
      bankAccountMask: payout.bankAccountMask,
      balanceAfter,
      notes: payout.notes,
    });

    return formatted;
  }

  async getCustomerPayouts(customerId: string, auth: AuthContext, filters?: { limit?: number; offset?: number }) {
    if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
      throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
    }

    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const offset = Math.max(0, filters?.offset || 0);

    const res = await query(
      `SELECT p.id, p.center_id, p.direction, p.amount, p.currency, p.payment_method,
              p.status, p.reference_number, p.bank_account_mask, p.created_at, p.settled_at,
              p.failure_reason, p.batch_id
       FROM customer_payouts p
       WHERE p.customer_id = $1 AND p.organization_id = $2
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4;`,
      [customerId, auth.organizationId, limit, offset]
    );

    const countRes = await query(
      'SELECT COUNT(*) as total FROM customer_payouts WHERE customer_id = $1 AND organization_id = $2;',
      [customerId, auth.organizationId]
    );

    return {
      customerId,
      totalCount: parseInt(countRes.rows[0].total, 10),
      payouts: res.rows.map(r => ({
        ...r,
        amount: Number(r.amount),
      })),
    };
  }

  async getCustomerPaymentSummary(customerId: string, auth: AuthContext) {
    if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
      throw new ForbiddenError('You can only access your own payment summary', 'FORBIDDEN_CUSTOMER_ACCESS');
    }

    // Customer ledger balance
    const balanceRes = await query(
      'SELECT current_balance, currency, last_transaction_at FROM customer_ledger_accounts WHERE customer_id = $1;',
      [customerId]
    );
    const balance = balanceRes.rows.length > 0 ? Number(balanceRes.rows[0].current_balance) : 0.00;
    const currency = balanceRes.rows.length > 0 ? balanceRes.rows[0].currency : 'INR';

    // Settled Payouts Sum
    const payoutsRes = await query(
      `SELECT COALESCE(SUM(amount), 0.00) as total_payouts, COUNT(*) as count
       FROM customer_payouts
       WHERE customer_id = $1 AND status = 'SETTLED';`,
      [customerId]
    );

    // Settled Receipts Sum (Farmer Repayments)
    const receiptsRes = await query(
      `SELECT COALESCE(SUM(amount), 0.00) as total_receipts, COUNT(*) as count
       FROM customer_receipts
       WHERE customer_id = $1 AND status = 'SETTLED';`,
      [customerId]
    );

    // Pending / Submitted Payouts
    const pendingRes = await query(
      `SELECT COALESCE(SUM(amount), 0.00) as pending_payout_amount, COUNT(*) as pending_count
       FROM customer_payouts
       WHERE customer_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');`,
      [customerId]
    );

    return {
      customerId,
      currentBalance: balance,
      currentPayableBalance: Math.max(0, balance),
      eligiblePayableAmount: Math.max(0, balance),
      outstandingCustomerReceivable: balance < 0 ? Math.abs(balance) : 0.00,
      currency,
      totalSettledPayoutsAmount: Number(payoutsRes.rows[0].total_payouts),
      settledPayoutsCount: parseInt(payoutsRes.rows[0].count, 10),
      totalSettledReceiptsAmount: Number(receiptsRes.rows[0].total_receipts),
      settledReceiptsCount: parseInt(receiptsRes.rows[0].count, 10),
      pendingPayoutsAmount: Number(pendingRes.rows[0].pending_payout_amount),
      pendingPayoutsCount: parseInt(pendingRes.rows[0].pending_count, 10),
    };
  }
}

export const payoutService = new PayoutService();

