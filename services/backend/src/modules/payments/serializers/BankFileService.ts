import crypto from 'node:crypto';
import { query } from '../../../config/db.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import { CredentialEncryption } from '../../../infrastructure/security/CredentialEncryption.js';
import { StandardNeftSerializer } from './StandardNeftSerializer.js';
import { SbiCmpBankAdapter } from './SbiCmpBankAdapter.js';
import { UnionBankBulkNeftSerializer, UnionBankCapsSerializer } from './UnionBankFileSerializer.js';
import type { IBankFileSerializer, PaymentBatchExportDetail, SerializedBankFile } from './IBankFileSerializer.js';

interface CachedExport {
  file: SerializedBankFile;
  batchId: string;
  token: string;
  expiresAt: number;
}

export class BankFileService {
  private static serializers: Map<string, IBankFileSerializer> = new Map<string, IBankFileSerializer>([
    ['NEFT_STANDARD', new StandardNeftSerializer()],
    ['NEFT', new StandardNeftSerializer()],
    ['SBI_CMP', new SbiCmpBankAdapter()],
    ['UNION_BANK_BULK_NEFT_CSV', new UnionBankBulkNeftSerializer()],
    ['UNION_BANK', new UnionBankBulkNeftSerializer()],
    ['UBI_NEFT', new UnionBankBulkNeftSerializer()],
    ['UBI', new UnionBankBulkNeftSerializer()],
    ['UNION_BANK_CAPS_TXT', new UnionBankCapsSerializer()],
    ['UBI_CAPS', new UnionBankCapsSerializer()],
    ['CAPS', new UnionBankCapsSerializer()],
  ]);

  // In-memory cache for generated export files mapped by download token (15-minute TTL)
  private static exportCache: Map<string, CachedExport> = new Map();

  public static async exportBatch(
    batchId: string,
    format: string,
    auth: AuthContext
  ): Promise<{
    batchId: string;
    batchNumber: string;
    format: string;
    fileName: string;
    rowCount: number;
    totalAmount: number;
    checksumSha256: string;
    downloadToken: string;
    expiresInSeconds: number;
  }> {
    const normFormat = (format || 'UNION_BANK_BULK_NEFT_CSV').toUpperCase().trim();
    const serializer = this.serializers.get(normFormat);

    if (!serializer) {
      throw new BadRequestError(
        `Unsupported bank file format '${format}'. Supported formats: UNION_BANK_BULK_NEFT_CSV, UNION_BANK_CAPS_TXT, NEFT_STANDARD, SBI_CMP`,
        'UNSUPPORTED_BANK_FORMAT'
      );
    }

    // 1. Fetch Payment Batch
    const batchRes = await query('SELECT * FROM payment_batches WHERE id = $1;', [batchId]);
    if (batchRes.rows.length === 0) {
      throw new NotFoundError(`Payment batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
    }
    const batch = batchRes.rows[0];

    // Multi-Tenant Scoping: Cross-Dairy export strictly forbidden
    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId !== batch.organization_id) {
      throw new ForbiddenError(
        'Cross-organization bank export is strictly prohibited',
        'CROSS_ORG_ACCESS_DENIED'
      );
    }

    // 2. Validate Batch Status
    if (!['APPROVED', 'SUBMITTED'].includes(batch.status)) {
      throw new BadRequestError(
        `Batch must be in APPROVED or SUBMITTED status before bank file export (current status: '${batch.status}')`,
        'BATCH_NOT_APPROVED_FOR_EXPORT'
      );
    }

    // 3. Enforce Maker–Checker Verification
    if (!batch.approved_by) {
      throw new ForbiddenError(
        'Maker-Checker violation: Batch has not been independently approved by an authorized checker.',
        'BATCH_UNAPPROVED'
      );
    }
    if (batch.created_by === batch.approved_by) {
      throw new ForbiddenError(
        'Maker-Checker violation: Self-approved batch detected. Export blocked.',
        'SELF_APPROVAL_VIOLATION'
      );
    }

    // 4. Fetch Batch Items with Customer Bank Details
    const itemsRes = await query(
      `SELECT bi.id as item_id, bi.payout_id, bi.amount, bi.bank_ifsc, bi.beneficiary_reference,
              c.farmer_code, c.full_name, c.bank_account_number
       FROM payment_batch_items bi
       JOIN customers c ON c.id = bi.customer_id
       WHERE bi.batch_id = $1
       ORDER BY bi.created_at ASC;`,
      [batchId]
    );

    if (itemsRes.rows.length === 0) {
      throw new BadRequestError('Payment batch has no items to export', 'EMPTY_BATCH');
    }

    // 5. Decrypt Bank Accounts Server-Side Under Strict Scope
    const exportItems = itemsRes.rows.map((row: any) => {
      let plainAccount = row.bank_account_number || '';
      if (plainAccount.includes(':')) {
        try {
          plainAccount = CredentialEncryption.decrypt(plainAccount);
        } catch {
          // If not AES ciphertext, use raw
        }
      }

      return {
        payoutId: row.payout_id,
        itemId: row.item_id,
        farmerCode: row.farmer_code,
        customerName: row.full_name,
        bankAccount: plainAccount,
        bankIfsc: row.bank_ifsc,
        amount: Number(row.amount),
        referenceNumber: row.beneficiary_reference || `REF-${batch.batch_number}-${row.farmer_code}`,
        narration: `Milk Settl ${batch.batch_number}`,
      };
    });

    const exportDetail: PaymentBatchExportDetail = {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      organizationId: batch.organization_id,
      totalBeneficiaries: batch.total_beneficiaries,
      totalAmount: Number(batch.total_amount),
      approvedBy: batch.approved_by,
      approvedAt: batch.approved_at,
      items: exportItems,
    };

    // 6. Serialize Bank File
    const serialized = await serializer.serialize(exportDetail);

    // 7. Generate Ephemeral Download Token (15 min validity)
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000;

    this.exportCache.set(downloadToken, {
      file: serialized,
      batchId,
      token: downloadToken,
      expiresAt,
    });

    // 8. Update Batch Status to SUBMITTED if currently APPROVED
    if (batch.status === 'APPROVED') {
      await query(
        `UPDATE payment_batches
         SET status = 'SUBMITTED', updated_at = NOW()
         WHERE id = $1;`,
        [batchId]
      );
    }

    // 9. Audit Log
    try {
      await query(
        `INSERT INTO audit_logs (
          organization_id, user_id, action, entity_type, entity_id, new_values
        ) VALUES ($1, $2, 'PAYMENT_BATCH_EXPORTED', 'PAYMENT_BATCH', $3, $4);`,
        [
          batch.organization_id,
          auth.userId,
          batchId,
          JSON.stringify({
            format: normFormat,
            fileName: serialized.fileName,
            rowCount: serialized.rowCount,
            totalAmount: serialized.totalAmount,
            checksumSha256: serialized.checksumSha256,
          }),
        ]
      );
    } catch {}

    return {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      format: normFormat,
      fileName: serialized.fileName,
      rowCount: serialized.rowCount,
      totalAmount: serialized.totalAmount,
      checksumSha256: serialized.checksumSha256,
      downloadToken,
      expiresInSeconds: 900,
    };
  }

  public static getExportByToken(token: string): SerializedBankFile {
    const cached = this.exportCache.get(token);
    if (!cached) {
      throw new NotFoundError('Download token is invalid or has expired', 'INVALID_DOWNLOAD_TOKEN');
    }

    if (Date.now() > cached.expiresAt) {
      this.exportCache.delete(token);
      throw new BadRequestError('Download token has expired. Please re-export the batch.', 'EXPIRED_DOWNLOAD_TOKEN');
    }

    return cached.file;
  }
}
