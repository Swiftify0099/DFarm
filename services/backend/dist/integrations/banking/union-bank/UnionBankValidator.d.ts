import type { UnionBankPayoutItem } from './types.js';
export declare class UnionBankValidator {
    private static readonly IFSC_REGEX;
    private static readonly ACCOUNT_REGEX;
    static isValidIfsc(ifsc: string): boolean;
    static isValidAccountNumber(account: string): boolean;
    /**
     * Validates IFSC format. Returns normalized uppercase IFSC.
     */
    static validateIfsc(ifsc: string, contextName?: string): string;
    /**
     * Validates Indian bank account number (9 to 18 numeric digits).
     */
    static validateAccountNumber(account: string, contextName?: string): string;
    /**
     * Validates payment amount (strictly positive, up to 2 decimal places, under max single transaction limit).
     */
    static validateAmount(amount: number | string, maxLimit?: number): number;
    /**
     * Sanitizes string to prevent CSV and Excel Formula Injection attacks (=, +, -, @, \t, \r).
     */
    static sanitizeCsvField(value: string | undefined | null): string;
    /**
     * Validates an entire payout item before bank transmission.
     */
    static validatePayoutItem(item: UnionBankPayoutItem): {
        cleanAccount: string;
        cleanIfsc: string;
        cleanAmount: number;
        cleanName: string;
        cleanRef: string;
        txnType: 'NEFT' | 'RTGS' | 'IFT';
    };
}
//# sourceMappingURL=UnionBankValidator.d.ts.map