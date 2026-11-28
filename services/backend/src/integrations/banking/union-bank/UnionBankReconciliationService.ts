// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: RECONCILIATION SERVICE (DF-022 FIX)
// ==============================================================================
//
// DF-022 TRANSACTION BOUNDARY DESIGN:
//   - ONE authoritative operational tenant database per dairy resolved exclusively via
//     tenantDbManager.getStrictTenantDb(organizationId, { bypassCache: true, strictOperational: true }).
//   - ONE single batch-level transaction (`tenantDb.withTransaction`) wraps every operational
//     read and write for a reconciliation run:
//       1. Lock payment batch (`SELECT ... FROM payment_batches WHERE id = $1 FOR UPDATE`)
//       2. Verify batch organization ownership inside tenant DB
//       3. Load & lock batch items + linked payouts (`FOR UPDATE OF bi, cp`)
//       4. Parse & match bank items (detecting missing & ambiguous references)
//       5. Execute payout settle/fail/reverse + ledger mutations via caller's `client`
//       6. Update payment batch items (`PAID`/`FAILED`/`REVERSED`/`UNKNOWN`)
//       7. Insert payment reconciliation audit records
//       8. Recompute canonical batch aggregates inside the same transaction
//   - Per-item domain/business errors use PostgreSQL SAVEPOINT / ROLLBACK TO SAVEPOINT
//     so one business rejection does not abort sibling items.
//   - Unexpected / infrastructure / database failures propagate out of `withTransaction`
//     so the entire batch transaction rolls back atomically (never swallowed).
//   - Zero imports from `config/db.js`, zero permissive `getTenantDb()`, zero tenant scans.
//   - Notifications are deferred during the transaction and flushed via `Promise.allSettled`
//     ONLY after the outer COMMIT succeeds.
//
// ==============================================================================

import type pg from 'pg';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/app-error.js';
import { logger } from '../../../shared/logger/index.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import {
  flushDeferredNotifications,
  getStrictPaymentTenantDb,
  recomputeBatchAggregatesInTransaction,
  resolveOperationalOrganizationId,
  type DeferredNotification,
} from '../../../modules/payments/tenant-payment-context.js';
import { payoutService } from '../../../modules/payments/payout.service.js';
import { UnionBankResponseParser } from './UnionBankResponseParser.js';
import { NotificationEventType } from '@dfarm/shared-types';
import type { UnionBankReconciliationItemResult } from './types.js';

export interface ReconciliationItemResult {
  itemId: string;
  customerReference: string;
  farmerCode: string;
  expectedAmount: number;
  bankAmount: number;
  bankUtr?: string;
  status: string;
  message: string;
  isIdempotentReplay: boolean;
}

export interface ReconciliationException {
  reference: string;
  reason: string;
}

export interface ReconciliationResult {
  batchId: string;
  batchStatus: string;
  reconciliationStatus: string;
  totalBeneficiaries: number;
  paidCount: number;
  successfulCount: number;
  failedCount: number;
  reversedCount: number;
  unknownCount: number;
  processedItems: ReconciliationItemResult[];
  exceptions: ReconciliationException[];
}

interface LockedBatchItemRow {
  item_id: string;
  batch_id: string;
  payout_id: string;
  customer_id: string;
  amount: string | number;
  item_status: string;
  beneficiary_reference: string | null;
  bank_utr: string | null;
  bank_reference_number: string | null;
  farmer_code: string;
  customer_name: string | null;
  bank_account_mask: string | null;
  center_id: string;
  payout_status: string;
  payout_reference_number: string | null;
  payout_currency: string | null;
  payout_payment_method: string | null;
}

function normalizeRef(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value !== undefined && value !== null) {
    return String(value).trim();
  }
  return '';
}

function parseSettledDate(rawDate?: string): Date {
  if (!rawDate || !rawDate.trim()) {
    return new Date();
  }
  const parsed = new Date(rawDate.trim());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toIsoDateOnly(rawDate?: string): string {
  const parsed = parseSettledDate(rawDate);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Classifies errors into expected per-item business/domain rejections vs unexpected
 * infrastructure/database failures. Only expected domain errors are safe to isolate
 * via SAVEPOINT; infrastructure failures must abort and roll back the outer transaction.
 */
function isExpectedItemBusinessError(err: any): boolean {
  if (
    err instanceof BadRequestError ||
    err instanceof ConflictError ||
    err instanceof NotFoundError ||
    err instanceof ForbiddenError
  ) {
    return true;
  }

  // Known PL/pgSQL domain validation SQLSTATE / message guards from payout RPCs
  const pgCode = typeof err?.code === 'string' ? err.code : '';
  const msg = typeof err?.message === 'string' ? err.message : '';
  if (pgCode === 'P0002') {
    return true;
  }
  if (
    pgCode === '22000' &&
    (msg.includes('CANNOT_FAIL_SETTLED_PAYOUT') ||
      msg.includes('CANNOT_FAIL_REVERSED_PAYOUT') ||
      msg.includes('CONFLICTING_REVERSAL_REFERENCE') ||
      msg.includes('Only SETTLED payouts can be reversed') ||
      msg.includes('cannot be settled from status'))
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves the authoritative target organization for Union Bank reconciliation.
 *
 * - Regular dairy staff always reconcile within `auth.organizationId` and reject
 *   any contradicting body/query/header target organization identifier.
 * - Platform `SUPER_ADMIN` must provide an explicit non-platform `targetOrganizationId`
 *   (no scanning across tenant pools and no control-plane financial fallback).
 */
export function resolveReconciliationTargetOrganization(
  auth: AuthContext,
  targetOrganizationId?: string | null
): string {
  return resolveOperationalOrganizationId(
    auth,
    targetOrganizationId,
    'CROSS_ORG_RECONCILIATION_DENIED'
  );
}

export class UnionBankReconciliationService {
  /**
   * Reconciles a payment batch against Union Bank Reverse MIS response data inside
   * one authoritative physical tenant PostgreSQL database and one shared batch-level
   * transaction.
   */
  public static async reconcileBatchWithBankData(
    batchId: string,
    bankResponseContentOrItems: string | UnionBankReconciliationItemResult[],
    auth: AuthContext,
    targetOrganizationId?: string | null
  ): Promise<ReconciliationResult> {
    if (!batchId || !batchId.trim()) {
      throw new BadRequestError('Payment batch ID is required', 'MISSING_BATCH_ID');
    }

    const organizationId = resolveReconciliationTargetOrganization(auth, targetOrganizationId);

    // Strictly resolve operational tenant DB — never falls back to central or pooled scan
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    const deferredNotifications: DeferredNotification[] = [];

    const txResult = await tenantDb.withTransaction<ReconciliationResult>(async (client: pg.PoolClient) => {
      // 1. Lock the payment batch first inside the tenant transaction
      const batchRes = await client.query<{
        id: string;
        organization_id: string;
        center_id: string | null;
        batch_number: string;
        bank_batch_reference: string | null;
        status: string;
      }>(
        `SELECT id, organization_id, center_id, batch_number, bank_batch_reference, status
         FROM payment_batches
         WHERE id = $1
         FOR UPDATE;`,
        [batchId]
      );

      const batch = batchRes.rows[0];
      if (!batch) {
        throw new NotFoundError('Payment batch not found', 'BATCH_NOT_FOUND');
      }

      // 2. Verify organization ownership inside the locked batch row (fail closed, no foreign leak)
      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError(
          'Cross-organization batch reconciliation is prohibited',
          'CROSS_ORG_ACCESS_DENIED'
        );
      }

      // 3. Load and lock all batch items and linked payouts deterministically
      const itemsRes = await client.query<LockedBatchItemRow>(
        `SELECT
           bi.id AS item_id,
           bi.batch_id,
           bi.payout_id,
           bi.customer_id,
           bi.amount,
           bi.status AS item_status,
           bi.beneficiary_reference,
           bi.bank_utr,
           bi.bank_reference_number,
           c.farmer_code,
           c.full_name AS customer_name,
           COALESCE(bi.bank_account_mask, cp.bank_account_mask, c.bank_account_mask) AS bank_account_mask,
           cp.center_id,
           cp.status AS payout_status,
           cp.reference_number AS payout_reference_number,
           cp.currency AS payout_currency,
           cp.payment_method AS payout_payment_method
         FROM payment_batch_items bi
         JOIN customers c
           ON c.id = bi.customer_id
          AND c.organization_id = $2
         JOIN customer_payouts cp
           ON cp.id = bi.payout_id
          AND cp.organization_id = $2
         WHERE bi.batch_id = $1
         ORDER BY bi.created_at ASC, bi.id ASC
         FOR UPDATE OF bi, cp;`,
        [batchId, organizationId]
      );

      const batchItems = itemsRes.rows;

      // 4. Parse bank response items
      let bankItems: UnionBankReconciliationItemResult[];
      if (typeof bankResponseContentOrItems === 'string') {
        const summary = UnionBankResponseParser.parseResponse(
          bankResponseContentOrItems,
          batch.bank_batch_reference || batch.batch_number
        );
        bankItems = summary.items;
      } else if (Array.isArray(bankResponseContentOrItems)) {
        bankItems = bankResponseContentOrItems;
      } else {
        throw new BadRequestError('Invalid Union Bank response payload', 'INVALID_BANK_RESPONSE');
      }

      const processedResults: ReconciliationItemResult[] = [];
      const exceptions: ReconciliationException[] = [];

      // 5. Process each bank response line inside the shared batch transaction
      for (let idx = 0; idx < bankItems.length; idx++) {
        const bankItem = bankItems[idx]!;
        const cleanRef = normalizeRef(bankItem.customerReference);
        const rawBankAmt = typeof bankItem.amount === 'number' ? bankItem.amount : Number(bankItem.amount);
        const hasFiniteAmount = Number.isFinite(rawBankAmt);
        const safeBankAmtForAudit = hasFiniteAmount ? rawBankAmt : 0;

        // Find all distinct matching batch items so ambiguous references fail cleanly
        const matchingItems = cleanRef.length === 0
          ? []
          : batchItems.filter((item) => {
              const candidates = [
                normalizeRef(item.item_id),
                normalizeRef(item.beneficiary_reference),
                normalizeRef(item.farmer_code),
                normalizeRef(item.bank_utr),
                normalizeRef(item.bank_reference_number),
                normalizeRef(item.payout_reference_number),
                normalizeRef(`REF-${batch.batch_number}-${item.farmer_code}`),
              ];
              return candidates.some((candidate) => candidate.length > 0 && candidate === cleanRef);
            });

        if (matchingItems.length === 0) {
          const auditRef = cleanRef || normalizeRef(bankItem.bankUtr) || `UNMATCHED-${idx}`;
          exceptions.push({
            reference: auditRef,
            reason: 'NO_MATCHING_BATCH_ITEM: Reference not found in payment batch',
          });
          await client.query(
            `INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_batch_id, reconciliation_status, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               $5, $6, 'UNMATCHED', $7, $8, $9
             );`,
            [
              organizationId,
              auditRef,
              toIsoDateOnly(bankItem.transactionDate),
              safeBankAmtForAudit,
              bankItem.status === 'REVERSED' ? 'CREDIT' : 'DEBIT',
              batchId,
              `Unmatched Union Bank reference '${auditRef}'`,
              JSON.stringify(bankItem),
              auth.userId,
            ]
          );
          continue;
        }

        if (matchingItems.length > 1) {
          exceptions.push({
            reference: cleanRef,
            reason: `AMBIGUOUS_REFERENCE: Reference '${cleanRef}' matched ${matchingItems.length} distinct batch items`,
          });
          await client.query(
            `INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_batch_id, reconciliation_status, resolution_action, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               $5, $6, 'MANUAL_REVIEW_REQUIRED', 'AMBIGUOUS_REFERENCE', $7, $8, $9
             );`,
            [
              organizationId,
              cleanRef,
              toIsoDateOnly(bankItem.transactionDate),
              safeBankAmtForAudit,
              bankItem.status === 'REVERSED' ? 'CREDIT' : 'DEBIT',
              batchId,
              `Reference '${cleanRef}' matched ${matchingItems.length} items — manual review required`,
              JSON.stringify(bankItem),
              auth.userId,
            ]
          );
          continue;
        }

        const matchedItem = matchingItems[0]!;
        const expectedAmount = Number(matchedItem.amount);
        const expectedPaise = Math.round(expectedAmount * 100);
        const bankPaise = hasFiniteAmount ? Math.round(rawBankAmt * 100) : NaN;

        // Explicit zero-safe paise amount validation:
        // - PAID & REVERSED require exact positive match against expected amount
        // - FAILED rejects negative/NaN or non-zero mismatched amounts
        const amountMismatch =
          bankItem.status === 'PAID' || bankItem.status === 'REVERSED'
            ? !hasFiniteAmount || bankPaise <= 0 || bankPaise !== expectedPaise
            : bankItem.status === 'FAILED'
              ? !hasFiniteAmount || bankPaise < 0 || (bankPaise > 0 && bankPaise !== expectedPaise)
              : false;

        if (amountMismatch) {
          const auditRef = normalizeRef(bankItem.bankUtr) || cleanRef;
          const displayBankAmt = hasFiniteAmount ? rawBankAmt.toFixed(2) : 'NaN';
          exceptions.push({
            reference: cleanRef,
            reason: `AMOUNT_MISMATCH: Expected ₹${expectedAmount.toFixed(2)}, bank reported ₹${displayBankAmt}`,
          });
          await client.query(
            `INSERT INTO payment_reconciliation_records (
               organization_id, source, external_reference, transaction_date, amount,
               direction, matched_payout_id, matched_batch_id, reconciliation_status,
               resolution_action, resolution_notes, raw_details, created_by
             ) VALUES (
               $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
               $5, $6, $7, 'AMOUNT_MISMATCH',
               'HOLD_FOR_TREASURY_REVIEW', $8, $9, $10
             );`,
            [
              organizationId,
              auditRef,
              toIsoDateOnly(bankItem.transactionDate),
              safeBankAmtForAudit,
              bankItem.status === 'REVERSED' ? 'CREDIT' : 'DEBIT',
              matchedItem.payout_id,
              batchId,
              `Amount mismatch for ${cleanRef}: expected ₹${expectedAmount.toFixed(2)}, bank reported ₹${displayBankAmt}`,
              JSON.stringify(bankItem),
              auth.userId,
            ]
          );
          continue;
        }

        // Isolate per-item database mutations inside a SAVEPOINT so expected domain errors
        // roll back cleanly without aborting sibling items, while infrastructure failures
        // bubble up and roll back the entire batch transaction.
        const spName = `sp_ub_item_${idx}`;
        const pendingNotificationsForItem: DeferredNotification[] = [];

        await client.query(`SAVEPOINT ${spName}`);
        try {
          if (bankItem.status === 'PAID') {
            const utr =
              normalizeRef(bankItem.bankUtr) ||
              normalizeRef(bankItem.bankReference) ||
              `UBI-UTR-${batch.batch_number}-${matchedItem.farmer_code}`;
            const settledDate = parseSettledDate(bankItem.transactionDate);

            const settlement = await payoutService.confirmPayoutInTransaction(
              client,
              matchedItem.payout_id,
              auth,
              organizationId,
              utr,
              settledDate
            );

            const isReplay = Boolean(settlement?.isIdempotentReplay);

            // Preserve original beneficiary_reference while marking batch item PAID and storing bank_utr
            await client.query(
              `UPDATE payment_batch_items
               SET status = 'PAID',
                   beneficiary_reference = COALESCE($1, beneficiary_reference),
                   bank_utr = COALESCE(bank_utr, $2),
                   bank_reference_number = COALESCE($3, bank_reference_number, $2),
                   bank_status_code = 'PAID',
                   bank_status_description = COALESCE($4, bank_status_description, 'Settled by Union Bank'),
                   settled_at = COALESCE(settled_at, $5),
                   updated_at = NOW()
               WHERE id = $6
                 AND batch_id = $7;`,
              [
                matchedItem.beneficiary_reference,
                settlement?.referenceNumber || utr,
                normalizeRef(bankItem.bankReference) || utr,
                normalizeRef(bankItem.failureReason) || null,
                settledDate,
                matchedItem.item_id,
                batchId,
              ]
            );

            if (!isReplay) {
              await client.query(
                `INSERT INTO payment_reconciliation_records (
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
                 DO NOTHING;`,
                [
                  organizationId,
                  settlement?.referenceNumber || utr,
                  toIsoDateOnly(bankItem.transactionDate),
                  expectedAmount,
                  matchedItem.payout_id,
                  batchId,
                  `Settled Union Bank payout ${matchedItem.payout_id} with UTR ${settlement?.referenceNumber || utr}`,
                  JSON.stringify(bankItem),
                  auth.userId,
                ]
              );

              pendingNotificationsForItem.push({
                organizationId,
                centerId: matchedItem.center_id,
                customerId: matchedItem.customer_id,
                eventType: NotificationEventType.PAYMENT_SETTLED,
                eventId: `evt_payout_settled_${matchedItem.payout_id}`,
                idempotencyKey: `notif_payout_${matchedItem.payout_id}`,
                metadata: {
                  payoutId: matchedItem.payout_id,
                  amount: expectedAmount,
                  currency: matchedItem.payout_currency || 'INR',
                  paymentMethod: matchedItem.payout_payment_method || 'BANK_TRANSFER',
                  referenceNumber: settlement?.referenceNumber || utr,
                  bankAccountMask: matchedItem.bank_account_mask || 'XXXX-XXXX-XXXX',
                  settledDate: settledDate.toLocaleDateString('en-GB'),
                },
              });
            }

            matchedItem.item_status = 'PAID';
            matchedItem.payout_status = 'SETTLED';
            matchedItem.payout_reference_number = settlement?.referenceNumber || utr;
            matchedItem.bank_utr = matchedItem.bank_utr || settlement?.referenceNumber || utr;

            processedResults.push({
              itemId: matchedItem.item_id,
              customerReference: cleanRef,
              farmerCode: matchedItem.farmer_code,
              expectedAmount,
              bankAmount: rawBankAmt,
              bankUtr: matchedItem.bank_utr || utr,
              status: 'PAID',
              message: isReplay
                ? 'Item already settled in ledger (idempotent replay)'
                : 'Successfully settled and posted to ledger',
              isIdempotentReplay: isReplay,
            });
          } else if (bankItem.status === 'FAILED') {
            const failureReason =
              normalizeRef(bankItem.failureReason) || 'Rejected by Union Bank clearing house';
            const bankRef =
              normalizeRef(bankItem.bankUtr) || normalizeRef(bankItem.bankReference) || cleanRef;

            const failResult = await payoutService.failPayoutInTransaction(
              client,
              matchedItem.payout_id,
              auth,
              organizationId,
              failureReason
            );
            const isReplay = Boolean(failResult?.isIdempotentReplay);

            await client.query(
              `UPDATE payment_batch_items
               SET status = 'FAILED',
                   bank_utr = COALESCE(bank_utr, $1),
                   bank_status_code = 'FAILED',
                   bank_status_description = $2,
                   failure_reason = $2,
                   updated_at = NOW()
               WHERE id = $3
                 AND batch_id = $4;`,
              [normalizeRef(bankItem.bankUtr) || null, failureReason, matchedItem.item_id, batchId]
            );

            if (!isReplay) {
              await client.query(
                `INSERT INTO payment_reconciliation_records (
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
                 DO NOTHING;`,
                [
                  organizationId,
                  bankRef,
                  toIsoDateOnly(bankItem.transactionDate),
                  hasFiniteAmount ? rawBankAmt : expectedAmount,
                  matchedItem.payout_id,
                  batchId,
                  `Union Bank transfer failed: ${failureReason}`,
                  JSON.stringify(bankItem),
                  auth.userId,
                ]
              );

              pendingNotificationsForItem.push({
                organizationId,
                centerId: matchedItem.center_id,
                customerId: matchedItem.customer_id,
                eventType: NotificationEventType.PAYMENT_FAILED,
                eventId: `evt_payout_failed_${matchedItem.payout_id}`,
                idempotencyKey: `notif_payout_failed_${matchedItem.payout_id}`,
                metadata: {
                  payoutId: matchedItem.payout_id,
                  amount: expectedAmount,
                  currency: matchedItem.payout_currency || 'INR',
                  failureReason,
                },
              });
            }

            matchedItem.item_status = 'FAILED';
            matchedItem.payout_status = 'FAILED';

            processedResults.push({
              itemId: matchedItem.item_id,
              customerReference: cleanRef,
              farmerCode: matchedItem.farmer_code,
              expectedAmount,
              bankAmount: safeBankAmtForAudit,
              bankUtr: normalizeRef(bankItem.bankUtr) || undefined,
              status: 'FAILED',
              message: isReplay
                ? 'Item already marked FAILED (idempotent replay)'
                : `Bank transfer failed: ${failureReason}`,
              isIdempotentReplay: isReplay,
            });
          } else if (bankItem.status === 'REVERSED') {
            const reversalUtr =
              normalizeRef(bankItem.bankUtr) ||
              normalizeRef(bankItem.bankReference) ||
              cleanRef ||
              'NOUTR';
            const reversalIdempotencyKey = `REV-${organizationId}-${matchedItem.payout_id}-${reversalUtr}`;
            const reversalReason =
              normalizeRef(bankItem.failureReason) ||
              `Payment returned by clearing house (UTR: ${reversalUtr})`;

            const reversalResult = await payoutService.reversePayoutInTransaction(
              client,
              matchedItem.payout_id,
              auth,
              organizationId,
              reversalReason,
              reversalIdempotencyKey
            );
            const isReplay = Boolean(reversalResult?.isIdempotentReplay);

            await client.query(
              `UPDATE payment_batch_items
               SET status = 'REVERSED',
                   bank_utr = COALESCE(bank_utr, $1),
                   bank_status_code = 'REVERSED',
                   bank_status_description = $2,
                   failure_reason = $2,
                   updated_at = NOW()
               WHERE id = $3
                 AND batch_id = $4;`,
              [normalizeRef(bankItem.bankUtr) || null, reversalReason, matchedItem.item_id, batchId]
            );

            if (!isReplay) {
              await client.query(
                `INSERT INTO payment_reconciliation_records (
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
                 DO NOTHING;`,
                [
                  organizationId,
                  reversalUtr,
                  toIsoDateOnly(bankItem.transactionDate),
                  expectedAmount,
                  matchedItem.payout_id,
                  batchId,
                  reversalReason,
                  JSON.stringify(bankItem),
                  auth.userId,
                ]
              );

              pendingNotificationsForItem.push({
                organizationId,
                centerId: matchedItem.center_id,
                customerId: matchedItem.customer_id,
                eventType: NotificationEventType.PAYMENT_FAILED,
                eventId: `evt_payout_reversed_${matchedItem.payout_id}`,
                idempotencyKey: `notif_payout_reversed_${matchedItem.payout_id}`,
                metadata: {
                  payoutId: matchedItem.payout_id,
                  amount: expectedAmount,
                  currency: matchedItem.payout_currency || 'INR',
                  failureReason: reversalReason,
                  reversalReference: reversalUtr,
                },
              });
            }

            matchedItem.item_status = 'REVERSED';
            matchedItem.payout_status = 'REVERSED';

            processedResults.push({
              itemId: matchedItem.item_id,
              customerReference: cleanRef,
              farmerCode: matchedItem.farmer_code,
              expectedAmount,
              bankAmount: rawBankAmt,
              bankUtr: reversalUtr,
              status: 'REVERSED',
              message: isReplay
                ? 'Compensating ledger reversal already applied (idempotent replay)'
                : 'Compensating ledger reversal credit applied successfully',
              isIdempotentReplay: isReplay,
            });
          } else if (bankItem.status === 'PENDING') {
            if (!['PAID', 'SETTLED', 'FAILED', 'REVERSED'].includes(matchedItem.item_status)) {
              await client.query(
                `UPDATE payment_batch_items
                 SET status = 'PROCESSING',
                     bank_status_code = 'PENDING',
                     bank_status_description = $1,
                     updated_at = NOW()
                 WHERE id = $2
                   AND batch_id = $3;`,
                [normalizeRef(bankItem.failureReason) || 'In clearing at Union Bank', matchedItem.item_id, batchId]
              );
              matchedItem.item_status = 'PROCESSING';
            }

            processedResults.push({
              itemId: matchedItem.item_id,
              customerReference: cleanRef,
              farmerCode: matchedItem.farmer_code,
              expectedAmount,
              bankAmount: safeBankAmtForAudit,
              status: 'PENDING',
              message: 'Transfer in processing at Union Bank; awaiting final status',
              isIdempotentReplay: false,
            });
          } else {
            // UNKNOWN status: non-financial audit record only — never debit or credit ledger
            const unknownDesc = normalizeRef(bankItem.failureReason) || 'Awaiting bank clearance';
            if (!['PAID', 'SETTLED', 'FAILED', 'REVERSED'].includes(matchedItem.item_status)) {
              await client.query(
                `UPDATE payment_batch_items
                 SET status = 'UNKNOWN',
                     bank_status_code = 'UNKNOWN',
                     bank_status_description = $1,
                     updated_at = NOW()
                 WHERE id = $2
                   AND batch_id = $3;`,
                [unknownDesc, matchedItem.item_id, batchId]
              );
              matchedItem.item_status = 'UNKNOWN';
            }

            await client.query(
              `INSERT INTO payment_reconciliation_records (
                 organization_id, source, external_reference, transaction_date, amount,
                 direction, matched_payout_id, matched_batch_id, reconciliation_status,
                 resolution_action, resolution_notes, raw_details, created_by
               ) VALUES (
                 $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
                 'DEBIT', $5, $6, 'MANUAL_REVIEW_REQUIRED',
                 'AWAIT_BANK_STATUS_INQUIRY', $7, $8, $9
               );`,
              [
                organizationId,
                normalizeRef(bankItem.bankUtr) || cleanRef,
                toIsoDateOnly(bankItem.transactionDate),
                safeBankAmtForAudit,
                matchedItem.payout_id,
                batchId,
                unknownDesc,
                JSON.stringify(bankItem),
                auth.userId,
              ]
            );

            processedResults.push({
              itemId: matchedItem.item_id,
              customerReference: cleanRef,
              farmerCode: matchedItem.farmer_code,
              expectedAmount,
              bankAmount: safeBankAmtForAudit,
              status: 'UNKNOWN',
              message: 'Status remains unknown, manual inquiry or statement check required',
              isIdempotentReplay: false,
            });
          }

          await client.query(`RELEASE SAVEPOINT ${spName}`);
          deferredNotifications.push(...pendingNotificationsForItem);
        } catch (itemErr: any) {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
          } catch (rollbackErr: any) {
            logger.error(
              { error: rollbackErr?.message, originalError: itemErr?.message, batchId, ref: cleanRef },
              'Failed to rollback reconciliation item savepoint; aborting batch transaction'
            );
            throw itemErr;
          }

          if (isExpectedItemBusinessError(itemErr)) {
            logger.warn(
              { error: itemErr.message, code: (itemErr as AppError).code, payoutId: matchedItem.payout_id, batchId, ref: cleanRef },
              'Reconciliation item rejected and rolled back to savepoint'
            );

            const isConflict =
              (itemErr as AppError)?.code === 'CONFLICTING_UTR_REFERENCE' ||
              (itemErr as AppError)?.code === 'CONFLICTING_REVERSAL_REFERENCE' ||
              (typeof itemErr?.message === 'string' &&
                (itemErr.message.includes('CONFLICTING_UTR_REFERENCE') ||
                  itemErr.message.includes('CONFLICTING_REVERSAL_REFERENCE')));

            if (isConflict) {
              await client.query(
                `INSERT INTO payment_reconciliation_records (
                   organization_id, source, external_reference, transaction_date, amount,
                   direction, matched_payout_id, matched_batch_id, reconciliation_status,
                   resolution_action, resolution_notes, raw_details, created_by
                 ) VALUES (
                   $1, 'BANK_STATEMENT_CSV', $2, $3, $4,
                   $5, $6, $7, 'MANUAL_REVIEW_REQUIRED',
                   'CONFLICT_REQUIRES_MANUAL_REVIEW', $8, $9, $10
                 );`,
                [
                  organizationId,
                  normalizeRef(bankItem.bankUtr) || normalizeRef(bankItem.bankReference) || cleanRef,
                  toIsoDateOnly(bankItem.transactionDate),
                  safeBankAmtForAudit,
                  bankItem.status === 'REVERSED' ? 'CREDIT' : 'DEBIT',
                  matchedItem.payout_id,
                  batchId,
                  itemErr.message,
                  JSON.stringify(bankItem),
                  auth.userId,
                ]
              );
            }

            exceptions.push({
              reference: cleanRef,
              reason: itemErr.message,
            });
            continue;
          }

          // Unexpected / infrastructure / database error: roll back the entire batch atomically
          logger.error(
            { error: itemErr?.message, code: itemErr?.code, payoutId: matchedItem.payout_id, batchId, ref: cleanRef },
            'Unexpected DB/infrastructure error in reconciliation; rolling back entire batch transaction'
          );
          throw itemErr;
        }
      }

      // 6. Recompute final batch aggregates from canonical item rows INSIDE the same transaction
      const agg = await recomputeBatchAggregatesInTransaction(client, batchId, organizationId);

      return {
        batchId,
        batchStatus: agg.batchStatus,
        reconciliationStatus: agg.reconciliationStatus,
        totalBeneficiaries: agg.total,
        paidCount: agg.successfulCount,
        successfulCount: agg.successfulCount,
        failedCount: agg.failedCount,
        reversedCount: agg.reversedCount,
        unknownCount: agg.unknownCount,
        processedItems: processedResults,
        exceptions,
      };
    });

    // 7. Only flush notifications AFTER outer PostgreSQL transaction commits
    await flushDeferredNotifications(deferredNotifications);

    return txResult;
  }
}
