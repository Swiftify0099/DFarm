import crypto from 'node:crypto';
import type pg from 'pg';
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
import {
  flushDeferredNotifications,
  getStrictPaymentTenantDb,
  resolveOperationalOrganizationId,
  type DeferredNotification,
} from './tenant-payment-context.js';

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
  targetOrganizationId?: string;
}

export class PayoutService {
  async createPayout(params: CreatePayoutParams, auth: AuthContext, targetOrganizationId?: string | null) {
    const organizationId = resolveOperationalOrganizationId(
      auth,
      targetOrganizationId ?? params.targetOrganizationId
    );
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    try {
      return await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        try {
          const res = await client.query(
            `SELECT public.create_customer_payout(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            ) AS payout;`,
            [
              organizationId,
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

          return res.rows[0].payout;
        } catch (err: any) {
          if (err instanceof AppError) throw err;
          if (err.message?.includes('OVERPAYMENT_NOT_PERMITTED')) {
            throw new BadRequestError(err.message, 'OVERPAYMENT_NOT_PERMITTED');
          }
          if (err.code === 'P0002' || err.message?.includes('does not exist')) {
            throw new NotFoundError(err.message, 'CUSTOMER_NOT_FOUND');
          }
          if (err.code === '23505' || err.message?.includes('duplicate key')) {
            const existing = await client.query(
              `SELECT * FROM customer_payouts WHERE idempotency_key = $1 AND organization_id = $2;`,
              [params.idempotencyKey, organizationId]
            );
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
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(err.message, 500, 'PAYOUT_CREATION_FAILED');
    }
  }

  async approvePayout(
    payoutId: string,
    auth: AuthContext,
    comments?: string | null,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    try {
      return await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        const payoutRes = await client.query(
          `SELECT * FROM customer_payouts WHERE id = $1 FOR UPDATE;`,
          [payoutId]
        );
        if (payoutRes.rows.length === 0) {
          throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
        }
        const payout = payoutRes.rows[0];

        if (payout.organization_id !== organizationId) {
          throw new ForbiddenError('Cross-organization payout access prohibited', 'CROSS_ORG_ACCESS_DENIED');
        }

        if (
          payout.created_by === auth.userId &&
          auth.role !== UserRole.DAIRY_OWNER &&
          auth.role !== UserRole.SUPER_ADMIN &&
          auth.role !== UserRole.DAIRY_ADMIN
        ) {
          throw new ForbiddenError(
            'Separation of duties policy: You cannot approve a payout you created. An independent supervisor or owner must approve it.',
            'SELF_APPROVAL_PROHIBITED'
          );
        }

        try {
          const res = await client.query(
            'SELECT public.approve_customer_payout($1, $2, $3) AS result;',
            [payoutId, auth.userId, comments || null]
          );
          return res.rows[0].result;
        } catch (rpcErr: any) {
          if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
            await client.query(
              `UPDATE customer_payouts
               SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
               WHERE id = $2 AND organization_id = $3;`,
              [auth.userId, payoutId, organizationId]
            );
            await client.query(
              `INSERT INTO payment_approvals (
                organization_id, entity_type, entity_id, approver_id, action, comments
              ) VALUES ($1, 'PAYOUT', $2, $3, 'APPROVED', $4);`,
              [payout.organization_id, payoutId, auth.userId, comments || 'Approved for payout submission']
            );
            return {
              payoutId,
              status: 'APPROVED',
              approvedBy: auth.userId,
              approvedAt: new Date().toISOString(),
            };
          }
          throw rpcErr;
        }
      });
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

  async submitPayout(
    payoutId: string,
    auth: AuthContext,
    paymentReference?: string | null,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    try {
      // Phase 1 TX: Persist submission status inside tenant DB
      const result = await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        const pRes = await client.query(
          `SELECT * FROM customer_payouts WHERE id = $1 FOR UPDATE;`,
          [payoutId]
        );
        if (pRes.rows.length === 0) {
          throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
        }
        const p = pRes.rows[0];
        if (p.organization_id !== organizationId) {
          throw new ForbiddenError('Cross-organization payout access prohibited', 'CROSS_ORG_ACCESS_DENIED');
        }

        try {
          const res = await client.query(
            'SELECT public.submit_customer_payout($1, $2, $3) AS result;',
            [payoutId, auth.userId, paymentReference || null]
          );
          return res.rows[0].result;
        } catch (rpcErr: any) {
          if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
            await client.query(
              `UPDATE customer_payouts
               SET status = 'SUBMITTED', submitted_at = NOW(), reference_number = COALESCE($1, reference_number), updated_at = NOW()
               WHERE id = $2 AND organization_id = $3;`,
              [paymentReference || null, payoutId, organizationId]
            );
            return {
              payoutId,
              status: 'SUBMITTED',
              amount: Number(p.amount),
              recipientName: p.recipient_name || 'Beneficiary',
              referenceNumber: paymentReference || p.reference_number,
              submittedAt: new Date().toISOString(),
            };
          }
          throw rpcErr;
        }
      });

      // Phase 2 OUTSIDE DB TRANSACTION: Submit through external provider adapter
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
      if (err instanceof AppError) throw err;
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_SUBMISSION_FAILED');
    }
  }

  async confirmPayout(
    payoutId: string,
    auth: AuthContext,
    paymentReference: string,
    settledAt?: string,
    _notes?: string | null,
    targetOrganizationId?: string | null
  ) {
    if (!paymentReference || paymentReference.trim().length === 0) {
      throw new BadRequestError(
        'Genuine bank payment reference is mandatory for confirmed settlement',
        'MISSING_PAYMENT_REFERENCE'
      );
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);
    const parsedSettledAt = settledAt ? new Date(settledAt) : new Date();
    const deferredNotifications: DeferredNotification[] = [];

    try {
      const receipt = await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        const settled = await this.confirmPayoutInTransaction(
          client,
          payoutId,
          auth,
          organizationId,
          paymentReference.trim(),
          parsedSettledAt
        );

        const targetCustomerId = settled?.customerId;
        if (targetCustomerId && !settled?.isIdempotentReplay) {
          deferredNotifications.push({
            organizationId,
            centerId: settled?.centerId || auth.centerId,
            customerId: targetCustomerId,
            eventType: NotificationEventType.PAYMENT_SETTLED,
            eventId: `evt_payout_settled_${payoutId}`,
            idempotencyKey: `notif_payout_${payoutId}`,
            metadata: {
              payoutId,
              amount: Number(settled.amount),
              currency: settled.currency || 'INR',
              paymentMethod: settled.paymentMethod,
              referenceNumber: settled.referenceNumber || paymentReference.trim(),
              bankAccountMask: settled.bankAccountMask || 'XXXX-XXXX-XXXX',
              settledDate: parsedSettledAt.toLocaleDateString('en-GB'),
            },
          });
        }

        if (!settled.formattedReceipt && settled.customerName) {
          settled.formattedReceipt = formatPaymentReceipt({
            organizationName: settled.organizationName || 'DFarm Cooperative',
            centerName: settled.centerName || 'Intake Center',
            customerName: settled.customerName,
            farmerCode: settled.farmerCode || '',
            paymentId: settled.payoutId,
            receiptNumber: settled.receiptNumber || `RCP-PAY-${payoutId.slice(0, 8).toUpperCase()}`,
            direction: 'DAIRY_PAYS_CUSTOMER',
            amount: Number(settled.amount),
            currency: settled.currency || 'INR',
            paymentMethod: settled.paymentMethod,
            referenceNumber: settled.referenceNumber,
            status: settled.status,
            timestamp: settled.settledAt,
            authorizedActor: auth.authUser?.email || auth.authUser?.phone || auth.userId,
            previousBalance: Number(settled.previousBalance || 0),
            balanceAfter: Number(settled.customerBalanceAfter),
          });
        }

        return settled;
      });

      // Only notify AFTER tenant DB transaction commits
      await flushDeferredNotifications(deferredNotifications);

      return receipt;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_SETTLEMENT_FAILED');
    }
  }

  async failPayout(
    payoutId: string,
    auth: AuthContext,
    failureReason: string,
    targetOrganizationId?: string | null
  ) {
    if (!failureReason || failureReason.trim().length === 0) {
      throw new BadRequestError('Failure reason must be documented', 'MISSING_FAILURE_REASON');
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);
    const deferredNotifications: DeferredNotification[] = [];

    try {
      const result = await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        const failRes = await this.failPayoutInTransaction(
          client,
          payoutId,
          auth,
          organizationId,
          failureReason.trim()
        );

        if (failRes.customerId && !failRes.isIdempotentReplay) {
          deferredNotifications.push({
            organizationId,
            centerId: failRes.centerId || auth.centerId,
            customerId: failRes.customerId,
            eventType: NotificationEventType.PAYMENT_FAILED,
            eventId: `evt_payout_failed_${payoutId}`,
            idempotencyKey: `notif_payout_fail_${payoutId}`,
            metadata: {
              payoutId,
              amount: Number(failRes.amount || 0),
              referenceNumber: failRes.referenceNumber || 'N/A',
              failureReason: failureReason.trim(),
            },
          });
        }

        return failRes;
      });

      // Only notify AFTER tenant DB transaction commits
      await flushDeferredNotifications(deferredNotifications);

      return result;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      if (err.message?.includes('CANNOT_FAIL_SETTLED_PAYOUT')) {
        throw new BadRequestError(err.message, 'CANNOT_FAIL_SETTLED_PAYOUT');
      }
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_FAIL_FAILED');
    }
  }

  // =========================================================================
  // DF-022: TRANSACTION-AWARE METHODS
  //
  // These methods accept an existing pg.PoolClient from a caller-managed
  // tenant transaction. They:
  //   - Never acquire a new pool connection
  //   - Never use global query() for financial writes
  //   - Never commit or rollback the caller's transaction
  //   - Never silently switch databases
  //
  // The caller is responsible for BEGIN / COMMIT / ROLLBACK.
  // =========================================================================

  /**
   * Confirms (settles) a payout inside an existing tenant transaction.
   * Uses public.settle_customer_payout() through the supplied transaction client.
   * Falls back to direct SQL if the RPC is not yet deployed.
   *
   * @param client           - Existing tenant transaction client (from withTransaction)
   * @param payoutId         - UUID of the payout to settle
   * @param auth             - Authenticated caller context
   * @param organizationId   - Authoritative tenant organization ID
   * @param paymentReference - Bank UTR / payment reference
   * @param settledAt        - Settlement timestamp
   */
  async confirmPayoutInTransaction(
    client: pg.PoolClient,
    payoutId: string,
    auth: AuthContext,
    organizationId: string,
    paymentReference: string,
    settledAt: Date
  ): Promise<any> {
    if (!paymentReference || paymentReference.trim().length === 0) {
      throw new BadRequestError(
        'Genuine bank payment reference is mandatory for confirmed settlement',
        'MISSING_PAYMENT_REFERENCE'
      );
    }

    const trimmedRef = paymentReference.trim();

    // Lock the payout row
    const lockRes = await client.query(
      `SELECT id, status, organization_id, customer_id, center_id, amount, currency, batch_id,
              payment_method, reference_number, settled_at, ledger_transaction_id, idempotency_key
       FROM customer_payouts
       WHERE id = $1
       FOR UPDATE;`,
      [payoutId]
    );
    if (lockRes.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
    }
    const payout = lockRes.rows[0];

    // Ownership check
    if (payout.organization_id !== organizationId) {
      throw new ForbiddenError(
        'Payout organization does not match reconciliation target',
        'CROSS_ORG_PAYOUT_ACCESS_DENIED'
      );
    }

    // Idempotency vs conflicting UTR check when already SETTLED
    if (payout.status === 'SETTLED') {
      if (payout.reference_number && payout.reference_number !== trimmedRef) {
        throw new ConflictError(
          `Payout '${payoutId}' is already SETTLED with conflicting reference '${payout.reference_number}' (received '${trimmedRef}')`,
          'CONFLICTING_UTR_REFERENCE'
        );
      }

      const balRes = await client.query(
        `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1;`,
        [payout.customer_id]
      );
      const balanceAfter = balRes.rows[0] ? Number(balRes.rows[0].current_balance) : undefined;

      return {
        payoutId,
        status: 'SETTLED',
        amount: Number(payout.amount),
        currency: payout.currency || 'INR',
        paymentMethod: payout.payment_method,
        referenceNumber: payout.reference_number || trimmedRef,
        settledAt: payout.settled_at,
        ledgerTransactionId: payout.ledger_transaction_id,
        customerBalanceAfter: balanceAfter,
        customerId: payout.customer_id,
        organizationId: payout.organization_id,
        centerId: payout.center_id,
        isIdempotentReplay: true,
      };
    }

    if (payout.status !== 'SUBMITTED' && payout.status !== 'APPROVED') {
      throw new BadRequestError(
        `Payout ${payoutId} cannot be settled from status '${payout.status}'`,
        'INVALID_PAYOUT_STATUS'
      );
    }

    // Try settle_customer_payout RPC first through the caller's transaction client
    let receipt: any;
    try {
      const rpcRes = await client.query(
        'SELECT public.settle_customer_payout($1, $2, $3, $4) AS receipt;',
        [payoutId, auth.userId, trimmedRef, settledAt]
      );
      receipt = rpcRes.rows[0].receipt;
    } catch (rpcErr: any) {
      if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
        receipt = await this.executeSettlePayoutInTransaction(
          client,
          payout,
          auth,
          trimmedRef,
          settledAt
        );
      } else {
        throw rpcErr;
      }
    }

    const enriched = {
      ...receipt,
      customerId: receipt.customerId || payout.customer_id,
      organizationId: receipt.organizationId || payout.organization_id,
      centerId: receipt.centerId || payout.center_id,
      isIdempotentReplay: Boolean(receipt.isIdempotentReplay),
    };

    if (enriched.customerName) {
      enriched.formattedReceipt = formatPaymentReceipt({
        organizationName: enriched.organizationName || 'DFarm Cooperative',
        centerName: enriched.centerName || 'Intake Center',
        customerName: enriched.customerName,
        farmerCode: enriched.farmerCode || '',
        paymentId: enriched.payoutId,
        receiptNumber: enriched.receiptNumber || `RCP-PAY-${payoutId.slice(0, 8).toUpperCase()}`,
        direction: 'DAIRY_PAYS_CUSTOMER',
        amount: Number(enriched.amount ?? payout.amount),
        currency: enriched.currency || payout.currency || 'INR',
        paymentMethod: enriched.paymentMethod || payout.payment_method,
        referenceNumber: enriched.referenceNumber || trimmedRef,
        status: enriched.status || 'SETTLED',
        timestamp: enriched.settledAt || settledAt.toISOString(),
        authorizedActor: auth.authUser?.email || auth.authUser?.phone || auth.userId,
        previousBalance: Number(enriched.previousBalance || 0),
        balanceAfter: Number(enriched.customerBalanceAfter || 0),
      });
    }

    return enriched;
  }

  /**
   * Fallback settlement when settle_customer_payout RPC is unavailable.
   * Executes all financial writes through the caller's transaction client.
   * Never uses global query().
   */
  private async executeSettlePayoutInTransaction(
    client: pg.PoolClient,
    payout: any,
    auth: AuthContext,
    paymentReference: string,
    settledAt: Date
  ): Promise<any> {
    // Lock and get ledger account
    const ledRes = await client.query(
      `SELECT id, current_balance
       FROM customer_ledger_accounts
       WHERE customer_id = $1
       FOR UPDATE;`,
      [payout.customer_id]
    );

    let ledgerAccountId: string;
    let prevBalance = 0;

    if (ledRes.rows.length === 0) {
      ledgerAccountId = crypto.randomUUID();
      await client.query(
        `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at)
         VALUES ($1, $2, $3, 'INR', 0.00, NOW(), NOW());`,
        [ledgerAccountId, payout.customer_id, payout.organization_id]
      );
    } else {
      ledgerAccountId = ledRes.rows[0].id;
      prevBalance = Number(ledRes.rows[0].current_balance);
    }

    const newBalance = Number((prevBalance - Number(payout.amount)).toFixed(2));

    await client.query(
      `UPDATE customer_ledger_accounts
       SET current_balance = $1, last_transaction_at = $2, updated_at = NOW()
       WHERE id = $3;`,
      [newBalance, settledAt, ledgerAccountId]
    );

    const ledgerTxnId = crypto.randomUUID();
    await client.query(
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
        `Settled Payout via ${payout.payment_method || 'BANK_TRANSFER'} Ref: ${paymentReference}`,
        payout.idempotency_key || `txn_${ledgerTxnId}`,
        auth.userId,
        settledAt,
      ]
    );

    // Double-entry journal
    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, account_id, account_type, entry_type, amount)
       VALUES ($1, $2, $3, 'CUSTOMER_PAYABLE', 'DEBIT', $4);`,
      [crypto.randomUUID(), ledgerTxnId, ledgerAccountId, Number(payout.amount)]
    );
    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, account_id, account_type, entry_type, amount)
       VALUES ($1, $2, $3, 'CASH_BANK', 'CREDIT', $4);`,
      [crypto.randomUUID(), ledgerTxnId, payout.center_id, Number(payout.amount)]
    );

    // Update payout status
    await client.query(
      `UPDATE customer_payouts
       SET status = 'SETTLED', reference_number = $1, settled_at = $2, ledger_transaction_id = $3, updated_at = NOW()
       WHERE id = $4;`,
      [paymentReference, settledAt, ledgerTxnId, payout.id]
    );

    // Update batch item if applicable
    if (payout.batch_id) {
      await client.query(
        `UPDATE payment_batch_items
         SET status = 'SETTLED', settled_at = $1, beneficiary_reference = COALESCE($2, beneficiary_reference), updated_at = NOW()
         WHERE batch_id = $3 AND payout_id = $4;`,
        [settledAt, paymentReference, payout.batch_id, payout.id]
      );
    }

    // Fetch receipt display metadata through the same transaction client
    const metaRes = await client.query(
      `SELECT o.name AS org_name, dc.name AS center_name, c.full_name AS customer_name, c.farmer_code
       FROM customers c
       JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN dairy_centers dc ON dc.id = $2
       WHERE c.id = $1
       LIMIT 1;`,
      [payout.customer_id, payout.center_id]
    );
    const meta = metaRes.rows[0] || {};

    return {
      payoutId: payout.id,
      receiptNumber: `RCP-PAY-${String(payout.id).slice(0, 8).toUpperCase()}`,
      organizationName: meta.org_name,
      centerName: meta.center_name,
      customerName: meta.customer_name,
      farmerCode: meta.farmer_code,
      customerId: payout.customer_id,
      organizationId: payout.organization_id,
      centerId: payout.center_id,
      paymentMethod: payout.payment_method || 'BANK_TRANSFER',
      status: 'SETTLED',
      amount: Number(payout.amount),
      currency: payout.currency || 'INR',
      referenceNumber: paymentReference,
      settledAt: settledAt.toISOString(),
      ledgerTransactionId: ledgerTxnId,
      customerBalanceAfter: newBalance,
      previousBalance: prevBalance,
      isIdempotentReplay: false,
    };
  }

  /**
   * Marks a payout as FAILED inside an existing tenant transaction.
   * Uses public.fail_customer_payout() through the supplied transaction client.
   * Never debits the farmer ledger.
   *
   * @param client         - Existing tenant transaction client
   * @param payoutId       - UUID of the payout to fail
   * @param auth           - Authenticated caller context
   * @param organizationId - Authoritative tenant organization ID
   * @param failureReason  - Documented reason for failure
   */
  async failPayoutInTransaction(
    client: pg.PoolClient,
    payoutId: string,
    auth: AuthContext,
    organizationId: string,
    failureReason: string
  ): Promise<any> {
    if (!failureReason || failureReason.trim().length === 0) {
      throw new BadRequestError('Failure reason must be documented', 'MISSING_FAILURE_REASON');
    }

    const trimmedReason = failureReason.trim();

    // Lock the payout row
    const lockRes = await client.query(
      `SELECT id, status, organization_id, customer_id, center_id, amount, currency,
              reference_number, batch_id, failure_reason, failed_at
       FROM customer_payouts
       WHERE id = $1
       FOR UPDATE;`,
      [payoutId]
    );
    if (lockRes.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
    }
    const payout = lockRes.rows[0];

    // Ownership check
    if (payout.organization_id !== organizationId) {
      throw new ForbiddenError(
        'Payout organization does not match reconciliation target',
        'CROSS_ORG_PAYOUT_ACCESS_DENIED'
      );
    }

    // Guard: cannot fail a SETTLED or REVERSED payout
    if (payout.status === 'SETTLED') {
      throw new BadRequestError(
        `Cannot mark SETTLED payout '${payoutId}' as FAILED — use reversal instead`,
        'CANNOT_FAIL_SETTLED_PAYOUT'
      );
    }

    if (payout.status === 'REVERSED') {
      throw new BadRequestError(
        `Cannot mark REVERSED payout '${payoutId}' as FAILED`,
        'CANNOT_FAIL_REVERSED_PAYOUT'
      );
    }

    // Idempotent: already FAILED (never re-increment failed aggregate counts)
    if (payout.status === 'FAILED') {
      return {
        payoutId,
        customerId: payout.customer_id,
        centerId: payout.center_id,
        amount: Number(payout.amount),
        currency: payout.currency || 'INR',
        referenceNumber: payout.reference_number,
        status: 'FAILED',
        failureReason: payout.failure_reason || trimmedReason,
        failedAt: payout.failed_at,
        isIdempotentReplay: true,
      };
    }

    // Try fail_customer_payout RPC through the supplied transaction client
    try {
      const rpcRes = await client.query(
        'SELECT public.fail_customer_payout($1, $2, $3) AS result;',
        [payoutId, auth.userId, trimmedReason]
      );
      return {
        ...rpcRes.rows[0].result,
        customerId: payout.customer_id,
        centerId: payout.center_id,
        amount: Number(payout.amount),
        currency: payout.currency || 'INR',
        referenceNumber: payout.reference_number,
        isIdempotentReplay: Boolean(rpcRes.rows[0].result?.isIdempotentReplay),
      };
    } catch (rpcErr: any) {
      if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
        await client.query(
          `UPDATE customer_payouts
           SET status = 'FAILED', failed_at = NOW(), failure_reason = $1, updated_at = NOW()
           WHERE id = $2;`,
          [trimmedReason, payoutId]
        );

        if (payout.batch_id) {
          await client.query(
            `UPDATE payment_batch_items
             SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
             WHERE batch_id = $2 AND payout_id = $3;`,
            [trimmedReason, payout.batch_id, payoutId]
          );
        }

        return {
          payoutId,
          customerId: payout.customer_id,
          centerId: payout.center_id,
          amount: Number(payout.amount),
          currency: payout.currency || 'INR',
          referenceNumber: payout.reference_number,
          status: 'FAILED',
          failureReason: trimmedReason,
          failedAt: new Date().toISOString(),
          isIdempotentReplay: false,
        };
      }
      throw rpcErr;
    }
  }

  /**
   * Reverses a SETTLED payout inside an existing tenant transaction.
   * Uses public.reverse_customer_payout() through the supplied transaction client.
   * Credits the farmer ledger exactly once using the deterministic idempotency key.
   *
   * @param client                 - Existing tenant transaction client
   * @param payoutId               - UUID of the SETTLED payout to reverse
   * @param auth                   - Authenticated caller context
   * @param organizationId         - Authoritative tenant organization ID
   * @param reason                 - Reversal reason
   * @param reversalIdempotencyKey - Deterministic key: REV-{orgId}-{payoutId}-{utr}
   */
  async reversePayoutInTransaction(
    client: pg.PoolClient,
    payoutId: string,
    auth: AuthContext,
    organizationId: string,
    reason: string,
    reversalIdempotencyKey: string
  ): Promise<any> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError('Detailed reversal reason is required (min 5 chars)', 'INVALID_REVERSAL_REASON');
    }
    if (!reversalIdempotencyKey || reversalIdempotencyKey.trim().length === 0) {
      throw new BadRequestError('Reversal idempotency key is required', 'MISSING_REVERSAL_IDEMPOTENCY_KEY');
    }

    const trimmedReason = reason.trim();
    const trimmedKey = reversalIdempotencyKey.trim();

    // Lock payout and verify status
    const lockRes = await client.query(
      `SELECT id, status, organization_id, customer_id, center_id, amount, batch_id, updated_at
       FROM customer_payouts
       WHERE id = $1
       FOR UPDATE;`,
      [payoutId]
    );
    if (lockRes.rows.length === 0) {
      throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
    }
    const payout = lockRes.rows[0];

    // Ownership check
    if (payout.organization_id !== organizationId) {
      throw new ForbiddenError(
        'Payout organization does not match reconciliation target',
        'CROSS_ORG_PAYOUT_ACCESS_DENIED'
      );
    }

    // Handle already-REVERSED payouts BEFORE rejecting non-SETTLED status
    if (payout.status === 'REVERSED') {
      const existingTxnRes = await client.query(
        `SELECT id, idempotency_key, balance_after, created_at
         FROM ledger_transactions
         WHERE reference_entity = 'CUSTOMER_PAYMENT'
           AND reference_id = $1
           AND transaction_type = 'PAYOUT_REVERSAL_CREDIT'
         ORDER BY created_at DESC
         LIMIT 1;`,
        [payoutId]
      );
      const existingAdjRes = await client.query(
        `SELECT id, idempotency_key, reason, created_at
         FROM payment_adjustments
         WHERE payout_id = $1
           AND adjustment_type = 'REVERSAL_CREDIT'
         ORDER BY created_at DESC
         LIMIT 1;`,
        [payoutId]
      );

      const storedKey =
        existingAdjRes.rows[0]?.idempotency_key ||
        existingTxnRes.rows[0]?.idempotency_key ||
        null;

      if (storedKey && storedKey !== trimmedKey) {
        throw new ConflictError(
          `Payout '${payoutId}' is already REVERSED under conflicting reversal reference`,
          'CONFLICTING_REVERSAL_REFERENCE'
        );
      }

      const balRes = await client.query(
        `SELECT current_balance FROM customer_ledger_accounts WHERE customer_id = $1 LIMIT 1;`,
        [payout.customer_id]
      );
      const balanceAfter =
        balRes.rows[0] !== undefined
          ? Number(balRes.rows[0].current_balance)
          : Number(existingTxnRes.rows[0]?.balance_after ?? 0);

      return {
        payoutId,
        status: 'REVERSED',
        reversalReason: existingAdjRes.rows[0]?.reason || trimmedReason,
        ledgerTransactionId: existingTxnRes.rows[0]?.id || null,
        customerBalanceAfter: balanceAfter,
        reversedAt: existingTxnRes.rows[0]?.created_at || payout.updated_at,
        isIdempotentReplay: true,
      };
    }

    // Only SETTLED payouts may be reversed
    if (payout.status !== 'SETTLED') {
      throw new BadRequestError(
        `Cannot reverse payout '${payoutId}' with status '${payout.status}' — only SETTLED payouts can be reversed`,
        'CANNOT_REVERSE_NON_SETTLED_PAYOUT'
      );
    }

    // Try reverse_customer_payout RPC through caller's transaction client
    try {
      const rpcRes = await client.query(
        'SELECT public.reverse_customer_payout($1, $2, $3, $4) AS result;',
        [payoutId, auth.userId, trimmedReason, trimmedKey]
      );
      return {
        ...rpcRes.rows[0].result,
        isIdempotentReplay: Boolean(rpcRes.rows[0].result?.isIdempotentReplay),
      };
    } catch (rpcErr: any) {
      if (rpcErr.message?.includes('CONFLICTING_REVERSAL_REFERENCE')) {
        throw new ConflictError(rpcErr.message, 'CONFLICTING_REVERSAL_REFERENCE');
      }
      if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
        // Fallback when reverse_customer_payout RPC is unavailable — same client only
        const ledRes = await client.query(
          `SELECT id, current_balance
           FROM customer_ledger_accounts
           WHERE customer_id = $1
           FOR UPDATE;`,
          [payout.customer_id]
        );
        if (ledRes.rows.length === 0) {
          throw new BadRequestError(`No ledger account found for customer '${payout.customer_id}'`, 'LEDGER_ACCOUNT_NOT_FOUND');
        }
        const ledger = ledRes.rows[0];
        const prevBalance = Number(ledger.current_balance);
        const creditAmount = Number(payout.amount);
        const newBalance = Number((prevBalance + creditAmount).toFixed(2));

        const reversalId = crypto.randomUUID();

        await client.query(
          `UPDATE customer_ledger_accounts
           SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
           WHERE id = $2;`,
          [newBalance, ledger.id]
        );

        await client.query(
          `INSERT INTO ledger_transactions (
             id, organization_id, center_id, customer_id, transaction_type,
             direction, amount, balance_after, reference_entity, reference_id,
             description, idempotency_key, created_by
           ) VALUES (
             $1, $2, $3, $4, 'PAYOUT_REVERSAL_CREDIT',
             'CREDIT', $5, $6, 'CUSTOMER_PAYMENT', $7,
             $8, $9, $10
           );`,
          [
            reversalId,
            payout.organization_id,
            payout.center_id,
            payout.customer_id,
            creditAmount,
            newBalance,
            payoutId,
            `Compensating reversal credit: ${trimmedReason}`,
            trimmedKey,
            auth.userId,
          ]
        );

        await client.query(
          `INSERT INTO ledger_entries (id, transaction_id, account_id, account_type, entry_type, amount)
           VALUES ($1, $2, $3, 'CUSTOMER_PAYABLE', 'CREDIT', $4);`,
          [crypto.randomUUID(), reversalId, ledger.id, creditAmount]
        );
        await client.query(
          `INSERT INTO ledger_entries (id, transaction_id, account_id, account_type, entry_type, amount)
           VALUES ($1, $2, $3, 'CASH_BANK', 'DEBIT', $4);`,
          [crypto.randomUUID(), reversalId, payout.center_id, creditAmount]
        );

        await client.query(
          `INSERT INTO payment_adjustments (
             id, organization_id, center_id, customer_id, payout_id,
             adjustment_type, amount, reason, idempotency_key, approved_by, ledger_transaction_id, created_at
           ) VALUES ($1, $2, $3, $4, $5, 'REVERSAL_CREDIT', $6, $7, $8, $9, $10, NOW());`,
          [
            crypto.randomUUID(),
            payout.organization_id,
            payout.center_id,
            payout.customer_id,
            payoutId,
            creditAmount,
            trimmedReason,
            trimmedKey,
            auth.userId,
            reversalId,
          ]
        );

        await client.query(
          `UPDATE customer_payouts
           SET status = 'REVERSED', failure_reason = $1, updated_at = NOW()
           WHERE id = $2;`,
          [trimmedReason, payoutId]
        );

        if (payout.batch_id) {
          await client.query(
            `UPDATE payment_batch_items
             SET status = 'REVERSED', failure_reason = $1, updated_at = NOW()
             WHERE batch_id = $2 AND payout_id = $3;`,
            [trimmedReason, payout.batch_id, payoutId]
          );
        }

        return {
          payoutId,
          status: 'REVERSED',
          reversalReason: trimmedReason,
          ledgerTransactionId: reversalId,
          customerBalanceAfter: newBalance,
          reversedAt: new Date().toISOString(),
          isIdempotentReplay: false,
        };
      }
      throw rpcErr;
    }
  }

  async reversePayout(
    payoutId: string,
    auth: AuthContext,
    reason: string,
    idempotencyKey: string,
    targetOrganizationId?: string | null
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError('Detailed reversal reason is required (min 5 chars)', 'INVALID_REVERSAL_REASON');
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    try {
      return await tenantDb.withTransaction(async (client: pg.PoolClient) =>
        this.reversePayoutInTransaction(client, payoutId, auth, organizationId, reason, idempotencyKey)
      );
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      if (err.code === 'P0002') {
        throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
      }
      throw new BadRequestError(err.message, 'PAYOUT_REVERSAL_FAILED');
    }
  }

  async getPayoutById(
    payoutId: string,
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query(
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

      if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== row.customer_id) {
        throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
      }

      if (row.organization_id !== organizationId) {
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
    });
  }

  async getPayoutReceipt(
    payoutId: string,
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query(
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
      const payout = res.rows[0];

      if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== payout.customer_id) {
        throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
      }
      if (payout.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access is strictly prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      let balanceAfter: number | null = null;
      if (payout.ledger_transaction_id) {
        const txnRes = await client.query(
          'SELECT balance_after FROM ledger_transactions WHERE id = $1 AND organization_id = $2;',
          [payout.ledger_transaction_id, organizationId]
        );
        if (txnRes.rows.length > 0) {
          balanceAfter = Number(txnRes.rows[0].balance_after);
        }
      }

      const receiptNumber = 'RCP-PAY-' + payout.id.substring(0, 8).toUpperCase();

      return formatPaymentReceipt({
        organizationName: payout.organization_name,
        centerName: payout.center_name,
        customerName: payout.customer_name,
        farmerCode: payout.farmer_code,
        paymentId: payout.id,
        receiptNumber,
        direction: 'DAIRY_PAYS_CUSTOMER',
        amount: Number(payout.amount),
        currency: payout.currency,
        paymentMethod: payout.payment_method,
        referenceNumber: payout.reference_number,
        status: payout.status,
        timestamp: payout.settled_at || payout.created_at,
        authorizedActor: payout.approved_by || payout.created_by,
        bankAccountMask: payout.bank_account_mask,
        balanceAfter,
        notes: payout.notes,
      });
    });
  }

  async getCustomerPayouts(
    customerId: string,
    auth: AuthContext,
    filters?: { limit?: number; offset?: number },
    targetOrganizationId?: string | null
  ) {
    if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
      throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const offset = Math.max(0, filters?.offset || 0);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT p.id, p.center_id, p.direction, p.amount, p.currency, p.payment_method,
                p.status, p.reference_number, p.bank_account_mask, p.created_at, p.settled_at,
                p.failure_reason, p.batch_id
         FROM customer_payouts p
         WHERE p.customer_id = $1 AND p.organization_id = $2
         ORDER BY p.created_at DESC
         LIMIT $3 OFFSET $4;`,
        [customerId, organizationId, limit, offset]
      );

      const countRes = await client.query(
        'SELECT COUNT(*) as total FROM customer_payouts WHERE customer_id = $1 AND organization_id = $2;',
        [customerId, organizationId]
      );

      return {
        customerId,
        totalCount: parseInt(countRes.rows[0].total, 10),
        payouts: res.rows.map((r: any) => ({
          ...r,
          amount: Number(r.amount),
        })),
      };
    });
  }

  async getCustomerPaymentSummary(
    customerId: string,
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
      throw new ForbiddenError('You can only access your own payment summary', 'FORBIDDEN_CUSTOMER_ACCESS');
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const balanceRes = await client.query(
        `SELECT current_balance, currency, last_transaction_at
         FROM customer_ledger_accounts
         WHERE customer_id = $1 AND organization_id = $2;`,
        [customerId, organizationId]
      );
      const balance = balanceRes.rows.length > 0 ? Number(balanceRes.rows[0].current_balance) : 0.00;
      const currency = balanceRes.rows.length > 0 ? balanceRes.rows[0].currency : 'INR';

      const payoutsRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0.00) as total_payouts, COUNT(*) as count
         FROM customer_payouts
         WHERE customer_id = $1 AND organization_id = $2 AND status = 'SETTLED';`,
        [customerId, organizationId]
      );

      const receiptsRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0.00) as total_receipts, COUNT(*) as count
         FROM customer_receipts
         WHERE customer_id = $1 AND organization_id = $2 AND status = 'SETTLED';`,
        [customerId, organizationId]
      );

      const pendingRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0.00) as pending_payout_amount, COUNT(*) as pending_count
         FROM customer_payouts
         WHERE customer_id = $1 AND organization_id = $2 AND status IN ('PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');`,
        [customerId, organizationId]
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
    });
  }
}

export const payoutService = new PayoutService();

