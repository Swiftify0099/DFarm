// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// PAYMENT BATCH & SETTLEMENT MANAGEMENT SERVICE (DF-022 TENANT ISOLATION)
// ==============================================================================

import crypto from 'node:crypto';
import type pg from 'pg';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  AppError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { UserRole, NotificationEventType } from '@dfarm/shared-types';
import { payoutService } from './payout.service.js';
import { BankFileService } from './serializers/BankFileService.js';
import { SettlementCalculationService, CalculationPeriodParams } from './settlement-calculation.service.js';
import { UnionBankSubmissionService, SubmitBatchToUnionBankParams } from '../../integrations/banking/union-bank/UnionBankSubmissionService.js';
import { UnionBankReconciliationService } from '../../integrations/banking/union-bank/UnionBankReconciliationService.js';
import { UnionBankStatusInquiryService } from '../../integrations/banking/union-bank/UnionBankStatusInquiryService.js';
import { UnionBankValidator } from '../../integrations/banking/union-bank/UnionBankValidator.js';
import {
  createLegacyPlaintextTracker,
  decryptStoredBankAccountFailClosed,
  encryptBeneficiaryBankAccount,
  hasEncryptedEnvelopeMarker,
  resolveBeneficiaryBankMask,
} from './beneficiary-bank-account.js';
import {
  flushDeferredNotifications,
  getStrictPaymentTenantDb,
  recomputeBatchAggregatesInTransaction,
  resolveOperationalOrganizationId,
  type DeferredNotification,
} from './tenant-payment-context.js';

export interface CreateBatchParams {
  centerId?: string | null;
  billingCycleId?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  paymentMethod?: string;
  customerIds?: string[];
  payoutIds?: string[];
  idempotencyKey: string;
  excludeUnverifiedBankDetails?: boolean;
  debitAccountNumber?: string;
  targetOrganizationId?: string;
  initialStatus?: 'DRAFT' | 'CALCULATED';
}

export interface ReconcileBatchItemInput {
  itemId: string;
  status: 'SETTLED' | 'FAILED' | 'REVERSED';
  beneficiaryReference?: string | null;
  failureReason?: string | null;
}

function formatDateOnly(d: any): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.split('T')[0] ?? null;
  if (d instanceof Date || (typeof d === 'object' && typeof d.toISOString === 'function')) {
    const dateObj = d instanceof Date ? d : new Date(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).split('T')[0] ?? null;
}

export class BatchService {
  /**
   * Generates a preview calculation of farmer-wise payables for a settlement period.
   * Does not persist any records.
   */
  async calculateSettlementPreview(params: CalculationPeriodParams, auth: AuthContext) {
    const organizationId = resolveOperationalOrganizationId(auth, params.organizationId);
    return SettlementCalculationService.calculateSettlement(
      { ...params, organizationId },
      auth
    );
  }

  /**
   * Creates a settlement batch inside the strict dairy tenant DB transaction.
   */
  async createBatch(params: CreateBatchParams, auth: AuthContext) {
    const organizationId = resolveOperationalOrganizationId(auth, params.targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    try {
      return await tenantDb.withTransaction(async (client: pg.PoolClient) => {
        // 1. Idempotency Check inside tenant DB
        const existing = await client.query<any>(
          `SELECT * FROM payment_batches WHERE idempotency_key = $1 AND organization_id = $2;`,
          [params.idempotencyKey, organizationId]
        );
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

        // 2. Duplicate Billing Cycle Batch Protection
        if (params.billingCycleId) {
          const activeCycleBatch = await client.query<any>(
            `SELECT id, batch_number, status
             FROM payment_batches
             WHERE billing_cycle_id = $1
               AND organization_id = $2
               AND status NOT IN ('FAILED', 'CANCELLED')
             LIMIT 1;`,
            [params.billingCycleId, organizationId]
          );
          if (activeCycleBatch.rows.length > 0) {
            throw new ConflictError(
              `An active payout batch (${activeCycleBatch.rows[0].batch_number}, status: ${activeCycleBatch.rows[0].status}) already exists for billing cycle '${params.billingCycleId}'. Duplicate settlement batches are prohibited.`,
              'DUPLICATE_CYCLE_BATCH_PROHIBITED'
            );
          }
        }

        const batchId = crypto.randomUUID();
        const batchNumber =
          'BATCH-' +
          Date.now().toString(36).toUpperCase() +
          '-' +
          crypto.randomBytes(3).toString('hex').toUpperCase();

        const periodStart = params.billingPeriodStart || undefined;
        const periodEnd = params.billingPeriodEnd || undefined;

        let calculationResult: any = null;
        let eligibleBeneficiaries: any[] = [];
        let totalBatchAmount = 0.0;
        const initialStatus = params.initialStatus || (periodStart && periodEnd ? 'CALCULATED' : 'DRAFT');

        if (periodStart && periodEnd) {
          calculationResult = await SettlementCalculationService.calculateSettlement(
            {
              organizationId,
              centerId: params.centerId || null,
              periodStart,
              periodEnd,
              customerIds: params.customerIds,
              excludeUnverifiedBankDetails: params.excludeUnverifiedBankDetails,
            },
            auth,
            client
          );

          eligibleBeneficiaries = calculationResult.farmers.filter((f: any) => {
            if (f.netPayableAmount <= 0) return false;
            if (f.hasMalformedCiphertext) return false;
            if (params.excludeUnverifiedBankDetails && !f.isBankValid) return false;
            return true;
          });

          if (eligibleBeneficiaries.length === 0) {
            throw new BadRequestError(
              'No eligible farmers with net payable balance found for selected settlement period',
              'NO_ELIGIBLE_CUSTOMERS'
            );
          }

          totalBatchAmount = eligibleBeneficiaries.reduce((sum, f) => sum + f.netPayableAmount, 0);
          totalBatchAmount = Math.round((totalBatchAmount + Number.EPSILON) * 100) / 100;
        } else {
          let customersQuery = `
            SELECT c.id, c.primary_center_id, c.full_name, c.farmer_code, c.bank_name,
                   c.bank_account_number, c.bank_account_mask, c.bank_ifsc_code, cla.current_balance
            FROM customers c
            JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
            WHERE c.organization_id = $1 AND c.is_deleted = FALSE AND cla.current_balance > 0.00
          `;
          const queryArgs: any[] = [organizationId];

          if (params.centerId) {
            queryArgs.push(params.centerId);
            customersQuery += ` AND c.primary_center_id = $${queryArgs.length}`;
          }

          if (params.customerIds && params.customerIds.length > 0) {
            const placeholders = params.customerIds
              .map((id) => {
                queryArgs.push(id);
                return `$${queryArgs.length}`;
              })
              .join(', ');
            customersQuery += ` AND c.id IN (${placeholders})`;
          }

          customersQuery += ` ORDER BY c.farmer_code ASC`;

          const eligibleRes = await client.query<any>(customersQuery, queryArgs);

          if (eligibleRes.rows.length === 0) {
            throw new BadRequestError(
              'No eligible customers with payable balance found for batch creation',
              'NO_ELIGIBLE_CUSTOMERS'
            );
          }

          const legacyTracker = createLegacyPlaintextTracker('BatchService.createBatch');
          eligibleBeneficiaries = eligibleRes.rows.map((r: any) => {
            if (hasEncryptedEnvelopeMarker(r.bank_account_number)) {
              decryptStoredBankAccountFailClosed(r.bank_account_number, {
                contextName: `Farmer ${r.farmer_code}`,
                tracker: legacyTracker,
              });
            }
            const bankMask = resolveBeneficiaryBankMask({
              storedMask: r.bank_account_mask,
              storedAccount: r.bank_account_number,
              allowDecryptFallback: true,
              tracker: legacyTracker,
            });
            return {
              customerId: r.id,
              farmerCode: r.farmer_code,
              fullName: r.full_name,
              centerId: r.primary_center_id,
              bankName: r.bank_name,
              bankAccountNumberMask: bankMask,
              bankIfsc: r.bank_ifsc_code,
              netPayableAmount: Number(r.current_balance),
              grossMilkAmount: Number(r.current_balance),
              openingBalance: 0,
              deductionsAmount: 0,
              adjustmentsCredit: 0,
              adjustmentsDebit: 0,
              alreadyPaidAmount: 0,
              remainingBalance: 0,
              sourceLedgerTransactionIds: [],
              sourceCollectionIds: [],
            };
          });
          legacyTracker.flushSummary(organizationId);

          totalBatchAmount = eligibleBeneficiaries.reduce((sum, f) => sum + f.netPayableAmount, 0);
          totalBatchAmount = Math.round((totalBatchAmount + Number.EPSILON) * 100) / 100;
        }

        const snapshotHash =
          calculationResult?.calculationSnapshotHash ||
          crypto
            .createHash('sha256')
            .update(JSON.stringify({ batchId, totalBatchAmount, count: eligibleBeneficiaries.length }))
            .digest('hex');

        await client.query(
          `INSERT INTO payment_batches (
            id, organization_id, center_id, batch_number, billing_cycle_id,
            billing_period_start, billing_period_end, payment_method, status,
            total_beneficiaries, total_amount, pending_count, pending_amount,
            calculation_snapshot_hash, calculation_snapshot_json,
            bank_name, bank_channel, idempotency_key, created_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $10, $11,
            $12, $13,
            'Union Bank of India', 'UNION_BANK_BULK_NEFT', $14, $15, NOW(), NOW()
          );`,
          [
            batchId,
            organizationId,
            params.centerId || null,
            batchNumber,
            params.billingCycleId || null,
            params.billingPeriodStart || null,
            params.billingPeriodEnd || null,
            params.paymentMethod || 'BANK_TRANSFER',
            initialStatus,
            eligibleBeneficiaries.length,
            totalBatchAmount,
            snapshotHash,
            calculationResult ? JSON.stringify(calculationResult) : null,
            params.idempotencyKey,
            auth.userId,
          ]
        );

        const batchItems: any[] = [];
        const snapshotItems: any[] = [];

        for (const cust of eligibleBeneficiaries) {
          const payableAmount = cust.netPayableAmount;
          const payoutId = crypto.randomUUID();
          const mask = cust.bankAccountNumberMask;
          const payoutIdempotency = `BATCH-ITEM-${batchId}-${cust.customerId}`;
          const refNumber = `REF-${batchNumber}-${cust.farmerCode}`;

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
              organizationId,
              cust.centerId,
              cust.customerId,
              batchId,
              payableAmount,
              params.paymentMethod || 'BANK_TRANSFER',
              refNumber,
              batchId,
              payoutIdempotency,
              mask,
              cust.bankIfsc,
              cust.fullName,
              auth.userId,
            ]
          );

          const itemId = crypto.randomUUID();
          await client.query(
            `INSERT INTO payment_batch_items (
              id, batch_id, payout_id, customer_id, amount, currency,
              bank_account_mask, bank_ifsc, status, beneficiary_reference,
              settlement_period_start, settlement_period_end,
              gross_payable, total_deductions, net_payable, remaining_balance,
              calculation_details, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, 'INR',
              $6, $7, $8, $9,
              $10, $11,
              $12, $13, $14, $15,
              $16, NOW(), NOW()
            );`,
            [
              itemId,
              batchId,
              payoutId,
              cust.customerId,
              payableAmount,
              mask,
              cust.bankIfsc,
              initialStatus === 'CALCULATED' ? 'CALCULATED' : 'PENDING',
              refNumber,
              params.billingPeriodStart || null,
              params.billingPeriodEnd || null,
              cust.grossMilkAmount,
              cust.deductionsAmount,
              payableAmount,
              cust.remainingBalance,
              JSON.stringify(cust),
            ]
          );

          batchItems.push({
            itemId,
            payoutId,
            customerId: cust.customerId,
            customerName: cust.fullName,
            farmerCode: cust.farmerCode,
            amount: payableAmount,
            bankAccountMask: mask,
            bankIfsc: cust.bankIfsc,
            status: initialStatus === 'CALCULATED' ? 'CALCULATED' : 'PENDING',
            grossPayable: cust.grossMilkAmount,
            deductions: cust.deductionsAmount,
            remainingBalance: cust.remainingBalance,
          });

          snapshotItems.push({
            batchItemId: itemId,
            item: cust,
          });
        }

        if (periodStart && periodEnd) {
          await SettlementCalculationService.persistSettlementSnapshot(
            client,
            batchId,
            organizationId,
            periodStart,
            periodEnd,
            snapshotItems
          );
        }

        return {
          batchId,
          batchNumber,
          status: initialStatus,
          totalBeneficiaries: batchItems.length,
          totalAmount: totalBatchAmount,
          currency: 'INR',
          calculationSnapshotHash: snapshotHash,
          beneficiaries: batchItems,
          isIdempotentReplay: false,
          createdAt: new Date().toISOString(),
        };
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      if (err.code === '23505') {
        throw new ConflictError('A batch with this idempotency key already exists', 'BATCH_CONFLICT');
      }
      throw new AppError(err.message, 500, 'BATCH_CREATION_FAILED');
    }
  }

  /**
   * Submits a calculated batch for independent review (Maker -> Checker).
   */
  async submitForReview(batchId: string, auth: AuthContext, targetOrganizationId?: string | null) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (res.rows.length === 0) throw new NotFoundError('Batch not found', 'BATCH_NOT_FOUND');
      const b = res.rows[0];

      if (b.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      if (b.status !== 'DRAFT' && b.status !== 'CALCULATED') {
        throw new BadRequestError(`Batch cannot be submitted for review from status '${b.status}'`, 'INVALID_BATCH_STATUS');
      }

      await client.query(
        `UPDATE payment_batches
         SET status = 'UNDER_REVIEW', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2;`,
        [batchId, organizationId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'PENDING', updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      return {
        batchId,
        status: 'UNDER_REVIEW',
        submittedForReviewAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Approves a settlement batch (Checker action). Enforces Maker-Checker segregation of duties.
   */
  async approveBatch(batchId: string, auth: AuthContext, targetOrganizationId?: string | null) {
    const allowedCheckerRoles = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.DAIRY_ADMIN,
      UserRole.SUPERVISOR,
      'PRIMARY_DAIRY_ADMIN',
    ];
    if (!allowedCheckerRoles.includes(auth.role as any)) {
      throw new ForbiddenError(
        'Only an authorized Dairy Admin, Owner, or Supervisor can approve payment batches',
        'UNAUTHORIZED_CHECKER_ROLE'
      );
    }

    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }
      const batch = res.rows[0];

      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      const approvableStatuses = ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'PENDING_APPROVAL'];
      if (!approvableStatuses.includes(batch.status)) {
        throw new BadRequestError(`Batch cannot be approved from status '${batch.status}'`, 'INVALID_BATCH_STATUS');
      }

      if (batch.created_by === auth.userId) {
        throw new ForbiddenError(
          'Maker-Checker segregation of duties violation: The batch creator cannot approve their own batch. An independent supervisor or primary admin must approve it.',
          'MAKER_CHECKER_SELF_APPROVAL_PROHIBITED'
        );
      }

      await client.query(
        `UPDATE payment_batches
         SET status = 'APPROVED',
             approved_by = $1,
             approved_at = NOW(),
             calculation_approved_at = NOW(),
             calculation_approved_by = $1,
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3;`,
        [auth.userId, batchId, organizationId]
      );

      await client.query(
        `UPDATE customer_payouts
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE batch_id = $2 AND organization_id = $3;`,
        [auth.userId, batchId, organizationId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'APPROVED', updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      await client.query(
        `INSERT INTO payment_approvals (
          organization_id, entity_type, entity_id, approver_id, action, comments
        ) VALUES ($1, 'BATCH', $2, $3, 'APPROVED', 'Batch approved for Union Bank payout submission');`,
        [organizationId, batchId, auth.userId]
      );

      return {
        batchId,
        status: 'APPROVED',
        approvedBy: auth.userId,
        approvedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Rejects a settlement batch with a reason. Releases reservations.
   */
  async rejectBatch(
    batchId: string,
    reason: string,
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (res.rows.length === 0) throw new NotFoundError('Batch not found', 'BATCH_NOT_FOUND');
      const batch = res.rows[0];

      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      if (
        batch.status === 'SUBMITTED' ||
        batch.status === 'SUBMITTED_TO_BANK' ||
        batch.status === 'SETTLED' ||
        batch.status === 'PAID'
      ) {
        throw new BadRequestError(
          `Cannot reject batch in status '${batch.status}' once submitted to bank`,
          'CANNOT_REJECT_SUBMITTED_BATCH'
        );
      }

      await client.query(
        `UPDATE payment_batches
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2;`,
        [batchId, organizationId]
      );

      await client.query(
        `UPDATE customer_payouts
         SET status = 'CANCELLED', failure_reason = $1, updated_at = NOW()
         WHERE batch_id = $2 AND organization_id = $3;`,
        [reason || 'Rejected by checker', batchId, organizationId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'CANCELLED', failure_reason = $1, updated_at = NOW()
         WHERE batch_id = $2;`,
        [reason || 'Rejected by checker', batchId]
      );

      await client.query(
        `INSERT INTO payment_approvals (
          organization_id, entity_type, entity_id, approver_id, action, comments
        ) VALUES ($1, 'BATCH', $2, $3, 'REJECTED', $4);`,
        [organizationId, batchId, auth.userId, reason || 'Batch rejected during review']
      );

      return {
        batchId,
        status: 'CANCELLED',
        reason,
        rejectedBy: auth.userId,
      };
    });
  }

  /**
   * Submits batch to Union Bank of India via bulk file export or host-to-host API.
   */
  async submitBatchToUnionBank(batchId: string, params: SubmitBatchToUnionBankParams, auth: AuthContext) {
    return UnionBankSubmissionService.submitBatch({ ...params, batchId }, auth);
  }

  /**
   * Reconciles batch items using bank response data / settlement report.
   */
  async reconcileBatchWithUnionBank(
    batchId: string,
    responseData: any,
    auth: AuthContext,
    targetOrganizationId?: string
  ) {
    return UnionBankReconciliationService.reconcileBatchWithBankData(
      batchId,
      responseData,
      auth,
      targetOrganizationId
    );
  }

  /**
   * Queries status of an in-flight or timed-out batch item from Union Bank.
   */
  async queryBatchItemStatus(itemId: string, auth: AuthContext, targetOrganizationId?: string) {
    return UnionBankStatusInquiryService.queryItemStatus(itemId, auth, targetOrganizationId);
  }

  /**
   * Marks batch items whose network transmission timed out as UNKNOWN.
   */
  async markBatchTimeout(batchId: string, reason: string, auth: AuthContext, targetOrganizationId?: string) {
    return UnionBankStatusInquiryService.markTimeoutUnknown(batchId, auth, reason, targetOrganizationId);
  }

  /**
   * Retrieves beneficiary bank detail revision history.
   */
  async getBeneficiaryAuditHistory(
    customerId: string,
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const custRes = await client.query<{ organization_id: string }>(
        'SELECT organization_id FROM customers WHERE id = $1;',
        [customerId]
      );
      if (custRes.rows.length === 0) throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');

      if (custRes.rows[0]!.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      const res = await client.query(
        `SELECT bal.*, u.full_name as changed_by_name
         FROM beneficiary_audit_logs bal
         JOIN users u ON u.id = bal.changed_by
         WHERE bal.customer_id = $1 AND bal.organization_id = $2
         ORDER BY bal.created_at DESC;`,
        [customerId, organizationId]
      );
      return res.rows;
    });
  }

  /**
   * Updates beneficiary bank details with format validation, encryption, and audit logging.
   */
  async updateBeneficiaryBankDetails(
    customerId: string,
    bankData: {
      bankName: string;
      bankAccountNumber: string;
      bankIfscCode: string;
      bankAccountHolderName: string;
      verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'PENDING_VERIFICATION' | 'REJECTED';
      reason?: string;
    },
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const custRes = await client.query<any>(
        'SELECT * FROM customers WHERE id = $1 FOR UPDATE;',
        [customerId]
      );
      if (custRes.rows.length === 0) throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
      const cust = custRes.rows[0];

      if (cust.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      const cleanIfsc = UnionBankValidator.validateIfsc(bankData.bankIfscCode, cust.full_name);
      const cleanName = (bankData.bankAccountHolderName || cust.full_name).trim();
      const cleanBank = (bankData.bankName || 'Union Bank of India').trim();
      const newStatus = bankData.verificationStatus || 'VERIFIED';

      const prevMask = resolveBeneficiaryBankMask({
        storedMask: cust.bank_account_mask,
        storedAccount: cust.bank_account_number,
        allowDecryptFallback: true,
      });

      const {
        encryptedAccount: storedAccount,
        mask: newMask,
      } = encryptBeneficiaryBankAccount(bankData.bankAccountNumber, cust.full_name);

      await client.query(
        `UPDATE customers
         SET bank_name = $1,
             bank_account_number = $2,
             bank_account_mask = $3,
             bank_ifsc_code = $4,
             bank_account_holder_name = $5,
             bank_verification_status = $6,
             bank_verified_at = NOW(),
             bank_verified_by = $7,
             updated_at = NOW()
         WHERE id = $8 AND organization_id = $9;`,
        [cleanBank, storedAccount, newMask, cleanIfsc, cleanName, newStatus, auth.userId, customerId, organizationId]
      );

      await client.query(
        `INSERT INTO beneficiary_audit_logs (
          organization_id, customer_id, previous_bank_name, new_bank_name,
          previous_account_mask, new_account_mask, previous_ifsc, new_ifsc,
          previous_holder_name, new_holder_name, previous_verification_status, new_verification_status,
          changed_by, reason, created_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, NOW()
        );`,
        [
          organizationId,
          customerId,
          cust.bank_name,
          cleanBank,
          prevMask,
          newMask,
          cust.bank_ifsc_code,
          cleanIfsc,
          cust.bank_account_holder_name,
          cleanName,
          cust.bank_verification_status || 'UNVERIFIED',
          newStatus,
          auth.userId,
          bankData.reason || 'Beneficiary bank account updated via dairy admin',
        ]
      );

      return {
        customerId,
        bankName: cleanBank,
        bankAccountNumberMask: newMask,
        bankIfscCode: cleanIfsc,
        bankAccountHolderName: cleanName,
        bankVerificationStatus: newStatus,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async submitBatch(batchId: string, auth: AuthContext, targetOrganizationId?: string | null) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }
      const batch = res.rows[0];

      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      if (batch.status !== 'APPROVED') {
        throw new BadRequestError(
          `Batch must be APPROVED before submission (current: '${batch.status}')`,
          'INVALID_BATCH_STATUS'
        );
      }

      await client.query(
        `UPDATE payment_batches
         SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND organization_id = $2;`,
        [batchId, organizationId]
      );

      await client.query(
        `UPDATE customer_payouts
         SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE batch_id = $1 AND organization_id = $2;`,
        [batchId, organizationId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'SUBMITTED', updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      return {
        batchId,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        ledgerEffectApplied: false,
      };
    });
  }

  async reconcileBatch(
    batchId: string,
    results: ReconcileBatchItemInput[],
    auth: AuthContext,
    targetOrganizationId?: string | null
  ) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);
    const deferredNotifications: DeferredNotification[] = [];

    const outcome = await tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const batchRes = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (batchRes.rows.length === 0) {
        throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }
      const batch = batchRes.rows[0];

      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError('Cross-organization access prohibited', 'CROSS_ORG_ACCESS_DENIED');
      }

      const processedItems: any[] = [];

      for (let idx = 0; idx < results.length; idx++) {
        const itemResult = results[idx]!;
        const itemRes = await client.query<any>(
          `SELECT bi.*, cp.center_id, cp.currency, cp.payment_method, cp.bank_account_mask
           FROM payment_batch_items bi
           JOIN customer_payouts cp ON cp.id = bi.payout_id
           WHERE bi.id = $1 AND bi.batch_id = $2 AND cp.organization_id = $3
           FOR UPDATE OF bi, cp;`,
          [itemResult.itemId, batchId, organizationId]
        );
        if (itemRes.rows.length === 0) {
          continue;
        }
        const item = itemRes.rows[0];
        const spName = `sp_batch_item_${idx}`;
        await client.query(`SAVEPOINT ${spName}`);

        try {
          if (itemResult.status === 'SETTLED') {
            const utr =
              itemResult.beneficiaryReference ||
              item.beneficiary_reference ||
              `BATCH-UTR-${batch.batch_number}`;
            const settledAt = new Date();
            const settlement = await payoutService.confirmPayoutInTransaction(
              client,
              item.payout_id,
              auth,
              organizationId,
              utr,
              settledAt
            );

            await client.query(
              `UPDATE payment_batch_items
               SET status = 'SETTLED',
                   beneficiary_reference = COALESCE($1, beneficiary_reference),
                   bank_utr = COALESCE(bank_utr, $1),
                   settled_at = COALESCE(settled_at, $2),
                   updated_at = NOW()
               WHERE id = $3 AND batch_id = $4;`,
              [utr, settledAt, item.id, batchId]
            );

            if (!settlement?.isIdempotentReplay) {
              deferredNotifications.push({
                organizationId,
                centerId: item.center_id,
                customerId: item.customer_id,
                eventType: NotificationEventType.PAYMENT_SETTLED,
                eventId: `evt_payout_settled_${item.payout_id}`,
                idempotencyKey: `notif_payout_${item.payout_id}`,
                metadata: {
                  payoutId: item.payout_id,
                  amount: Number(item.amount),
                  currency: item.currency || 'INR',
                  paymentMethod: item.payment_method || 'BANK_TRANSFER',
                  referenceNumber: utr,
                  bankAccountMask: item.bank_account_mask || 'XXXX-XXXX-XXXX',
                  settledDate: settledAt.toLocaleDateString('en-GB'),
                },
              });
            }

            processedItems.push({
              itemId: item.id,
              payoutId: item.payout_id,
              status: 'SETTLED',
              amount: Number(item.amount),
              settledAt: settlement.settledAt,
            });
          } else if (itemResult.status === 'REVERSED') {
            const revReason =
              itemResult.failureReason || 'Reversal reported during batch reconciliation';
            const revRef = itemResult.beneficiaryReference || item.bank_utr || item.id;
            await payoutService.reversePayoutInTransaction(
              client,
              item.payout_id,
              auth,
              organizationId,
              revReason,
              `REV-${organizationId}-${item.payout_id}-${revRef}`
            );

            await client.query(
              `UPDATE payment_batch_items
               SET status = 'REVERSED', failure_reason = $1, updated_at = NOW()
               WHERE id = $2 AND batch_id = $3;`,
              [revReason, item.id, batchId]
            );

            processedItems.push({
              itemId: item.id,
              payoutId: item.payout_id,
              status: 'REVERSED',
              amount: Number(item.amount),
              failureReason: revReason,
            });
          } else {
            const failReason =
              itemResult.failureReason ||
              'Bank account invalid or rejected by beneficiary clearing house';
            const failRes = await payoutService.failPayoutInTransaction(
              client,
              item.payout_id,
              auth,
              organizationId,
              failReason
            );

            if (!failRes?.isIdempotentReplay) {
              deferredNotifications.push({
                organizationId,
                centerId: item.center_id,
                customerId: item.customer_id,
                eventType: NotificationEventType.PAYMENT_FAILED,
                eventId: `evt_payout_failed_${item.payout_id}`,
                idempotencyKey: `notif_payout_fail_${item.payout_id}`,
                metadata: {
                  payoutId: item.payout_id,
                  amount: Number(item.amount),
                  referenceNumber: item.beneficiary_reference || 'N/A',
                  failureReason: failReason,
                },
              });
            }

            processedItems.push({
              itemId: item.id,
              payoutId: item.payout_id,
              status: 'FAILED',
              amount: Number(item.amount),
              failureReason: failReason,
            });
          }

          await client.query(`RELEASE SAVEPOINT ${spName}`);
        } catch (err: any) {
          await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
          await client.query(`RELEASE SAVEPOINT ${spName}`);

          if (err instanceof AppError && err.statusCode < 500) {
            processedItems.push({
              itemId: item.id,
              payoutId: item.payout_id,
              status: 'FAILED',
              amount: Number(item.amount),
              error: err.message,
            });
          } else {
            throw err;
          }
        }
      }

      const agg = await recomputeBatchAggregatesInTransaction(client, batchId, organizationId);

      // Map generic batch workflow statuses cleanly ('SETTLED' / 'PARTIALLY_SETTLED' / 'FAILED')
      let finalBatchStatus = 'PARTIALLY_SETTLED';
      if (agg.successfulCount === agg.total && agg.total > 0) {
        finalBatchStatus = 'SETTLED';
      } else if (agg.failedCount === agg.total) {
        finalBatchStatus = 'FAILED';
      } else if (agg.reversedCount === agg.total && agg.total > 0) {
        finalBatchStatus = 'RECONCILED';
      }

      const reconStatus =
        agg.successfulCount + agg.failedCount + agg.reversedCount === agg.total
          ? 'FULLY_RECONCILED'
          : 'PARTIALLY_RECONCILED';

      await client.query(
        `UPDATE payment_batches
         SET status = $1,
             reconciliation_status = $2,
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = $3 AND organization_id = $4;`,
        [finalBatchStatus, reconStatus, batchId, organizationId]
      );

      return {
        batchId,
        batchStatus: finalBatchStatus,
        reconciliationStatus: reconStatus,
        totalBeneficiaries: agg.total,
        successfulCount: agg.successfulCount,
        failedCount: agg.failedCount,
        processedInCall: processedItems.length,
        items: processedItems,
      };
    });

    await flushDeferredNotifications(deferredNotifications);

    return outcome;
  }

  async getBatchById(batchId: string, auth: AuthContext, targetOrganizationId?: string | null) {
    const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    return tenantDb.withTransaction(async (client: pg.PoolClient) => {
      const res = await client.query<any>(
        'SELECT * FROM payment_batches WHERE id = $1;',
        [batchId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }
      const b = res.rows[0];

      if (b.organization_id !== organizationId) {
        throw new ForbiddenError(
          'Cross-organization batch access is strictly prohibited',
          'CROSS_ORG_ACCESS_DENIED'
        );
      }

      const itemsRes = await client.query<any>(
        `SELECT bi.*, c.full_name as customer_name, c.farmer_code
         FROM payment_batch_items bi
         JOIN customers c ON c.id = bi.customer_id
         WHERE bi.batch_id = $1
         ORDER BY c.farmer_code ASC, bi.created_at ASC;`,
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
        calculationSnapshotHash: b.calculation_snapshot_hash,
        bankName: b.bank_name || 'Union Bank of India',
        bankChannel: b.bank_channel,
        bankBatchReference: b.bank_batch_reference,
        bankSubmissionId: b.bank_submission_id,
        createdAt: b.created_at,
        items: itemsRes.rows.map((i: any) => ({
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
          bankUtr: i.bank_utr,
          failureReason: i.failure_reason,
          settledAt: i.settled_at,
          grossPayable: i.gross_payable ? Number(i.gross_payable) : undefined,
          totalDeductions: i.total_deductions ? Number(i.total_deductions) : undefined,
          netPayable: i.net_payable ? Number(i.net_payable) : Number(i.amount),
          remainingBalance: i.remaining_balance ? Number(i.remaining_balance) : undefined,
        })),
      };
    });
  }

  async exportBatch(
    batchId: string,
    format: string,
    auth: AuthContext,
    options?: { debitAccountNumber?: string; targetOrganizationId?: string }
  ) {
    return BankFileService.exportBatch(batchId, format, auth, options);
  }

  downloadBatch(token: string) {
    return BankFileService.getExportByToken(token);
  }
}

export const batchService = new BatchService();
