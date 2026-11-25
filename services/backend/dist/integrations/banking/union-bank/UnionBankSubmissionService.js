// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: SUBMISSION SERVICE (PROMPT 7)
// ==============================================================================
import crypto from 'node:crypto';
import { query, pool } from '../../../config/db.js';
import { BadRequestError, NotFoundError, ForbiddenError, AppError } from '../../../shared/errors/app-error.js';
import { UnionBankFileGenerator } from './UnionBankFileGenerator.js';
import { UnionBankApiClient } from './UnionBankApiClient.js';
import { UnionBankValidator } from './UnionBankValidator.js';
export class UnionBankSubmissionService {
    static apiClient = new UnionBankApiClient();
    /**
     * Dispatches or exports an approved payout batch to Union Bank of India.
     */
    static async submitBatch(params, auth) {
        const { batchId, submissionType, fileFormat = 'UNION_BANK_BULK_NEFT_CSV' } = params;
        // 1. Fetch Batch
        const batchRes = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
        if (batchRes.rows.length === 0) {
            throw new NotFoundError(`Payment batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
        }
        const batch = batchRes.rows[0];
        // Multi-tenant check
        if (auth.role !== 'SUPER_ADMIN' && auth.organizationId !== batch.organization_id) {
            throw new ForbiddenError('Cross-organization batch submission is prohibited', 'CROSS_ORG_ACCESS_DENIED');
        }
        // 2. Validate Status: Must be APPROVED
        if (batch.status !== 'APPROVED') {
            throw new BadRequestError(`Batch must be in APPROVED status before bank submission (current status: '${batch.status}')`, 'BATCH_NOT_APPROVED');
        }
        // 3. Maker-Checker Segregation of Duties Check
        if (!batch.approved_by) {
            throw new ForbiddenError('Maker-Checker violation: Batch has not been independently approved by an authorized checker.', 'BATCH_UNAPPROVED');
        }
        if (batch.created_by === batch.approved_by) {
            throw new ForbiddenError('Maker-Checker violation: Self-approved batch detected. Bank submission blocked.', 'SELF_APPROVAL_VIOLATION');
        }
        // 4. Fetch Items with Customer Bank Details
        const itemsRes = await query(`SELECT bi.id as item_id, bi.payout_id, bi.amount, bi.bank_ifsc, bi.beneficiary_reference,
              c.id as customer_id, c.farmer_code, c.full_name, c.bank_account_number,
              c.bank_verification_status, c.beneficiary_status
       FROM payment_batch_items bi
       JOIN customers c ON c.id = bi.customer_id
       WHERE bi.batch_id = $1
       ORDER BY c.farmer_code ASC;`, [batchId]);
        if (itemsRes.rows.length === 0) {
            throw new BadRequestError('Payment batch contains no items for submission', 'EMPTY_BATCH');
        }
        // Verify all beneficiaries before submission
        for (const item of itemsRes.rows) {
            if (item.beneficiary_status !== 'ACTIVE') {
                throw new BadRequestError(`Cannot submit batch: Farmer ${item.farmer_code} has non-active beneficiary status '${item.beneficiary_status}'`, 'BENEFICIARY_NOT_ACTIVE');
            }
            UnionBankValidator.validateAccountNumber(item.bank_account_number, `Farmer ${item.farmer_code}`);
            UnionBankValidator.validateIfsc(item.bank_ifsc, `Farmer ${item.farmer_code}`);
        }
        // Resolve Debit Account
        const debitAccount = params.debitAccountNumber ||
            process.env['UNION_BANK_DEBIT_ACCOUNT'] ||
            '00000000000000';
        const payload = {
            batchId: batch.id,
            batchNumber: batch.batch_number,
            organizationId: batch.organization_id,
            debitAccountNumber: debitAccount,
            valueDate: new Date().toISOString().slice(0, 10),
            items: itemsRes.rows.map((r) => ({
                itemId: r.item_id,
                payoutId: r.payout_id,
                farmerCode: r.farmer_code,
                customerName: r.full_name,
                bankAccount: r.bank_account_number,
                bankIfsc: r.bank_ifsc,
                amount: Number(r.amount),
                referenceNumber: r.beneficiary_reference || `REF-${batch.batch_number}-${r.farmer_code}`,
                narration: `Milk Payment ${batch.batch_number} - ${r.farmer_code}`,
            })),
        };
        // 5. Generate Bank Transmission File
        const generatedFile = UnionBankFileGenerator.generateFile(payload, fileFormat);
        const submissionId = crypto.randomUUID();
        const submissionRef = `UBI-SUB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        let bankAckRef = null;
        let bankResponsePayload = null;
        let initialStatus = 'SUBMITTED_TO_BANK';
        // 6. If Host-to-Host API submission requested
        if (submissionType === 'HOST_TO_HOST_API') {
            const apiResult = await this.apiClient.submitBatch(payload);
            bankAckRef = apiResult.acknowledgementNumber;
            bankResponsePayload = apiResult;
            initialStatus = 'PROCESSING';
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Create Bank Submission Record
            await client.query(`INSERT INTO bank_submissions (
          id, organization_id, batch_id, bank_name, submission_type, file_format,
          file_name, file_hash_sha256, file_checksum, total_records, total_amount, submission_reference,
          status, bank_acknowledgement_ref, bank_response_payload, submitted_by, submitted_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'Union Bank of India', $4, $5,
          $6, $7, $7, $8, $9, $10,
          $11, $12, $13, $14, NOW(), NOW(), NOW()
        );`, [
                submissionId,
                batch.organization_id,
                batchId,
                submissionType,
                fileFormat,
                generatedFile.fileName,
                generatedFile.checksumSha256,
                generatedFile.totalRecords,
                generatedFile.totalAmount,
                submissionRef,
                initialStatus,
                bankAckRef,
                bankResponsePayload ? JSON.stringify(bankResponsePayload) : null,
                auth.userId,
            ]);
            // Transition Batch Status
            await client.query(`UPDATE payment_batches
         SET status = $1, bank_submission_id = $2, bank_batch_reference = $3,
             bank_channel = $4, submitted_at = NOW(), updated_at = NOW()
         WHERE id = $5;`, [initialStatus, submissionId, submissionRef, fileFormat, batchId]);
            // Transition Batch Items Status
            await client.query(`UPDATE payment_batch_items
         SET status = $1, updated_at = NOW()
         WHERE batch_id = $2;`, [initialStatus, batchId]);
            // Transition Customer Payouts Status
            await client.query(`UPDATE customer_payouts
         SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE batch_id = $1;`, [batchId]);
            // Record in Payment Approvals / Submissions Audit
            await client.query(`INSERT INTO payment_approvals (
          organization_id, entity_type, entity_id, approver_id, action, comments
        ) VALUES ($1, 'BATCH', $2, $3, 'SUBMITTED', $4);`, [
                batch.organization_id,
                batchId,
                auth.userId,
                `Submitted to Union Bank of India via ${submissionType} (${fileFormat}). Ref: ${submissionRef}`,
            ]);
            await client.query('COMMIT');
            return {
                submissionId,
                submissionReference: submissionRef,
                batchId,
                batchNumber: batch.batch_number,
                status: initialStatus,
                submissionType,
                fileFormat,
                fileName: generatedFile.fileName,
                fileContent: generatedFile.content,
                fileHashSha256: generatedFile.checksumSha256,
                totalRecords: generatedFile.totalRecords,
                totalAmount: generatedFile.totalAmount,
                submittedAt: new Date().toISOString(),
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            if (err instanceof AppError)
                throw err;
            throw new AppError(err.message, 500, 'BANK_SUBMISSION_FAILED');
        }
        finally {
            client.release();
        }
    }
}
//# sourceMappingURL=UnionBankSubmissionService.js.map