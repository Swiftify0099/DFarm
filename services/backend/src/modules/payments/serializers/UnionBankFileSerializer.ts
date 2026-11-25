// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA BULK FILE SERIALIZERS (PROMPT 7)
// ==============================================================================

import type { IBankFileSerializer, PaymentBatchExportDetail, SerializedBankFile } from './IBankFileSerializer.js';
import { UnionBankFileGenerator } from '../../../integrations/banking/union-bank/UnionBankFileGenerator.js';
import type { UnionBankBatchPayload } from '../../../integrations/banking/union-bank/types.js';

export class UnionBankBulkNeftSerializer implements IBankFileSerializer {
  public readonly formatIdentifier = 'UNION_BANK_BULK_NEFT_CSV';

  public async serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile> {
    const payload: UnionBankBatchPayload = {
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      organizationId: batch.organizationId,
      organizationName: batch.organizationName,
      debitAccountNumber: batch.debitAccountNumber || process.env['UNION_BANK_DEBIT_ACCOUNT'] || '00000000000000',
      valueDate: new Date().toISOString().slice(0, 10),
      items: (batch.items || []).map(i => ({
        itemId: i.itemId,
        payoutId: i.payoutId,
        farmerCode: i.farmerCode,
        customerName: i.customerName,
        bankAccount: i.bankAccount,
        bankIfsc: i.bankIfsc,
        amount: Number(i.amount),
        referenceNumber: i.referenceNumber,
        narration: i.narration || `Milk Settlement ${batch.batchNumber}`,
      })),
    };

    const gen = UnionBankFileGenerator.generateFile(payload, 'UNION_BANK_BULK_NEFT_CSV');
    return {
      formatIdentifier: this.formatIdentifier,
      fileName: gen.fileName,
      mimeType: gen.mimeType,
      content: gen.content,
      rowCount: gen.totalRecords,
      totalAmount: gen.totalAmount,
      checksumSha256: gen.checksumSha256,
    };
  }
}

export class UnionBankCapsSerializer implements IBankFileSerializer {
  public readonly formatIdentifier = 'UNION_BANK_CAPS_TXT';

  public async serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile> {
    const payload: UnionBankBatchPayload = {
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      organizationId: batch.organizationId,
      organizationName: batch.organizationName,
      debitAccountNumber: batch.debitAccountNumber || process.env['UNION_BANK_DEBIT_ACCOUNT'] || '00000000000000',
      valueDate: new Date().toISOString().slice(0, 10),
      items: (batch.items || []).map(i => ({
        itemId: i.itemId,
        payoutId: i.payoutId,
        farmerCode: i.farmerCode,
        customerName: i.customerName,
        bankAccount: i.bankAccount,
        bankIfsc: i.bankIfsc,
        amount: Number(i.amount),
        referenceNumber: i.referenceNumber,
        narration: i.narration || `Milk Settlement ${batch.batchNumber}`,
      })),
    };

    const gen = UnionBankFileGenerator.generateFile(payload, 'UNION_BANK_CAPS_TXT');
    return {
      formatIdentifier: this.formatIdentifier,
      fileName: gen.fileName,
      mimeType: gen.mimeType,
      content: gen.content,
      rowCount: gen.totalRecords,
      totalAmount: gen.totalAmount,
      checksumSha256: gen.checksumSha256,
    };
  }
}
