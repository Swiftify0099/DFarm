// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: STATUS INQUIRY SERVICE (DF-022 FIX)
// ==============================================================================
//
// DF-022 TRANSACTION BOUNDARY DESIGN:
//   - Strict tenant DB resolution via `getStrictPaymentTenantDb(organizationId)`
//     with `{ bypassCache: true, strictOperational: true }`.
//   - External HTTP inquiry (`this.apiClient.queryPaymentStatus`) executes completely
//     OUTSIDE any database transaction.
//   - All status transitions (`PAID`, `FAILED`, `REVERSED`, `PENDING`, `UNKNOWN`),
//     ledger mutations (via `payoutService.*InTransaction`), reconciliation audit
//     rows, and batch aggregate recomputation execute inside a single short tenant
//     DB transaction (`tenantDb.withTransaction`).
//   - Notifications enqueue ONLY after transaction commit.
//   - Strict rule: An `UNKNOWN` inquiry result is NEVER marked `FAILED`.
//
// ==============================================================================
import { BadRequestError, ForbiddenError, NotFoundError, } from '../../../shared/errors/app-error.js';
import { flushDeferredNotifications, getStrictPaymentTenantDb, recomputeBatchAggregatesInTransaction, resolveOperationalOrganizationId, } from '../../../modules/payments/tenant-payment-context.js';
import { NotificationEventType } from '@dfarm/shared-types';
import { UnionBankApiClient } from './UnionBankApiClient.js';
import { payoutService } from '../../../modules/payments/payout.service.js';
export class UnionBankStatusInquiryService {
    static apiClient = new UnionBankApiClient();
    /**
     * Performs an authoritative status inquiry for a timed-out or UNKNOWN batch item.
     * Strict rule: UNKNOWN is NEVER automatically marked FAILED.
     */
    static async queryItemStatus(itemId, auth, targetOrganizationId) {
        if (!itemId || !itemId.trim()) {
            throw new BadRequestError('itemId is required for status inquiry', 'INVALID_ITEM_ID');
        }
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        // Phase 1 TX: Read item & verify batch/organization ownership inside tenant DB
        const itemContext = await tenantDb.withTransaction(async (client) => {
            const itemRes = await client.query(`SELECT bi.id AS item_id,
                bi.batch_id,
                bi.payout_id,
                bi.customer_id,
                bi.amount,
                bi.status,
                bi.beneficiary_reference,
                bi.bank_utr,
                bi.bank_reference_number,
                pb.organization_id,
                pb.batch_number,
                c.farmer_code,
                cp.center_id,
                cp.currency,
                cp.payment_method,
                cp.bank_account_mask
         FROM payment_batch_items bi
         JOIN payment_batches pb ON pb.id = bi.batch_id
         JOIN customers c ON c.id = bi.customer_id
         JOIN customer_payouts cp ON cp.id = bi.payout_id
         WHERE bi.id = $1;`, [itemId]);
            if (itemRes.rows.length === 0) {
                throw new NotFoundError(`Payment batch item '${itemId}' not found`, 'ITEM_NOT_FOUND');
            }
            const row = itemRes.rows[0];
            if (row.organization_id !== organizationId) {
                throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
            }
            const customerRef = (row.beneficiary_reference && String(row.beneficiary_reference).trim()) ||
                `REF-${row.batch_number}-${row.farmer_code}`;
            return {
                itemId: row.item_id,
                batchId: row.batch_id,
                payoutId: row.payout_id,
                customerId: row.customer_id,
                centerId: row.center_id,
                expectedAmount: Number(row.amount),
                previousStatus: row.status,
                customerRef,
                bankUtr: row.bank_utr || undefined,
                currency: row.currency || 'INR',
                paymentMethod: row.payment_method || 'BANK_TRANSFER',
                bankAccountMask: row.bank_account_mask || 'XXXX-XXXX-XXXX',
            };
        });
        // Phase 2 (OUTSIDE DB TRANSACTION): External bank inquiry
        const bankResult = await this.apiClient.queryPaymentStatus(itemContext.customerRef, itemContext.bankUtr);
        // Phase 3 TX: Lock batch + item, apply ledger transition via payoutService.*InTransaction,
        // update item/recon/aggregates inside ONE tenant transaction
        const deferredNotifications = [];
        const txOutcome = await tenantDb.withTransaction(async (client) => {
            const batchLockRes = await client.query(`SELECT organization_id
         FROM payment_batches
         WHERE id = $1
         FOR UPDATE;`, [itemContext.batchId]);
            if (batchLockRes.rows.length === 0 || batchLockRes.rows[0].organization_id !== organizationId) {
                throw new ForbiddenError('Batch ownership verification failed during status inquiry', 'CROSS_ORG_ACCESS_DENIED');
            }
            const itemLockRes = await client.query(`SELECT status, bank_utr
         FROM payment_batch_items
         WHERE id = $1 AND batch_id = $2
         FOR UPDATE;`, [itemContext.itemId, itemContext.batchId]);
            if (itemLockRes.rows.length === 0) {
                throw new NotFoundError(`Payment batch item '${itemContext.itemId}' not found`, 'ITEM_NOT_FOUND');
            }
            let currentStatus = itemLockRes.rows[0].status;
            let canSafeRetry = false;
            let inquiryNotes = '';
            let settledAt;
            let resolvedBankUtr = (bankResult.bankUtr && bankResult.bankUtr.trim()) ||
                itemLockRes.rows[0].bank_utr ||
                undefined;
            let isIdempotentReplay = false;
            if (bankResult.status === 'PAID') {
                // Explicit zero-safe monetary validation when bank reports an amount (> 0 expected;
                // some mock inquiries return 0 when inquiry payload only carries status/UTR)
                const hasReportedPositiveAmount = typeof bankResult.amount === 'number' && Number.isFinite(bankResult.amount) && bankResult.amount > 0;
                const expectedPaise = Math.round(itemContext.expectedAmount * 100);
                const reportedPaise = hasReportedPositiveAmount ? Math.round(bankResult.amount * 100) : expectedPaise;
                if (reportedPaise !== expectedPaise) {
                    currentStatus = 'UNKNOWN';
                    canSafeRetry = false;
                    inquiryNotes = `Amount mismatch during status inquiry: expected ₹${itemContext.expectedAmount.toFixed(2)}, bank reported ₹${Number(bankResult.amount).toFixed(2)}. Settlement held.`;
                    await client.query(`UPDATE payment_batch_items
             SET status = 'UNKNOWN',
                 bank_utr = COALESCE($1, bank_utr),
                 bank_status_code = 'AMOUNT_MISMATCH',
                 bank_status_description = $2,
                 last_inquiry_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3 AND batch_id = $4;`, [resolvedBankUtr || null, inquiryNotes, itemContext.itemId, itemContext.batchId]);
                    await client.query(`INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_payout_id, matched_batch_id, reconciliation_status,
               resolution_action, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               'DEBIT', $5, $6, 'AMOUNT_MISMATCH',
               'HOLD_FOR_TREASURY_REVIEW', $7, $8, $9
             );`, [
                        organizationId,
                        resolvedBankUtr || itemContext.customerRef,
                        (bankResult.transactionDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
                        Number(bankResult.amount),
                        itemContext.payoutId,
                        itemContext.batchId,
                        inquiryNotes,
                        JSON.stringify(bankResult),
                        auth.userId,
                    ]);
                }
                else {
                    const utr = resolvedBankUtr ||
                        (bankResult.bankReference && bankResult.bankReference.trim()) ||
                        `UBI-UTR-${itemContext.customerRef}`;
                    const settledDate = bankResult.transactionDate ? new Date(bankResult.transactionDate) : new Date();
                    const validSettledDate = Number.isNaN(settledDate.getTime()) ? new Date() : settledDate;
                    const settlement = await payoutService.confirmPayoutInTransaction(client, itemContext.payoutId, auth, organizationId, utr, validSettledDate);
                    isIdempotentReplay = Boolean(settlement?.isIdempotentReplay);
                    resolvedBankUtr = settlement?.referenceNumber || utr;
                    currentStatus = 'PAID';
                    settledAt = settlement?.settledAt;
                    canSafeRetry = false;
                    inquiryNotes = isIdempotentReplay
                        ? `Payment already settled in ledger with UTR ${resolvedBankUtr} (idempotent replay).`
                        : `Bank confirmed successful settlement with UTR ${resolvedBankUtr}. Ledger debit posted.`;
                    await client.query(`UPDATE payment_batch_items
             SET status = 'PAID',
                 bank_utr = COALESCE(bank_utr, $1),
                 bank_reference_number = COALESCE(bank_reference_number, $1),
                 bank_status_code = 'PAID',
                 bank_status_description = 'Settled via Union Bank status inquiry',
                 settled_at = COALESCE(settled_at, $2),
                 last_inquiry_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3 AND batch_id = $4;`, [resolvedBankUtr, validSettledDate, itemContext.itemId, itemContext.batchId]);
                    if (!isIdempotentReplay) {
                        await client.query(`INSERT INTO payment_reconciliation_records (
                 organization_id, source, external_reference, transaction_date, amount,
                 direction, matched_payout_id, matched_batch_id, reconciliation_status,
                 resolution_action, resolution_notes, raw_details, created_by
               ) VALUES (
                 $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
                 'DEBIT', $5, $6, 'MATCHED',
                 'UNION_BANK_PAID', $7, $8, $9
               )
               ON CONFLICT (organization_id, matched_payout_id, resolution_action, external_reference)
               WHERE reconciliation_status = 'MATCHED'
                 AND matched_payout_id IS NOT NULL
                 AND resolution_action IS NOT NULL
                 AND external_reference IS NOT NULL
               DO NOTHING;`, [
                            organizationId,
                            resolvedBankUtr,
                            validSettledDate.toISOString().slice(0, 10),
                            itemContext.expectedAmount,
                            itemContext.payoutId,
                            itemContext.batchId,
                            inquiryNotes,
                            JSON.stringify(bankResult),
                            auth.userId,
                        ]);
                        deferredNotifications.push({
                            organizationId,
                            centerId: itemContext.centerId,
                            customerId: itemContext.customerId,
                            eventType: NotificationEventType.PAYMENT_SETTLED,
                            eventId: `evt_payout_settled_${itemContext.payoutId}`,
                            idempotencyKey: `notif_payout_${itemContext.payoutId}`,
                            metadata: {
                                payoutId: itemContext.payoutId,
                                amount: itemContext.expectedAmount,
                                currency: itemContext.currency,
                                paymentMethod: itemContext.paymentMethod,
                                referenceNumber: resolvedBankUtr,
                                bankAccountMask: itemContext.bankAccountMask,
                                settledDate: validSettledDate.toLocaleDateString('en-GB'),
                            },
                        });
                    }
                }
            }
            else if (bankResult.status === 'FAILED') {
                const failureReason = bankResult.failureReason || 'Confirmed rejected by Union Bank clearing house';
                const failRes = await payoutService.failPayoutInTransaction(client, itemContext.payoutId, auth, organizationId, failureReason);
                isIdempotentReplay = Boolean(failRes?.isIdempotentReplay);
                currentStatus = 'FAILED';
                canSafeRetry = true;
                inquiryNotes = isIdempotentReplay
                    ? `Transaction already marked FAILED (idempotent replay): ${failureReason}`
                    : `Bank confirmed transaction failed: ${failureReason}. Re-inclusion in future batch is permitted.`;
                await client.query(`UPDATE payment_batch_items
           SET status = 'FAILED',
               bank_utr = COALESCE($1, bank_utr),
               bank_status_code = 'FAILED',
               bank_status_description = $2,
               failure_reason = $2,
               last_inquiry_at = NOW(),
               updated_at = NOW()
           WHERE id = $3 AND batch_id = $4;`, [resolvedBankUtr || null, failureReason, itemContext.itemId, itemContext.batchId]);
                if (!isIdempotentReplay) {
                    await client.query(`INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_payout_id, matched_batch_id, reconciliation_status,
               resolution_action, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               'DEBIT', $5, $6, 'MATCHED',
               'UNION_BANK_FAILED', $7, $8, $9
             )
             ON CONFLICT (organization_id, matched_payout_id, resolution_action, external_reference)
             WHERE reconciliation_status = 'MATCHED'
               AND matched_payout_id IS NOT NULL
               AND resolution_action IS NOT NULL
               AND external_reference IS NOT NULL
             DO NOTHING;`, [
                        organizationId,
                        resolvedBankUtr || itemContext.customerRef,
                        (bankResult.transactionDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
                        itemContext.expectedAmount,
                        itemContext.payoutId,
                        itemContext.batchId,
                        inquiryNotes,
                        JSON.stringify(bankResult),
                        auth.userId,
                    ]);
                    deferredNotifications.push({
                        organizationId,
                        centerId: itemContext.centerId,
                        customerId: itemContext.customerId,
                        eventType: NotificationEventType.PAYMENT_FAILED,
                        eventId: `evt_payout_failed_${itemContext.payoutId}`,
                        idempotencyKey: `notif_payout_failed_${itemContext.payoutId}`,
                        metadata: {
                            payoutId: itemContext.payoutId,
                            amount: itemContext.expectedAmount,
                            currency: itemContext.currency,
                            failureReason,
                        },
                    });
                }
            }
            else if (bankResult.status === 'REVERSED') {
                const revUtr = resolvedBankUtr ||
                    (bankResult.bankReference && bankResult.bankReference.trim()) ||
                    itemContext.customerRef;
                const revReason = bankResult.failureReason || `Payment returned by clearing house (UTR: ${revUtr})`;
                const revIdempKey = `REV-${organizationId}-${itemContext.payoutId}-${revUtr}`;
                const revRes = await payoutService.reversePayoutInTransaction(client, itemContext.payoutId, auth, organizationId, revReason, revIdempKey);
                isIdempotentReplay = Boolean(revRes?.isIdempotentReplay);
                currentStatus = 'REVERSED';
                canSafeRetry = true;
                inquiryNotes = isIdempotentReplay
                    ? `Compensating reversal already posted for ${revUtr} (idempotent replay).`
                    : `Bank reported payment REVERSED (${revUtr}). Compensating credit restored farmer payable.`;
                await client.query(`UPDATE payment_batch_items
           SET status = 'REVERSED',
               bank_utr = COALESCE($1, bank_utr),
               bank_status_code = 'REVERSED',
               bank_status_description = $2,
               failure_reason = $2,
               last_inquiry_at = NOW(),
               updated_at = NOW()
           WHERE id = $3 AND batch_id = $4;`, [resolvedBankUtr || null, revReason, itemContext.itemId, itemContext.batchId]);
                if (!isIdempotentReplay) {
                    await client.query(`INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_payout_id, matched_batch_id, reconciliation_status,
               resolution_action, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               'CREDIT', $5, $6, 'MATCHED',
               'UNION_BANK_REVERSED', $7, $8, $9
             )
             ON CONFLICT (organization_id, matched_payout_id, resolution_action, external_reference)
             WHERE reconciliation_status = 'MATCHED'
               AND matched_payout_id IS NOT NULL
               AND resolution_action IS NOT NULL
               AND external_reference IS NOT NULL
             DO NOTHING;`, [
                        organizationId,
                        revUtr,
                        (bankResult.transactionDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
                        itemContext.expectedAmount,
                        itemContext.payoutId,
                        itemContext.batchId,
                        revReason,
                        JSON.stringify(bankResult),
                        auth.userId,
                    ]);
                }
            }
            else if (bankResult.status === 'PENDING') {
                if (!['PAID', 'SETTLED', 'FAILED', 'REVERSED'].includes(currentStatus)) {
                    currentStatus = 'PROCESSING';
                    await client.query(`UPDATE payment_batch_items
             SET status = 'PROCESSING',
                 bank_utr = COALESCE($1, bank_utr),
                 bank_status_code = 'PENDING',
                 bank_status_description = $2,
                 last_inquiry_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3 AND batch_id = $4;`, [
                        resolvedBankUtr || null,
                        bankResult.failureReason || 'Transaction in clearing at Union Bank',
                        itemContext.itemId,
                        itemContext.batchId,
                    ]);
                }
                canSafeRetry = false;
                inquiryNotes = 'Transaction is in clearing at Union Bank. Automatic retry is strictly prohibited until final resolution.';
            }
            else {
                // UNKNOWN: NEVER automatically mark as FAILED!
                if (!['PAID', 'SETTLED', 'FAILED', 'REVERSED'].includes(currentStatus)) {
                    currentStatus = 'UNKNOWN';
                    await client.query(`UPDATE payment_batch_items
             SET status = 'UNKNOWN',
                 bank_utr = COALESCE($1, bank_utr),
                 bank_status_code = 'UNKNOWN',
                 bank_status_description = $2,
                 last_inquiry_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3 AND batch_id = $4;`, [
                        resolvedBankUtr || null,
                        bankResult.failureReason || 'Bank status remains UNKNOWN',
                        itemContext.itemId,
                        itemContext.batchId,
                    ]);
                }
                canSafeRetry = false;
                inquiryNotes = 'Bank status remains UNKNOWN. Manual bank statement verification or treasury confirmation required.';
            }
            await recomputeBatchAggregatesInTransaction(client, itemContext.batchId, organizationId);
            return {
                itemId: itemContext.itemId,
                customerReference: itemContext.customerRef,
                previousStatus: itemContext.previousStatus,
                currentStatus,
                bankUtr: resolvedBankUtr,
                settledAt,
                canSafeRetry,
                inquiryNotes,
                isIdempotentReplay,
            };
        });
        await flushDeferredNotifications(deferredNotifications);
        return txOutcome;
    }
    /**
     * Marks in-flight items whose bank submission timed out as UNKNOWN inside ONE tenant transaction.
     * Strict rule: timeout never automatically fails payouts or debits ledger.
     */
    static async markTimeoutUnknown(batchId, auth, reason = 'Network timeout waiting for Union Bank acknowledgement', targetOrganizationId) {
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        return tenantDb.withTransaction(async (client) => {
            const batchRes = await client.query(`SELECT id, organization_id
         FROM payment_batches
         WHERE id = $1
         FOR UPDATE;`, [batchId]);
            if (batchRes.rows.length === 0) {
                throw new NotFoundError('Batch not found', 'BATCH_NOT_FOUND');
            }
            const batch = batchRes.rows[0];
            if (batch.organization_id !== organizationId) {
                throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
            }
            const updateRes = await client.query(`UPDATE payment_batch_items
         SET status = 'UNKNOWN',
             bank_status_code = 'UNKNOWN',
             bank_status_description = $1,
             updated_at = NOW()
         WHERE batch_id = $2
           AND status IN ('SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING')
         RETURNING id;`, [reason, batchId]);
            await client.query(`UPDATE bank_submissions
         SET status = 'TIMEOUT_UNKNOWN',
             updated_at = NOW()
         WHERE batch_id = $1
           AND organization_id = $2
           AND status IN ('GENERATED', 'SUBMITTED_TO_BANK', 'PROCESSING');`, [batchId, organizationId]);
            await recomputeBatchAggregatesInTransaction(client, batchId, organizationId);
            // Ensure outer batch reflects UNKNOWN timeout even if items were still in pre-unknown state
            await client.query(`UPDATE payment_batches
         SET status = 'UNKNOWN',
             reconciliation_status = 'PARTIALLY_RECONCILED',
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2;`, [batchId, organizationId]);
            return { updatedCount: updateRes.rowCount || 0 };
        });
    }
}
//# sourceMappingURL=UnionBankStatusInquiryService.js.map