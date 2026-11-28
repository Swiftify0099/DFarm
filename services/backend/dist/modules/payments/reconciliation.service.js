// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// GENERIC BANK RECONCILIATION, WEBHOOKS & MANUAL RESOLUTION (DF-022 FIX)
// ==============================================================================
//
// - Strictly resolves each dairy's operational database via
//   `getStrictPaymentTenantDb(organizationId)` (`{ bypassCache: true, strictOperational: true }`).
// - Never imports `config/db.js`, never scans tenants, never uses `resolveDefaultOrgId()`.
// - Statement import, webhook matching, manual `resolveRecord`, and listing run inside
//   tenant-scoped PostgreSQL transactions (`app.current_organization_id` set).
// - Manual `CONFIRMED_SETTLED` delegates settlement inside the SAME transaction client
//   via `payoutService.confirmPayoutInTransaction(...)`, updates batch items/aggregates,
//   and flushes notifications ONLY after COMMIT succeeds.
//
// ==============================================================================
import crypto from 'node:crypto';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, } from '../../shared/errors/app-error.js';
import { payoutService } from './payout.service.js';
import { PaymentProviderFactory } from './providers/provider.factory.js';
import { NotificationEventType } from '@dfarm/shared-types';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { flushDeferredNotifications, getStrictPaymentTenantDb, recomputeBatchAggregatesInTransaction, resolveOperationalOrganizationId, } from './tenant-payment-context.js';
function amountsMatchExactly(expected, reported) {
    if (!Number.isFinite(expected) || !Number.isFinite(reported)) {
        return false;
    }
    return Math.round(expected * 100) === Math.round(reported * 100);
}
export class ReconciliationService {
    async importBankStatementCsv(params, auth, targetOrganizationId) {
        if (!params.rows || params.rows.length === 0) {
            throw new BadRequestError('Bank statement import cannot be empty', 'EMPTY_STATEMENT');
        }
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId ?? params.targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        const statementImportId = crypto.randomUUID();
        return tenantDb.withTransaction(async (client) => {
            let matchedCount = 0;
            let unmatchedCount = 0;
            let mismatchCount = 0;
            let duplicateCount = 0;
            let reviewRequiredCount = 0;
            const previewRecords = [];
            for (const row of params.rows) {
                const cleanRef = (row.referenceNumber || '').trim();
                if (!cleanRef) {
                    throw new BadRequestError('Statement row is missing external referenceNumber', 'MISSING_STATEMENT_REFERENCE');
                }
                const amount = Number(row.amount);
                if (!Number.isFinite(amount) || amount < 0) {
                    throw new BadRequestError(`Invalid numeric amount '${row.amount}' for reference '${cleanRef}'`, 'INVALID_STATEMENT_AMOUNT');
                }
                const recordId = crypto.randomUUID();
                // 1. Check duplicate external reference inside tenant DB
                const dupRes = await client.query(`SELECT id, reconciliation_status
           FROM payment_reconciliation_records
           WHERE organization_id = $1
             AND external_reference = $2;`, [organizationId, cleanRef]);
                let status = 'UNMATCHED';
                let resolutionAction = null;
                let resolutionNotes = null;
                let matchedPayoutId = null;
                let matchedReceiptId = null;
                let matchedBatchId = null;
                if (dupRes.rows.length > 0) {
                    status = 'DUPLICATE_REFERENCE';
                    duplicateCount++;
                }
                else {
                    // 2. Match against customer_payouts (strictly scoped to organization_id; detect ambiguity)
                    const payoutRes = await client.query(`SELECT id, amount, status, batch_id
             FROM customer_payouts
             WHERE organization_id = $1
               AND reference_number = $2
             LIMIT 2;`, [organizationId, cleanRef]);
                    if (payoutRes.rows.length > 1) {
                        status = 'MANUAL_REVIEW_REQUIRED';
                        resolutionAction = 'AMBIGUOUS_REFERENCE';
                        resolutionNotes = `Reference '${cleanRef}' matched multiple payouts in tenant DB; manual review required.`;
                        reviewRequiredCount++;
                    }
                    else if (payoutRes.rows.length === 1) {
                        const p = payoutRes.rows[0];
                        matchedPayoutId = p.id;
                        matchedBatchId = p.batch_id;
                        const expectedAmount = Number(p.amount);
                        if (amountsMatchExactly(expectedAmount, amount)) {
                            status = 'MATCHED';
                            matchedCount++;
                        }
                        else {
                            status = 'AMOUNT_MISMATCH';
                            resolutionNotes = `Expected ${expectedAmount.toFixed(2)}, statement reported ${amount.toFixed(2)}`;
                            mismatchCount++;
                        }
                    }
                    else {
                        // 3. Match against customer_receipts
                        const receiptRes = await client.query(`SELECT id, amount, status
               FROM customer_receipts
               WHERE organization_id = $1
                 AND reference_number = $2
               LIMIT 2;`, [organizationId, cleanRef]);
                        if (receiptRes.rows.length > 1) {
                            status = 'MANUAL_REVIEW_REQUIRED';
                            resolutionAction = 'AMBIGUOUS_REFERENCE';
                            resolutionNotes = `Reference '${cleanRef}' matched multiple customer receipts; manual review required.`;
                            reviewRequiredCount++;
                        }
                        else if (receiptRes.rows.length === 1) {
                            const r = receiptRes.rows[0];
                            matchedReceiptId = r.id;
                            const expectedAmount = Number(r.amount);
                            if (amountsMatchExactly(expectedAmount, amount)) {
                                status = 'MATCHED';
                                matchedCount++;
                            }
                            else {
                                status = 'AMOUNT_MISMATCH';
                                resolutionNotes = `Expected ${expectedAmount.toFixed(2)}, statement reported ${amount.toFixed(2)}`;
                                mismatchCount++;
                            }
                        }
                        else {
                            // 4. Match against payment_batches
                            const batchRes = await client.query(`SELECT id, total_amount
                 FROM payment_batches
                 WHERE organization_id = $1
                   AND batch_number = $2
                 LIMIT 2;`, [organizationId, cleanRef]);
                            if (batchRes.rows.length === 1) {
                                const b = batchRes.rows[0];
                                matchedBatchId = b.id;
                                const expectedAmount = Number(b.total_amount);
                                if (amountsMatchExactly(expectedAmount, amount)) {
                                    status = 'MATCHED';
                                    matchedCount++;
                                }
                                else {
                                    status = 'AMOUNT_MISMATCH';
                                    mismatchCount++;
                                }
                            }
                            else {
                                status = 'UNMATCHED';
                                unmatchedCount++;
                            }
                        }
                    }
                }
                await client.query(`INSERT INTO payment_reconciliation_records (
             id, organization_id, statement_import_id, source, external_reference,
             transaction_date, amount, currency, direction, raw_details,
             matched_payout_id, matched_receipt_id, matched_batch_id,
             reconciliation_status, resolution_action, resolution_notes, created_by, created_at
           ) VALUES (
             $1, $2, $3, 'BANK_STATEMENT_CSV', $4,
             $5, $6, 'INR', $7, $8,
             $9, $10, $11,
             $12, $13, $14, $15, NOW()
           );`, [
                    recordId,
                    organizationId,
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
                    resolutionAction,
                    resolutionNotes,
                    auth.userId,
                ]);
                previewRecords.push({
                    recordId,
                    referenceNumber: cleanRef,
                    transactionDate: row.transactionDate,
                    amount,
                    direction: row.direction,
                    status,
                    matchedPayoutId,
                    matchedReceiptId,
                    matchedBatchId,
                });
            }
            return {
                statementImportId,
                fileName: params.fileName,
                totalImportedRows: params.rows.length,
                summary: {
                    matchedCount,
                    unmatchedCount,
                    mismatchCount,
                    duplicateCount,
                    reviewRequiredCount,
                },
                records: previewRecords,
            };
        });
    }
    async processWebhook(payload, signature, timestampHeader, authContext, targetOrganizationId) {
        const provider = PaymentProviderFactory.getProvider();
        const verification = await provider.verifyWebhook(payload, signature, timestampHeader);
        if (!verification.isValid) {
            throw new BadRequestError(`Webhook verification failed: ${verification.error}`, 'INVALID_WEBHOOK_SIGNATURE');
        }
        const event = verification.payload || {};
        const eventId = verification.eventId ? String(verification.eventId).trim() : '';
        const reference = String(event.referenceNumber || event.utr || event.transactionId || event.paymentId || '').trim();
        const amount = Number(event.amount);
        if (!eventId) {
            throw new BadRequestError('Webhook payload missing eventId', 'MISSING_EVENT_ID');
        }
        if (!reference) {
            throw new BadRequestError('Webhook payload missing transaction reference', 'MISSING_PAYLOAD_REFERENCE');
        }
        if (!Number.isFinite(amount) || amount < 0) {
            throw new BadRequestError('Webhook payload has invalid amount', 'INVALID_WEBHOOK_AMOUNT');
        }
        const payloadOrgId = typeof event.organizationId === 'string' && event.organizationId.trim().length > 0
            ? event.organizationId.trim()
            : null;
        const explicitTargetOrgId = typeof targetOrganizationId === 'string' && targetOrganizationId.trim().length > 0
            ? targetOrganizationId.trim()
            : null;
        let organizationId;
        if (authContext) {
            organizationId = resolveOperationalOrganizationId(authContext, explicitTargetOrgId || payloadOrgId, 'CROSS_ORG_WEBHOOK_DENIED');
            if (payloadOrgId && payloadOrgId !== organizationId) {
                throw new ForbiddenError('Webhook payload organizationId does not match authenticated tenant context', 'CROSS_ORG_WEBHOOK_DENIED');
            }
        }
        else {
            const derivedOrg = explicitTargetOrgId || payloadOrgId;
            if (!derivedOrg) {
                throw new BadRequestError('Signed webhook event must specify an operational organizationId', 'WEBHOOK_ORGANIZATION_REQUIRED');
            }
            if (explicitTargetOrgId && payloadOrgId && explicitTargetOrgId !== payloadOrgId) {
                throw new ForbiddenError('Webhook header/query target organization contradicts signed payload organizationId', 'CROSS_ORG_WEBHOOK_DENIED');
            }
            if (tenantDbManager.isPlatformFederationDairy(derivedOrg)) {
                throw new ForbiddenError('Platform federation ID is invalid for tenant webhook reconciliation', 'CONTROL_PLANE_TARGET_FORBIDDEN');
            }
            organizationId = derivedOrg;
        }
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        return tenantDb.withTransaction(async (client) => {
            // Confirm organization row exists inside resolved tenant database
            const orgCheck = await client.query(`SELECT id FROM organizations WHERE id = $1 LIMIT 1;`, [organizationId]);
            if (orgCheck.rows.length === 0) {
                throw new NotFoundError(`Organization '${organizationId}' does not exist in resolved tenant database`, 'TENANT_ORGANIZATION_NOT_FOUND');
            }
            // Enforce idempotency strictly within tenant DB
            const existingEvt = await client.query(`SELECT id, reconciliation_status, matched_payout_id
         FROM payment_reconciliation_records
         WHERE organization_id = $1
           AND external_event_id = $2
         FOR UPDATE;`, [organizationId, eventId]);
            if (existingEvt.rows.length > 0) {
                const row = existingEvt.rows[0];
                return {
                    reconciliationId: row.id,
                    eventId,
                    status: row.reconciliation_status,
                    matchedPayoutId: row.matched_payout_id,
                    isIdempotentReplay: true,
                };
            }
            // Match against customer_payouts strictly within organization_id
            const payoutRes = await client.query(`SELECT id, amount, status, batch_id
         FROM customer_payouts
         WHERE organization_id = $1
           AND reference_number = $2
         LIMIT 2;`, [organizationId, reference]);
            let status = 'UNMATCHED';
            let resolutionAction = null;
            let resolutionNotes = null;
            let matchedPayoutId = null;
            let matchedBatchId = null;
            if (payoutRes.rows.length > 1) {
                status = 'MANUAL_REVIEW_REQUIRED';
                resolutionAction = 'AMBIGUOUS_REFERENCE';
                resolutionNotes = `Webhook reference '${reference}' matched multiple payouts; manual review required.`;
            }
            else if (payoutRes.rows.length === 1) {
                const p = payoutRes.rows[0];
                matchedPayoutId = p.id;
                matchedBatchId = p.batch_id;
                const expectedAmount = Number(p.amount);
                if (amountsMatchExactly(expectedAmount, amount)) {
                    status = 'MATCHED';
                }
                else {
                    status = 'AMOUNT_MISMATCH';
                    resolutionNotes = `Expected ${expectedAmount.toFixed(2)}, webhook reported ${amount.toFixed(2)}`;
                }
            }
            const recordId = crypto.randomUUID();
            try {
                await client.query(`INSERT INTO payment_reconciliation_records (
             id, organization_id, source, external_reference, external_event_id,
             transaction_date, amount, currency, direction, raw_details,
             matched_payout_id, matched_batch_id, reconciliation_status,
             resolution_action, resolution_notes, created_at
           ) VALUES (
             $1, $2, 'PAYMENT_GATEWAY_WEBHOOK', $3, $4,
             CURRENT_DATE, $5, 'INR', 'DEBIT', $6,
             $7, $8, $9,
             $10, $11, NOW()
           );`, [
                    recordId,
                    organizationId,
                    reference,
                    eventId,
                    amount,
                    JSON.stringify(event),
                    matchedPayoutId,
                    matchedBatchId,
                    status,
                    resolutionAction,
                    resolutionNotes,
                ]);
            }
            catch (insertErr) {
                if (insertErr?.code === '23505') {
                    const replayRes = await client.query(`SELECT id, reconciliation_status, matched_payout_id
             FROM payment_reconciliation_records
             WHERE organization_id = $1 AND external_event_id = $2
             LIMIT 1;`, [organizationId, eventId]);
                    if (replayRes.rows.length > 0) {
                        const row = replayRes.rows[0];
                        return {
                            reconciliationId: row.id,
                            eventId,
                            status: row.reconciliation_status,
                            matchedPayoutId: row.matched_payout_id,
                            isIdempotentReplay: true,
                        };
                    }
                }
                throw insertErr;
            }
            return {
                reconciliationId: recordId,
                eventId,
                status,
                matchedPayoutId,
                isIdempotentReplay: false,
            };
        });
    }
    async resolveRecord(recordId, action, notes, auth, matchedPayoutId, targetOrganizationId) {
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        const deferredNotifications = [];
        const outcome = await tenantDb.withTransaction(async (client) => {
            const res = await client.query(`SELECT *
         FROM payment_reconciliation_records
         WHERE id = $1
         FOR UPDATE;`, [recordId]);
            if (res.rows.length === 0) {
                throw new NotFoundError(`Reconciliation record '${recordId}' not found`, 'RECON_NOT_FOUND');
            }
            const record = res.rows[0];
            if (record.organization_id !== organizationId) {
                throw new ForbiddenError('Cross-organization reconciliation access is strictly prohibited', 'CROSS_ORG_ACCESS_DENIED');
            }
            const targetPayoutId = matchedPayoutId || record.matched_payout_id;
            let targetBatchId = record.matched_batch_id || null;
            if (targetPayoutId) {
                const payoutLock = await client.query(`SELECT id, organization_id, batch_id, amount, customer_id, center_id, currency, payment_method, bank_account_mask
           FROM customer_payouts
           WHERE id = $1
           FOR UPDATE;`, [targetPayoutId]);
                if (payoutLock.rows.length === 0) {
                    throw new NotFoundError(`Payout '${targetPayoutId}' not found`, 'PAYOUT_NOT_FOUND');
                }
                const payout = payoutLock.rows[0];
                if (payout.organization_id !== organizationId) {
                    throw new ForbiddenError('Matched payout belongs to a different organization', 'CROSS_ORG_PAYOUT_ACCESS_DENIED');
                }
                targetBatchId = payout.batch_id || targetBatchId;
                if (action === 'CONFIRMED_SETTLED') {
                    if (record.reconciliation_status === 'MATCHED' &&
                        record.resolution_action === 'CONFIRMED_SETTLED') {
                        throw new ConflictError(`Reconciliation record '${recordId}' is already resolved as CONFIRMED_SETTLED`, 'RECON_ALREADY_SETTLED');
                    }
                    const settledAt = new Date();
                    const settlement = await payoutService.confirmPayoutInTransaction(client, targetPayoutId, auth, organizationId, record.external_reference, settledAt);
                    if (targetBatchId) {
                        await client.query(`UPDATE payment_batch_items
               SET status = 'PAID',
                   bank_utr = COALESCE(bank_utr, $1),
                   bank_status_code = 'PAID',
                   bank_status_description = 'Manually confirmed settled via reconciliation',
                   settled_at = COALESCE(settled_at, $2),
                   updated_at = NOW()
               WHERE batch_id = $3
                 AND payout_id = $4;`, [record.external_reference, settledAt, targetBatchId, targetPayoutId]);
                        await recomputeBatchAggregatesInTransaction(client, targetBatchId, organizationId);
                    }
                    if (!settlement?.isIdempotentReplay) {
                        deferredNotifications.push({
                            organizationId,
                            centerId: payout.center_id,
                            customerId: payout.customer_id,
                            eventType: NotificationEventType.PAYMENT_SETTLED,
                            eventId: `evt_payout_settled_${targetPayoutId}`,
                            idempotencyKey: `notif_payout_${targetPayoutId}`,
                            metadata: {
                                payoutId: targetPayoutId,
                                amount: Number(payout.amount),
                                currency: payout.currency || 'INR',
                                paymentMethod: payout.payment_method || 'BANK_TRANSFER',
                                referenceNumber: record.external_reference,
                                bankAccountMask: payout.bank_account_mask || 'XXXX-XXXX-XXXX',
                                settledDate: settledAt.toLocaleDateString('en-GB'),
                            },
                        });
                    }
                }
            }
            else if (action === 'CONFIRMED_SETTLED') {
                throw new BadRequestError('Cannot mark record CONFIRMED_SETTLED without a matched payout ID', 'MISSING_MATCHED_PAYOUT_ID');
            }
            await client.query(`UPDATE payment_reconciliation_records
         SET resolution_action = $1::varchar,
             resolution_notes = $2::text,
             matched_payout_id = COALESCE($3::uuid, matched_payout_id),
             matched_batch_id = COALESCE($4::uuid, matched_batch_id),
             reconciliation_status = CASE WHEN $1::text IN ('CONFIRMED_SETTLED', 'MANUALLY_MATCHED') THEN 'MATCHED'::varchar ELSE reconciliation_status END,
             resolved_by = $5::uuid,
             resolved_at = NOW()
         WHERE id = $6::uuid
           AND organization_id = $7::uuid;`, [action, notes, targetPayoutId || null, targetBatchId, auth.userId, recordId, organizationId]);
            return {
                recordId,
                action,
                notes,
                matchedPayoutId: targetPayoutId || null,
                resolvedBy: auth.userId,
                resolvedAt: new Date().toISOString(),
            };
        });
        await flushDeferredNotifications(deferredNotifications);
        return outcome;
    }
    async getReconciliationRecords(auth, filters, targetOrganizationId) {
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        return tenantDb.withTransaction(async (client) => {
            let q = 'SELECT * FROM payment_reconciliation_records WHERE organization_id = $1';
            const params = [organizationId];
            if (filters?.status) {
                params.push(filters.status);
                q += ` AND reconciliation_status = $${params.length}`;
            }
            q += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2) + ';';
            const limit = Math.min(100, Math.max(1, filters?.limit || 20));
            const offset = Math.max(0, filters?.offset || 0);
            params.push(limit, offset);
            const res = await client.query(q, params);
            return res.rows.map((r) => ({
                ...r,
                amount: Number(r.amount),
            }));
        });
    }
}
export const reconciliationService = new ReconciliationService();
//# sourceMappingURL=reconciliation.service.js.map