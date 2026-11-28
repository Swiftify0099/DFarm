import crypto from 'node:crypto';
import { BadRequestError } from '../../../shared/errors/app-error.js';
import { UnionBankValidator } from '../../../integrations/banking/union-bank/UnionBankValidator.js';
export class StandardNeftSerializer {
    formatIdentifier = 'NEFT_STANDARD';
    async serialize(batch) {
        if (!batch.items || batch.items.length === 0) {
            throw new BadRequestError('Cannot export an empty payout batch', 'EMPTY_BATCH_EXPORT');
        }
        const rawDebitAccount = (batch.debitAccountNumber || '').trim();
        if (!rawDebitAccount) {
            throw new BadRequestError('Authorized dairy debit account is not configured. Bank file export rejected.', 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED');
        }
        const debitAccount = UnionBankValidator.validateAccountNumber(rawDebitAccount, 'Dairy Debit Account');
        const headers = [
            'Transaction Type',
            'Beneficiary Name',
            'Beneficiary Account Number',
            'Beneficiary IFSC',
            'Amount',
            'Customer Reference',
            'Debit Account Number',
            'Narration',
        ];
        const lines = [headers.join(',')];
        let runningTotal = 0.00;
        for (const item of batch.items) {
            // 1. Validate IFSC Format
            const cleanIfsc = (item.bankIfsc || '').trim().toUpperCase();
            if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
                throw new BadRequestError(`Invalid IFSC Code '${item.bankIfsc}' for beneficiary '${item.customerName}' (Farmer Code: ${item.farmerCode})`, 'INVALID_IFSC_CODE');
            }
            // 2. Validate Amount
            const numAmount = Math.round((Number(item.amount) + Number.EPSILON) * 100) / 100;
            if (isNaN(numAmount) || numAmount <= 0.00) {
                throw new BadRequestError(`Invalid payout amount '${item.amount}' for farmer ${item.farmerCode}`, 'INVALID_PAYOUT_AMOUNT');
            }
            runningTotal += numAmount;
            // 3. Clean and Escape Text Fields
            const cleanName = (item.customerName || 'Farmer').replace(/"/g, '""').trim();
            const escapedName = cleanName.includes(',') ? `"${cleanName}"` : cleanName;
            const cleanAccount = (item.bankAccount || '').replace(/[^0-9]/g, '');
            if (cleanAccount.length < 6) {
                throw new BadRequestError(`Invalid or missing bank account number for farmer ${item.farmerCode}`, 'INVALID_ACCOUNT_NUMBER');
            }
            const txnType = numAmount >= 200000.00 ? 'RTGS' : 'NEFT';
            const cleanRef = item.referenceNumber.replace(/,/g, '-');
            const narration = (item.narration || `Milk Settlement ${batch.batchNumber}`).replace(/"/g, '""');
            const escapedNarration = narration.includes(',') ? `"${narration}"` : narration;
            lines.push([
                txnType,
                escapedName,
                cleanAccount,
                cleanIfsc,
                numAmount.toFixed(2),
                cleanRef,
                debitAccount,
                escapedNarration,
            ].join(','));
        }
        const content = lines.join('\r\n') + '\r\n';
        const checksumSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
        const fileName = `NEFT_${batch.batchNumber.replace(/[^A-Za-z0-9_-]/g, '_')}_${Date.now()}.csv`;
        return {
            formatIdentifier: this.formatIdentifier,
            fileName,
            mimeType: 'text/csv; charset=utf-8',
            content,
            rowCount: batch.items.length,
            totalAmount: Math.round((runningTotal + Number.EPSILON) * 100) / 100,
            checksumSha256,
        };
    }
}
//# sourceMappingURL=StandardNeftSerializer.js.map