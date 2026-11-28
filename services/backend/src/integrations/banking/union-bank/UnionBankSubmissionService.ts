// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: SUBMISSION SERVICE (DF-022 / DF-024 FIX)
// ==============================================================================
//
// DF-022 & DF-024 SECURITY AND TRANSACTION DESIGN:
//   - Strict tenant isolation via `getStrictPaymentTenantDb(organizationId)` with
//     `{ bypassCache: true, strictOperational: true }` — zero global query/pool.
//   - Two-phase transmission boundary for HOST_TO_HOST_API so no DB lock or
//     transaction is held open while awaiting external Union Bank HTTP I/O:
//       Phase 1 TX : Lock batch + items, check organization ownership & maker-checker,
//                    validate active beneficiaries & fail-closed dairy debit account,
//                    check durable idempotency key, generate file + SHA-256 hash,
//                    persist submission intent (`GENERATED` for API, `SUBMITTED_TO_BANK`
//                    for manual bulk file export — never marks payouts PAID).
//       Phase 2 HTTP: Perform `this.apiClient.submitBatch(...)` outside any transaction.
//       Phase 3 TX : Lock submission + batch, persist ack (`PROCESSING`), pre-flight
//                    config failure (`FAILED` + revert batch), or ambiguous timeout
//                    (`TIMEOUT_UNKNOWN` / `UNKNOWN`, leaving payouts recoverable).
//   - Never falls back to '00000000000000' or platform-wide debit accounts.
//   - Never logs full bank account credentials; only masked `XXXX-XXXX-<last4>`.
//
// ==============================================================================

import crypto from 'node:crypto';
import type pg from 'pg';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/app-error.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import { logger } from '../../../shared/logger/index.js';
import {
  createLegacyPlaintextTracker,
  decryptStoredBankAccountFailClosed,
} from '../../../modules/payments/beneficiary-bank-account.js';
import {
  getStrictPaymentTenantDb,
  maskAccountNumber,
  resolveOperationalOrganizationId,
} from '../../../modules/payments/tenant-payment-context.js';
import { UnionBankFileGenerator } from './UnionBankFileGenerator.js';
import { UnionBankApiClient } from './UnionBankApiClient.js';
import { UnionBankValidator } from './UnionBankValidator.js';
import type {
  UnionBankBatchPayload,
  UnionBankFileFormat,
  UnionBankGeneratedFile,
} from './types.js';

export interface SubmitBatchToUnionBankParams {
  batchId: string;
  submissionType: 'BULK_FILE_EXPORT' | 'HOST_TO_HOST_API' | 'CAPS_PORTAL_EXPORT';
  fileFormat?: UnionBankFileFormat;
  debitAccountNumber?: string;
  targetOrganizationId?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface SubmitBatchToUnionBankResult {
  submissionId: string;
  submissionReference: string;
  batchId: string;
  batchNumber: string;
  status: string;
  submissionType: string;
  fileFormat?: string;
  fileName?: string;
  fileContent?: string;
  fileHashSha256: string;
  totalRecords: number;
  totalAmount: number;
  debitAccountMask: string;
  submittedAt: string;
  isIdempotentReplay?: boolean;
  bankAcknowledgementRef?: string | null;
}

async function resolveDairyAuthorizedDebitAccount(
  client: pg.PoolClient,
  organizationId: string,
  requestedDebitAccount?: string
): Promise<string> {
  // Check tenant-scoped stored corporate bank debit account in tenant DB if present
  const orgRes = await client.query<{ bank_debit_account_encrypted: string | null }>(
    `SELECT bank_debit_account_encrypted
     FROM organizations
     WHERE id = $1
     LIMIT 1;`,
    [organizationId]
  );

  const trimmedReq = (requestedDebitAccount || '').trim();
  const orgEnc = orgRes.rows[0]?.bank_debit_account_encrypted;

  let candidate = trimmedReq;
  if (!candidate && orgEnc) {
    const decryptedDebit = decryptStoredBankAccountFailClosed(orgEnc, {
      contextName: 'Dairy Union Bank Debit Account',
      notConfiguredCode: 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED',
    });
    candidate = decryptedDebit.accountNumber;
  }

  if (!candidate) {
    throw new BadRequestError(
      'Authorized dairy Union Bank debit account is not configured for this dairy. Bank file generation and submission rejected.',
      'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED'
    );
  }
  if (candidate.includes(':') || /[^0-9\s-]/.test(candidate)) {
    throw new BadRequestError(
      'Invalid dairy Union Bank debit account number format. Must contain 9 to 18 numeric digits.',
      'INVALID_BANK_ACCOUNT'
    );
  }

  // Never allow platform env fallback or all-zero placeholder accounts
  return UnionBankValidator.validateAccountNumber(candidate, 'Dairy Union Bank Debit Account');
}

function isPreTransmissionConfigError(err: any): boolean {
  const code = typeof err?.code === 'string' ? err.code : '';
  return (
    code === 'UNION_BANK_CREDENTIALS_MISSING' ||
    code === 'UNION_BANK_ENDPOINT_UNAVAILABLE' ||
    code === 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED' ||
    code === 'INVALID_BANK_ACCOUNT'
  );
}

export class UnionBankSubmissionService {
  private static apiClient = new UnionBankApiClient();

  /**
   * Dispatches or exports an approved payout batch to Union Bank of India.
   */
  public static async submitBatch(
    params: SubmitBatchToUnionBankParams,
    auth: AuthContext
  ): Promise<SubmitBatchToUnionBankResult> {
    const {
      batchId,
      submissionType,
      fileFormat = 'UNION_BANK_BULK_NEFT_CSV',
    } = params;

    if (!batchId || !batchId.trim()) {
      throw new BadRequestError('batchId is required for Union Bank submission', 'INVALID_BATCH_ID');
    }

    const organizationId = resolveOperationalOrganizationId(auth, params.targetOrganizationId);
    const tenantDb = await getStrictPaymentTenantDb(organizationId);

    const stableIdempotencyKey =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim().length > 0
        ? params.idempotencyKey.trim()
        : `UBI-SUB-${organizationId}-${batchId}-${submissionType}-${fileFormat}`;

    // =========================================================================
    // PHASE 1 TX: Validate, Lock, Check Idempotency & Persist Submission Intent
    // =========================================================================
    const phase1 = await tenantDb.withTransaction(async (client) => {
      // 1. Lock payment batch row inside tenant DB
      const batchRes = await client.query<any>(
        `SELECT *
         FROM payment_batches
         WHERE id = $1
         FOR UPDATE;`,
        [batchId]
      );
      if (batchRes.rows.length === 0) {
        throw new NotFoundError(`Payment batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
      }
      const batch = batchRes.rows[0];

      // 2. Verify organization ownership inside tenant DB
      if (batch.organization_id !== organizationId) {
        throw new ForbiddenError(
          'Cross-organization batch submission is prohibited',
          'CROSS_ORG_ACCESS_DENIED'
        );
      }

      // 3. Check durable idempotency key for safe retries
      const existingByKeyRes = await client.query<any>(
        `SELECT *
         FROM bank_submissions
         WHERE organization_id = $1
           AND idempotency_key = $2
         FOR UPDATE
         LIMIT 1;`,
        [organizationId, stableIdempotencyKey]
      );

      if (existingByKeyRes.rows.length > 0) {
        const sub = existingByKeyRes.rows[0];
        if (sub.status === 'TIMEOUT_UNKNOWN') {
          throw new ConflictError(
            `Bank submission '${sub.submission_reference}' has ambiguous TIMEOUT_UNKNOWN state. Run status inquiry before retrying.`,
            'SUBMISSION_TIMEOUT_INQUIRY_REQUIRED'
          );
        }

        if (['SUBMITTED_TO_BANK', 'ACKNOWLEDGED', 'PROCESSING', 'COMPLETED'].includes(sub.status)) {
          return {
            mode: 'REPLAY' as const,
            result: {
              submissionId: sub.id,
              submissionReference: sub.submission_reference,
              batchId: sub.batch_id,
              batchNumber: batch.batch_number,
              status: sub.status,
              submissionType: sub.submission_type,
              fileFormat: sub.file_format,
              fileName: sub.file_name,
              fileHashSha256: sub.file_hash_sha256,
              totalRecords: Number(sub.total_records),
              totalAmount: Number(sub.total_amount),
              debitAccountMask: maskAccountNumber(params.debitAccountNumber),
              submittedAt:
                sub.submitted_at instanceof Date
                  ? sub.submitted_at.toISOString()
                  : String(sub.submitted_at),
              bankAcknowledgementRef: sub.bank_acknowledgement_ref || null,
              isIdempotentReplay: true,
            },
          };
        }
      }

      // 4. Validate batch workflow state (must be APPROVED)
      if (batch.status !== 'APPROVED') {
        throw new BadRequestError(
          `Batch must be in APPROVED status before bank submission (current status: '${batch.status}')`,
          'BATCH_NOT_APPROVED'
        );
      }

      // 5. Enforce Maker-Checker segregation of duties inside tenant DB
      if (!batch.approved_by) {
        throw new ForbiddenError(
          'Maker-Checker violation: Batch has not been independently approved by an authorized checker.',
          'BATCH_UNAPPROVED'
        );
      }
      if (batch.created_by === batch.approved_by) {
        throw new ForbiddenError(
          'Maker-Checker violation: Self-approved batch detected. Bank submission blocked.',
          'SELF_APPROVAL_VIOLATION'
        );
      }

      // 6. Fail-closed dairy debit account resolution & validation (DF-024)
      const debitAccount = await resolveDairyAuthorizedDebitAccount(
        client,
        organizationId,
        params.debitAccountNumber
      );
      const debitAccountMask = maskAccountNumber(debitAccount);

      // 7. Lock batch items & beneficiary customers FOR UPDATE
      const itemsRes = await client.query<any>(
        `SELECT bi.id AS item_id,
                bi.payout_id,
                bi.amount,
                bi.bank_ifsc,
                bi.beneficiary_reference,
                c.id AS customer_id,
                c.farmer_code,
                c.full_name,
                c.bank_account_number,
                c.bank_verification_status,
                c.beneficiary_status
         FROM payment_batch_items bi
         JOIN customers c ON c.id = bi.customer_id
         WHERE bi.batch_id = $1
         ORDER BY c.farmer_code ASC
         FOR UPDATE OF bi, c;`,
        [batchId]
      );

      if (itemsRes.rows.length === 0) {
        throw new BadRequestError('Payment batch contains no items for submission', 'EMPTY_BATCH');
      }

      // Verify all beneficiaries & decrypt beneficiary accounts without logging them
      const legacyTracker = createLegacyPlaintextTracker('UnionBankSubmissionService.submitBatch');
      const payloadItems = itemsRes.rows.map((r: any) => {
        if (r.beneficiary_status !== 'ACTIVE') {
          throw new BadRequestError(
            `Cannot submit batch: Farmer ${r.farmer_code} has non-active beneficiary status '${r.beneficiary_status}'`,
            'BENEFICIARY_NOT_ACTIVE'
          );
        }
        const decryptedBeneficiary = decryptStoredBankAccountFailClosed(r.bank_account_number, {
          contextName: `Farmer ${r.farmer_code}`,
          tracker: legacyTracker,
        });
        const validatedBeneficiaryAccount = UnionBankValidator.validateAccountNumber(
          decryptedBeneficiary.accountNumber,
          `Farmer ${r.farmer_code}`
        );
        const validatedIfsc = UnionBankValidator.validateIfsc(r.bank_ifsc, `Farmer ${r.farmer_code}`);
        const validatedAmount = UnionBankValidator.validateAmount(r.amount);

        return {
          itemId: r.item_id,
          payoutId: r.payout_id,
          farmerCode: r.farmer_code,
          customerName: r.full_name,
          bankAccount: validatedBeneficiaryAccount,
          bankIfsc: validatedIfsc,
          amount: validatedAmount,
          referenceNumber: r.beneficiary_reference || `REF-${batch.batch_number}-${r.farmer_code}`,
          narration: `Milk Payment ${batch.batch_number} - ${r.farmer_code}`,
        };
      });
      legacyTracker.flushSummary(organizationId);

      const payload: UnionBankBatchPayload = {
        batchId: batch.id,
        batchNumber: batch.batch_number,
        organizationId: batch.organization_id,
        debitAccountNumber: debitAccount,
        valueDate: new Date().toISOString().slice(0, 10),
        items: payloadItems,
      };

      // 8. Generate bank file & checksum
      const generatedFile: UnionBankGeneratedFile = UnionBankFileGenerator.generateFile(
        payload,
        fileFormat
      );

      const submissionId = crypto.randomUUID();
      const submissionRef = `UBI-SUB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const isHostToHost = submissionType === 'HOST_TO_HOST_API';
      const initialSubmissionStatus = isHostToHost ? 'GENERATED' : 'SUBMITTED_TO_BANK';
      const initialBatchStatus = isHostToHost ? 'PROCESSING' : 'SUBMITTED_TO_BANK';

      await client.query(
        `INSERT INTO bank_submissions (
           id, organization_id, batch_id, bank_name, submission_type, file_format,
           file_name, file_hash_sha256, file_checksum, total_records, total_amount,
           submission_reference, idempotency_key, status, submitted_by, submitted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'Union Bank of India', $4, $5,
           $6, $7, $7, $8, $9,
           $10, $11, $12, $13, NOW(), NOW(), NOW()
         );`,
        [
          submissionId,
          organizationId,
          batchId,
          submissionType,
          fileFormat,
          generatedFile.fileName,
          generatedFile.checksumSha256,
          generatedFile.totalRecords,
          generatedFile.totalAmount,
          submissionRef,
          stableIdempotencyKey,
          initialSubmissionStatus,
          auth.userId,
        ]
      );

      await client.query(
        `UPDATE payment_batches
         SET status = $1,
             bank_submission_id = $2,
             bank_batch_reference = $3,
             bank_channel = $4,
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE id = $5
           AND organization_id = $6;`,
        [initialBatchStatus, submissionId, submissionRef, fileFormat, batchId, organizationId]
      );

      await client.query(
        `UPDATE payment_batch_items
         SET status = 'SUBMITTED_TO_BANK',
             updated_at = NOW()
         WHERE batch_id = $1;`,
        [batchId]
      );

      // Keep customer_payouts in SUBMITTED (never pre-mark SETTLED/PAID!)
      await client.query(
        `UPDATE customer_payouts
         SET status = 'SUBMITTED',
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE batch_id = $1
           AND organization_id = $2;`,
        [batchId, organizationId]
      );

      if (!isHostToHost) {
        await client.query(
          `INSERT INTO payment_approvals (
             organization_id, entity_type, entity_id, approver_id, action, comments
           ) VALUES ($1, 'BATCH', $2, $3, 'SUBMITTED', $4);`,
          [
            organizationId,
            batchId,
            auth.userId,
            `Generated & exported Union Bank bulk file (${fileFormat}) for debit ${debitAccountMask}. Ref: ${submissionRef}`,
          ]
        );

        logger.info(
          {
            organizationId,
            batchId,
            submissionId,
            submissionType,
            fileFormat,
            debitAccountMask,
            totalRecords: generatedFile.totalRecords,
            totalAmount: generatedFile.totalAmount,
          },
          'Union Bank bulk file export prepared inside tenant transaction'
        );
      }

      return {
        mode: isHostToHost ? ('HOST_TO_HOST' as const) : ('FILE_EXPORT' as const),
        submissionId,
        submissionReference: submissionRef,
        batchNumber: batch.batch_number,
        generatedFile,
        payload,
        debitAccountMask,
        result: {
          submissionId,
          submissionReference: submissionRef,
          batchId,
          batchNumber: batch.batch_number,
          status: initialSubmissionStatus,
          submissionType,
          fileFormat,
          fileName: generatedFile.fileName,
          fileContent: generatedFile.content,
          fileHashSha256: generatedFile.checksumSha256,
          totalRecords: generatedFile.totalRecords,
          totalAmount: generatedFile.totalAmount,
          debitAccountMask,
          submittedAt: new Date().toISOString(),
          isIdempotentReplay: false,
        } satisfies SubmitBatchToUnionBankResult,
      };
    });

    if (phase1.mode === 'REPLAY' || phase1.mode === 'FILE_EXPORT') {
      return phase1.result;
    }

    // =========================================================================
    // PHASE 2 (OUTSIDE DB TRANSACTION): Perform External Union Bank API Call
    // =========================================================================
    let apiResult: Awaited<ReturnType<UnionBankApiClient['submitBatch']>> | null = null;
    let apiError: any = null;

    try {
      apiResult = await this.apiClient.submitBatch(phase1.payload);
    } catch (err: any) {
      apiError = err;
    }

    // =========================================================================
    // PHASE 3 TX: Persist Actual Bank Ack, Pre-Flight Rejection, or Timeout UNKNOWN
    // =========================================================================
    if (apiResult) {
      await tenantDb.withTransaction(async (client) => {
        await client.query(
          `SELECT id FROM bank_submissions WHERE id = $1 AND organization_id = $2 FOR UPDATE;`,
          [phase1.submissionId, organizationId]
        );
        await client.query(
          `SELECT id FROM payment_batches WHERE id = $1 AND organization_id = $2 FOR UPDATE;`,
          [batchId, organizationId]
        );

        await client.query(
          `UPDATE bank_submissions
           SET status = 'PROCESSING',
               bank_acknowledgement_ref = $1,
               bank_response_payload = $2,
               updated_at = NOW()
           WHERE id = $3
             AND organization_id = $4;`,
          [
            apiResult.acknowledgementNumber,
            JSON.stringify(apiResult),
            phase1.submissionId,
            organizationId,
          ]
        );

        await client.query(
          `UPDATE payment_batches
           SET status = 'PROCESSING',
               submitted_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2;`,
          [batchId, organizationId]
        );

        await client.query(
          `UPDATE payment_batch_items
           SET status = 'PROCESSING',
               bank_reference_number = COALESCE(bank_reference_number, $1),
               bank_status_code = 'PROCESSING',
               bank_status_description = 'Acknowledged by Union Bank Host-to-Host API',
               updated_at = NOW()
           WHERE batch_id = $2;`,
          [apiResult.bankTransmissionReference, batchId]
        );

        await client.query(
          `INSERT INTO payment_approvals (
             organization_id, entity_type, entity_id, approver_id, action, comments
           ) VALUES ($1, 'BATCH', $2, $3, 'SUBMITTED', $4);`,
          [
            organizationId,
            batchId,
            auth.userId,
            `Submitted to Union Bank Host-to-Host API for debit ${phase1.debitAccountMask}. Ref: ${phase1.submissionReference}`,
          ]
        );
      });

      logger.info(
        {
          organizationId,
          batchId,
          submissionId: phase1.submissionId,
          debitAccountMask: phase1.debitAccountMask,
          ackRef: apiResult.acknowledgementNumber,
        },
        'Union Bank Host-to-Host submission acknowledged'
      );

      return {
        ...phase1.result,
        status: 'PROCESSING',
        bankAcknowledgementRef: apiResult.acknowledgementNumber,
      };
    }

    // External API call failed or timed out
    const preTransmissionFailure = isPreTransmissionConfigError(apiError);
    const errorDesc = String(apiError?.message || 'Union Bank API request error').slice(0, 500);

    await tenantDb.withTransaction(async (client) => {
      await client.query(
        `SELECT id FROM bank_submissions WHERE id = $1 AND organization_id = $2 FOR UPDATE;`,
        [phase1.submissionId, organizationId]
      );
      await client.query(
        `SELECT id FROM payment_batches WHERE id = $1 AND organization_id = $2 FOR UPDATE;`,
        [batchId, organizationId]
      );

      if (preTransmissionFailure) {
        // Nothing was transmitted to Union Bank — revert batch cleanly so config can be fixed
        await client.query(
          `UPDATE bank_submissions
           SET status = 'FAILED',
               bank_response_payload = $1,
               updated_at = NOW()
           WHERE id = $2
             AND organization_id = $3;`,
          [
            JSON.stringify({ code: apiError?.code || 'PRE_FLIGHT_FAILED', message: errorDesc }),
            phase1.submissionId,
            organizationId,
          ]
        );

        await client.query(
          `UPDATE payment_batches
           SET status = 'APPROVED',
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2;`,
          [batchId, organizationId]
        );

        await client.query(
          `UPDATE payment_batch_items
           SET status = 'APPROVED',
               bank_status_description = $1,
               updated_at = NOW()
           WHERE batch_id = $2;`,
          [errorDesc, batchId]
        );

        await client.query(
          `UPDATE customer_payouts
           SET status = 'APPROVED',
               updated_at = NOW()
           WHERE batch_id = $1
             AND organization_id = $2;`,
          [batchId, organizationId]
        );
      } else {
        // Ambiguous transport/gateway failure or timeout: preserve recoverable UNKNOWN state
        // Never fabricate bank acknowledgement or mark payouts SETTLED/PAID.
        await client.query(
          `UPDATE bank_submissions
           SET status = 'TIMEOUT_UNKNOWN',
               bank_response_payload = $1,
               updated_at = NOW()
           WHERE id = $2
             AND organization_id = $3;`,
          [
            JSON.stringify({
              ambiguous: true,
              code: apiError?.code || 'BANK_SUBMISSION_AMBIGUOUS',
              message: errorDesc,
            }),
            phase1.submissionId,
            organizationId,
          ]
        );

        await client.query(
          `UPDATE payment_batches
           SET status = 'UNKNOWN',
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2;`,
          [batchId, organizationId]
        );

        await client.query(
          `UPDATE payment_batch_items
           SET status = 'UNKNOWN',
               bank_status_code = 'UNKNOWN',
               bank_status_description = $1,
               updated_at = NOW()
           WHERE batch_id = $2;`,
          [errorDesc, batchId]
        );
      }
    });

    if (apiError instanceof AppError) {
      throw apiError;
    }
    throw new AppError(
      `Union Bank submission did not return a deterministic acknowledgement; batch marked UNKNOWN for status inquiry: ${errorDesc}`,
      504,
      'UNION_BANK_TIMEOUT_UNKNOWN'
    );
  }
}
