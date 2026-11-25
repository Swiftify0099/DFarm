// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: VALIDATOR (PROMPT 7)
// ==============================================================================
import { BadRequestError } from '../../../shared/errors/app-error.js';
export class UnionBankValidator {
    static IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    static ACCOUNT_REGEX = /^[0-9]{9,18}$/;
    static isValidIfsc(ifsc) {
        return this.IFSC_REGEX.test((ifsc || '').trim().toUpperCase());
    }
    static isValidAccountNumber(account) {
        return this.ACCOUNT_REGEX.test((account || '').trim().replace(/[^0-9]/g, ''));
    }
    /**
     * Validates IFSC format. Returns normalized uppercase IFSC.
     */
    static validateIfsc(ifsc, contextName) {
        const clean = (ifsc || '').trim().toUpperCase();
        if (!this.IFSC_REGEX.test(clean)) {
            throw new BadRequestError(`Invalid IFSC code '${ifsc}'${contextName ? ` for ${contextName}` : ''}. Must be 11 characters (4 letters, '0', 6 alphanumeric characters).`, 'INVALID_IFSC_CODE');
        }
        return clean;
    }
    /**
     * Validates Indian bank account number (9 to 18 numeric digits).
     */
    static validateAccountNumber(account, contextName) {
        const clean = (account || '').trim().replace(/[^0-9]/g, '');
        if (!this.ACCOUNT_REGEX.test(clean)) {
            throw new BadRequestError(`Invalid bank account number '${account}'${contextName ? ` for ${contextName}` : ''}. Must contain between 9 and 18 numeric digits.`, 'INVALID_BANK_ACCOUNT');
        }
        return clean;
    }
    /**
     * Validates payment amount (strictly positive, up to 2 decimal places, under max single transaction limit).
     */
    static validateAmount(amount, maxLimit = 10000000.00) {
        const num = Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
        if (isNaN(num) || num <= 0.00) {
            throw new BadRequestError(`Invalid payment amount '${amount}'. Must be greater than 0.00`, 'INVALID_PAYOUT_AMOUNT');
        }
        if (num > maxLimit) {
            throw new BadRequestError(`Payment amount ₹${num} exceeds maximum permitted limit of ₹${maxLimit}`, 'AMOUNT_EXCEEDS_LIMIT');
        }
        return num;
    }
    /**
     * Sanitizes string to prevent CSV and Excel Formula Injection attacks (=, +, -, @, \t, \r).
     */
    static sanitizeCsvField(value) {
        if (!value)
            return '';
        let sanitized = String(value).trim().replace(/"/g, '""');
        // If field starts with formula trigger characters, prepend with single quote
        if (/^[=+\-@\t\r]/.test(sanitized)) {
            sanitized = `'${sanitized}`;
        }
        return sanitized;
    }
    /**
     * Validates an entire payout item before bank transmission.
     */
    static validatePayoutItem(item) {
        const rawAccount = item.bankAccount || item.accountNumber;
        const rawIfsc = item.bankIfsc || item.ifscCode;
        const rawName = item.customerName || item.beneficiaryName || 'Farmer';
        const rawRef = item.referenceNumber || item.reference || item.farmerCode || item.itemId;
        const cleanAccount = this.validateAccountNumber(rawAccount, `Farmer ${item.farmerCode || ''}`);
        const cleanIfsc = this.validateIfsc(rawIfsc, `Farmer ${item.farmerCode || ''}`);
        const cleanAmount = this.validateAmount(item.amount);
        const cleanName = this.sanitizeCsvField(String(rawName || 'Farmer').trim().slice(0, 70));
        const cleanRef = this.sanitizeCsvField(String(rawRef || item.itemId || '').trim().slice(0, 35));
        // Intra-bank transfer if beneficiary IFSC is Union Bank (UBIN)
        let txnType = 'NEFT';
        if (cleanIfsc.startsWith('UBIN')) {
            txnType = 'IFT'; // Intra-bank Fund Transfer
        }
        else if (cleanAmount >= 200000.00) {
            txnType = 'RTGS';
        }
        return {
            cleanAccount,
            cleanIfsc,
            cleanAmount,
            cleanName,
            cleanRef,
            txnType,
        };
    }
}
//# sourceMappingURL=UnionBankValidator.js.map