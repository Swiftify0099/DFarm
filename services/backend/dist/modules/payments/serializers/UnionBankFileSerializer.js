// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA BULK FILE SERIALIZERS (PROMPT 7)
// ==============================================================================
import { UnionBankFileGenerator } from '../../../integrations/banking/union-bank/UnionBankFileGenerator.js';
import { UnionBankValidator } from '../../../integrations/banking/union-bank/UnionBankValidator.js';
import { BadRequestError } from '../../../shared/errors/app-error.js';
function resolveValidatedDebitAccount(batch) {
    const raw = (batch.debitAccountNumber || '').trim();
    if (!raw) {
        throw new BadRequestError('Authorized dairy Union Bank debit account is not configured. Bank export rejected.', 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED');
    }
    return UnionBankValidator.validateAccountNumber(raw, 'Dairy Union Bank Debit Account');
}
export class UnionBankBulkNeftSerializer {
    formatIdentifier = 'UNION_BANK_BULK_NEFT_CSV';
    async serialize(batch) {
        const debitAccountNumber = resolveValidatedDebitAccount(batch);
        const payload = {
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            organizationId: batch.organizationId,
            organizationName: batch.organizationName,
            debitAccountNumber,
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
export class UnionBankCapsSerializer {
    formatIdentifier = 'UNION_BANK_CAPS_TXT';
    async serialize(batch) {
        const debitAccountNumber = resolveValidatedDebitAccount(batch);
        const payload = {
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            organizationId: batch.organizationId,
            organizationName: batch.organizationName,
            debitAccountNumber,
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
//# sourceMappingURL=UnionBankFileSerializer.js.map