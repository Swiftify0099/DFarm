import { query } from '../../config/db.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError, AppError, } from '../../shared/errors/app-error.js';
import { formatPaymentReceipt } from './payment-receipt-formatter.js';
import { PaymentProviderFactory } from './providers/provider.factory.js';
import { UserRole, NotificationEventType } from '@dfarm/shared-types';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';
export class PayoutService {
    async createPayout(params, auth) {
        try {
            const res = await query(`SELECT public.create_customer_payout(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) AS payout;`, [
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
            ]);
            const payout = res.rows[0].payout;
            return payout;
        }
        catch (err) {
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
    async approvePayout(payoutId, auth, comments) {
        try {
            // 1. Separation of duties: Creator cannot approve their own payout unless OWNER or SUPER_ADMIN
            const payoutRes = await query('SELECT * FROM customer_payouts WHERE id = $1;', [payoutId]);
            if (payoutRes.rows.length === 0) {
                throw new NotFoundError(`Payout '${payoutId}' not found`, 'PAYOUT_NOT_FOUND');
            }
            const payout = payoutRes.rows[0];
            if (payout.created_by === auth.userId && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_ADMIN) {
                throw new ForbiddenError('Separation of duties policy: You cannot approve a payout you created. An independent supervisor or owner must approve it.', 'SELF_APPROVAL_PROHIBITED');
            }
            const res = await query('SELECT public.approve_customer_payout($1, $2, $3) AS result;', [payoutId, auth.userId, comments || null]);
            return res.rows[0].result;
        }
        catch (err) {
            if (err instanceof AppError)
                throw err;
            if (err.message?.includes('SELF_APPROVAL_PROHIBITED')) {
                throw new ForbiddenError(err.message, 'SELF_APPROVAL_PROHIBITED');
            }
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'PAYOUT_APPROVAL_FAILED');
        }
    }
    async submitPayout(payoutId, auth, paymentReference) {
        try {
            const res = await query('SELECT public.submit_customer_payout($1, $2, $3) AS result;', [payoutId, auth.userId, paymentReference || null]);
            const result = res.rows[0].result;
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
        }
        catch (err) {
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'PAYOUT_SUBMISSION_FAILED');
        }
    }
    async confirmPayout(payoutId, auth, paymentReference, settledAt, _notes) {
        if (!paymentReference || paymentReference.trim().length === 0) {
            throw new BadRequestError('Genuine bank payment reference is mandatory for confirmed settlement', 'MISSING_PAYMENT_REFERENCE');
        }
        try {
            const parsedSettledAt = settledAt ? new Date(settledAt) : new Date();
            const res = await query('SELECT public.settle_customer_payout($1, $2, $3, $4) AS receipt;', [payoutId, auth.userId, paymentReference.trim(), parsedSettledAt]);
            const receipt = res.rows[0].receipt;
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
        }
        catch (err) {
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'PAYOUT_SETTLEMENT_FAILED');
        }
    }
    async failPayout(payoutId, auth, failureReason) {
        if (!failureReason || failureReason.trim().length === 0) {
            throw new BadRequestError('Failure reason must be documented', 'MISSING_FAILURE_REASON');
        }
        try {
            const res = await query('SELECT public.fail_customer_payout($1, $2, $3) AS result;', [payoutId, auth.userId, failureReason.trim()]);
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
            return res.rows[0].result;
        }
        catch (err) {
            if (err.message?.includes('CANNOT_FAIL_SETTLED_PAYOUT')) {
                throw new BadRequestError(err.message, 'CANNOT_FAIL_SETTLED_PAYOUT');
            }
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'PAYOUT_FAIL_FAILED');
        }
    }
    async reversePayout(payoutId, auth, reason, idempotencyKey) {
        if (!reason || reason.trim().length < 5) {
            throw new BadRequestError('Detailed reversal reason is required (min 5 chars)', 'INVALID_REVERSAL_REASON');
        }
        try {
            const res = await query('SELECT public.reverse_customer_payout($1, $2, $3, $4) AS result;', [payoutId, auth.userId, reason.trim(), idempotencyKey]);
            return res.rows[0].result;
        }
        catch (err) {
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'PAYOUT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'PAYOUT_REVERSAL_FAILED');
        }
    }
    async getPayoutById(payoutId, auth) {
        const res = await query(`SELECT p.*, c.full_name as customer_name, c.farmer_code, dc.name as center_name, o.name as organization_name
       FROM customer_payouts p
       JOIN customers c ON c.id = p.customer_id
       JOIN dairy_centers dc ON dc.id = p.center_id
       JOIN organizations o ON o.id = p.organization_id
       WHERE p.id = $1;`, [payoutId]);
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
    async getPayoutReceipt(payoutId, auth) {
        const payout = await this.getPayoutById(payoutId, auth);
        // Get ledger balance after if settled
        let balanceAfter = null;
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
    async getCustomerPayouts(customerId, auth, filters) {
        if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
            throw new ForbiddenError('You can only access your own payouts', 'FORBIDDEN_CUSTOMER_ACCESS');
        }
        const limit = Math.min(100, Math.max(1, filters?.limit || 20));
        const offset = Math.max(0, filters?.offset || 0);
        const res = await query(`SELECT p.id, p.center_id, p.direction, p.amount, p.currency, p.payment_method,
              p.status, p.reference_number, p.bank_account_mask, p.created_at, p.settled_at,
              p.failure_reason, p.batch_id
       FROM customer_payouts p
       WHERE p.customer_id = $1 AND p.organization_id = $2
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4;`, [customerId, auth.organizationId, limit, offset]);
        const countRes = await query('SELECT COUNT(*) as total FROM customer_payouts WHERE customer_id = $1 AND organization_id = $2;', [customerId, auth.organizationId]);
        return {
            customerId,
            totalCount: parseInt(countRes.rows[0].total, 10),
            payouts: res.rows.map(r => ({
                ...r,
                amount: Number(r.amount),
            })),
        };
    }
    async getCustomerPaymentSummary(customerId, auth) {
        if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== customerId) {
            throw new ForbiddenError('You can only access your own payment summary', 'FORBIDDEN_CUSTOMER_ACCESS');
        }
        // Customer ledger balance
        const balanceRes = await query('SELECT current_balance, currency, last_transaction_at FROM customer_ledger_accounts WHERE customer_id = $1;', [customerId]);
        const balance = balanceRes.rows.length > 0 ? Number(balanceRes.rows[0].current_balance) : 0.00;
        const currency = balanceRes.rows.length > 0 ? balanceRes.rows[0].currency : 'INR';
        // Settled Payouts Sum
        const payoutsRes = await query(`SELECT COALESCE(SUM(amount), 0.00) as total_payouts, COUNT(*) as count
       FROM customer_payouts
       WHERE customer_id = $1 AND status = 'SETTLED';`, [customerId]);
        // Settled Receipts Sum (Farmer Repayments)
        const receiptsRes = await query(`SELECT COALESCE(SUM(amount), 0.00) as total_receipts, COUNT(*) as count
       FROM customer_receipts
       WHERE customer_id = $1 AND status = 'SETTLED';`, [customerId]);
        // Pending / Submitted Payouts
        const pendingRes = await query(`SELECT COALESCE(SUM(amount), 0.00) as pending_payout_amount, COUNT(*) as pending_count
       FROM customer_payouts
       WHERE customer_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED', 'SUBMITTED');`, [customerId]);
        return {
            customerId,
            currentBalance: balance,
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
//# sourceMappingURL=payout.service.js.map