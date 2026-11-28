// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: VALIDATOR (PROMPT 7)
// ==============================================================================

import { BadRequestError } from '../../../shared/errors/app-error.js';
import type { UnionBankPayoutItem } from './types.js';
import { maskAccountNumber } from '../../../modules/payments/tenant-payment-context.js';

export class UnionBankValidator {
  private static readonly IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  private static readonly ACCOUNT_REGEX = /^[0-9]{9,18}$/;
  private static readonly ALL_ZERO_REGEX = /^0+$/;

  public static isValidIfsc(ifsc: string): boolean {
    return this.IFSC_REGEX.test((ifsc || '').trim().toUpperCase());
  }

  public static isValidAccountNumber(account: string): boolean {
    const raw = (account || '').trim();
    if (!raw || raw.includes(':') || /[^0-9\s-]/.test(raw)) {
      return false;
    }
    const clean = raw.replace(/[^0-9]/g, '');
    return this.ACCOUNT_REGEX.test(clean) && !this.ALL_ZERO_REGEX.test(clean);
  }

  /**
   * Validates IFSC format. Returns normalized uppercase IFSC.
   */
  public static validateIfsc(ifsc: string, contextName?: string): string {
    const clean = (ifsc || '').trim().toUpperCase();
    if (!this.IFSC_REGEX.test(clean)) {
      throw new BadRequestError(
        `Invalid IFSC code '${ifsc}'${contextName ? ` for ${contextName}` : ''}. Must be 11 characters (4 letters, '0', 6 alphanumeric characters).`,
        'INVALID_IFSC_CODE'
      );
    }
    return clean;
  }

  /**
   * Validates Indian bank account number (9 to 18 numeric digits, never all-zero).
   * Account digits are masked in any thrown error message.
   */
  public static validateAccountNumber(account: string, contextName?: string): string {
    const raw = (account || '').trim();
    if (raw.includes(':') || /[^0-9\s-]/.test(raw)) {
      throw new BadRequestError(
        `Invalid bank account number (${maskAccountNumber(raw)})${contextName ? ` for ${contextName}` : ''}. Must contain 9 to 18 numeric digits.`,
        'INVALID_BANK_ACCOUNT'
      );
    }
    const clean = raw.replace(/[^0-9]/g, '');
    if (!clean) {
      throw new BadRequestError(
        `Bank account number is not configured${contextName ? ` for ${contextName}` : ''}.`,
        contextName?.toLowerCase().includes('debit') ? 'DAIRY_DEBIT_ACCOUNT_NOT_CONFIGURED' : 'INVALID_BANK_ACCOUNT'
      );
    }
    if (this.ALL_ZERO_REGEX.test(clean)) {
      throw new BadRequestError(
        `Invalid all-zero bank account number${contextName ? ` for ${contextName}` : ''}. Placeholder accounts are strictly prohibited.`,
        'INVALID_BANK_ACCOUNT'
      );
    }
    if (!this.ACCOUNT_REGEX.test(clean)) {
      throw new BadRequestError(
        `Invalid bank account number (${maskAccountNumber(account)})${contextName ? ` for ${contextName}` : ''}. Must contain between 9 and 18 numeric digits.`,
        'INVALID_BANK_ACCOUNT'
      );
    }
    return clean;
  }

  /**
   * Validates payment amount (strictly positive, up to 2 decimal places, under max single transaction limit).
   */
  public static validateAmount(amount: number | string, maxLimit = 10000000.00): number {
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
  public static sanitizeCsvField(value: string | undefined | null): string {
    if (!value) return '';
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
  public static validatePayoutItem(item: UnionBankPayoutItem): {
    cleanAccount: string;
    cleanIfsc: string;
    cleanAmount: number;
    cleanName: string;
    cleanRef: string;
    txnType: 'NEFT' | 'RTGS' | 'IFT';
  } {
    const rawAccount = (item as any).bankAccount || (item as any).accountNumber;
    const rawIfsc = (item as any).bankIfsc || (item as any).ifscCode;
    const rawName = (item as any).customerName || (item as any).beneficiaryName || 'Farmer';
    const rawRef = (item as any).referenceNumber || (item as any).reference || (item as any).farmerCode || item.itemId;

    const cleanAccount = this.validateAccountNumber(rawAccount, `Farmer ${item.farmerCode || ''}`);
    const cleanIfsc = this.validateIfsc(rawIfsc, `Farmer ${item.farmerCode || ''}`);
    const cleanAmount = this.validateAmount(item.amount);

    const cleanName = this.sanitizeCsvField(String(rawName || 'Farmer').trim().slice(0, 70));
    const cleanRef = this.sanitizeCsvField(String(rawRef || item.itemId || '').trim().slice(0, 35));

    // Intra-bank transfer if beneficiary IFSC is Union Bank (UBIN)
    let txnType: 'NEFT' | 'RTGS' | 'IFT' = 'NEFT';
    if (cleanIfsc.startsWith('UBIN')) {
      txnType = 'IFT'; // Intra-bank Fund Transfer
    } else if (cleanAmount >= 200000.00) {
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
