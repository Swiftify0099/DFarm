// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: FILE GENERATOR (PROMPT 7)
// ==============================================================================
import crypto from 'node:crypto';
import { BadRequestError } from '../../../shared/errors/app-error.js';
import { UnionBankValidator } from './UnionBankValidator.js';
export class UnionBankFileGenerator {
    /**
     * Generates bank-approved bulk payout files for Union Bank of India.
     * Supports:
     * 1. UNION_BANK_BULK_NEFT_CSV - Corporate Internet Banking Bulk Upload Format
     * 2. UNION_BANK_CAPS_TXT - Union Bank Cash Management Services (CAPS) Pipe-Delimited
     */
    static generateFile(payload, format = 'UNION_BANK_BULK_NEFT_CSV') {
        if (!payload.items || payload.items.length === 0) {
            throw new BadRequestError('Cannot generate bank file for an empty payout batch', 'EMPTY_BATCH_ITEMS');
        }
        const debitAccount = UnionBankValidator.validateAccountNumber(payload.debitAccountNumber, 'Dairy Union Bank Debit Account');
        if (format === 'UNION_BANK_CAPS_TXT') {
            return this.generateCapsFormat(payload, debitAccount);
        }
        return this.generateBulkNeftCsvFormat(payload, debitAccount);
    }
    static generateBulkNeftCsv(payload) {
        return this.generateFile(payload, 'UNION_BANK_BULK_NEFT_CSV');
    }
    static generateCapsFile(payload) {
        return this.generateFile(payload, 'UNION_BANK_CAPS_TXT');
    }
    /**
     * Generates Union Bank Corporate Bulk NEFT/RTGS CSV file.
     * Header:
     * Transaction Type,Debit Account Number,Beneficiary Account Number,Beneficiary Name,Beneficiary IFSC,Amount,Customer Reference,Narration,Value Date
     */
    static generateBulkNeftCsvFormat(payload, debitAccount) {
        const headers = [
            'Transaction Type',
            'Debit Account Number',
            'Beneficiary Account Number',
            'Beneficiary Name',
            'Beneficiary IFSC',
            'Amount',
            'Customer Reference',
            'Narration',
            'Value Date',
        ];
        const lines = [headers.join(',')];
        let runningTotal = 0;
        for (const item of payload.items) {
            const validated = UnionBankValidator.validatePayoutItem(item);
            runningTotal += validated.cleanAmount;
            const safeName = UnionBankValidator.sanitizeCsvField(validated.cleanName);
            const quotedName = safeName.includes(',') ? `"${safeName}"` : safeName;
            const defaultNarration = `Milk Payment ${payload.batchNumber} - ${item.farmerCode}`;
            const safeNarration = UnionBankValidator.sanitizeCsvField(item.narration || defaultNarration);
            const quotedNarration = safeNarration.includes(',') ? `"${safeNarration}"` : safeNarration;
            const safeRef = UnionBankValidator.sanitizeCsvField(validated.cleanRef);
            const quotedRef = safeRef.includes(',') ? `"${safeRef}"` : safeRef;
            const row = [
                validated.txnType,
                debitAccount,
                validated.cleanAccount,
                quotedName,
                validated.cleanIfsc,
                validated.cleanAmount.toFixed(2),
                quotedRef,
                quotedNarration,
                payload.valueDate || new Date().toISOString().slice(0, 10),
            ].join(',');
            lines.push(row);
        }
        const content = lines.join('\r\n') + '\r\n';
        const checksumSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
        const safeBatchNum = payload.batchNumber.replace(/[^A-Za-z0-9_-]/g, '_');
        const fileName = `UBI_PAYOUT_${safeBatchNum}_${Date.now()}.csv`;
        return {
            format: 'UNION_BANK_BULK_NEFT_CSV',
            fileName,
            mimeType: 'text/csv; charset=utf-8',
            content,
            totalRecords: payload.items.length,
            totalAmount: Math.round((runningTotal + Number.EPSILON) * 100) / 100,
            checksumSha256,
        };
    }
    /**
     * Generates Union Bank CAPS (Cash Management Services) pipe-delimited upload format.
     * Format:
     * PAYMENT_TYPE|DEBIT_ACCOUNT|BENEFICIARY_ACCOUNT|BENEFICIARY_NAME|IFSC|AMOUNT|PAYMENT_REF|REMARKS|VALUE_DATE
     */
    static generateCapsFormat(payload, debitAccount) {
        const lines = [];
        let runningTotal = 0;
        for (const item of payload.items) {
            const validated = UnionBankValidator.validatePayoutItem(item);
            runningTotal += validated.cleanAmount;
            const cleanRemarks = (item.narration || `MILK PAY ${payload.batchNumber}`)
                .replace(/[|]/g, ' ')
                .trim()
                .slice(0, 50);
            const row = [
                validated.txnType,
                debitAccount,
                validated.cleanAccount,
                validated.cleanName.replace(/[|]/g, ' '),
                validated.cleanIfsc,
                validated.cleanAmount.toFixed(2),
                validated.cleanRef,
                cleanRemarks,
                (payload.valueDate || new Date().toISOString().slice(0, 10)).replace(/-/g, ''),
            ].join('|');
            lines.push(row);
        }
        const content = lines.join('\r\n') + '\r\n';
        const checksumSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
        const safeBatchNum = payload.batchNumber.replace(/[^A-Za-z0-9_-]/g, '_');
        const fileName = `UBI_CAPS_${safeBatchNum}_${Date.now()}.txt`;
        return {
            format: 'UNION_BANK_CAPS_TXT',
            fileName,
            mimeType: 'text/plain; charset=utf-8',
            content,
            totalRecords: payload.items.length,
            totalAmount: Math.round((runningTotal + Number.EPSILON) * 100) / 100,
            checksumSha256,
        };
    }
}
//# sourceMappingURL=UnionBankFileGenerator.js.map