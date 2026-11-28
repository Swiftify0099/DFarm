export declare const ENCRYPTED_BANK_ACCOUNT_ENVELOPE_REGEX: RegExp;
export declare const LEGACY_PLAINTEXT_ACCOUNT_REGEX: RegExp;
export declare const ALL_ZERO_ACCOUNT_REGEX: RegExp;
export type BeneficiaryBankAccountSource = 'ENCRYPTED' | 'LEGACY_PLAINTEXT';
export interface EncryptedBeneficiaryBankAccountWrite {
    cleanAccount: string;
    encryptedAccount: string;
    mask: string;
}
export interface DecryptedBeneficiaryBankAccount {
    accountNumber: string;
    source: BeneficiaryBankAccountSource;
    mask: string;
}
export interface BeneficiaryAccountValidationOutcome {
    isValid: boolean;
    accountNumber: string | null;
    source: BeneficiaryBankAccountSource | null;
    mask: string | null;
    errors: string[];
    hasMalformedCiphertext: boolean;
    isLegacyPlaintext: boolean;
}
export interface LegacyPlaintextTracker {
    readonly operation: string;
    readonly detectedCount: number;
    record(): void;
    flushSummary(organizationId?: string | null): number;
}
/**
 * Returns total legacy plaintext beneficiary account reads detected in-process.
 */
export declare function getLegacyPlaintextDetectionCount(): number;
/**
 * Resets the in-process legacy plaintext detection counter (intended for tests).
 */
export declare function resetLegacyPlaintextDetectionCount(): void;
/**
 * Tracks legacy unencrypted bank account detections within an operation without
 * ever emitting raw account numbers into logs or error payloads.
 */
export declare function createLegacyPlaintextTracker(operation: string): LegacyPlaintextTracker;
/**
 * Returns true if the string matches the AES-256-GCM envelope `iv:authTag:ciphertext`.
 */
export declare function isEncryptedBankAccountEnvelope(value: string | null | undefined): boolean;
/**
 * Returns true if a stored string carries an encrypted envelope delimiter (`:`).
 * Valid Indian bank account numbers never contain colons, so any colon-bearing
 * value must be processed strictly as encrypted (never as legacy plaintext).
 */
export declare function hasEncryptedEnvelopeMarker(value: string | null | undefined): boolean;
/**
 * Returns true strictly for recognizable legacy plaintext numeric accounts
 * (9-18 ASCII numeric digits, non-all-zero, no letters/symbols/colons).
 */
export declare function isValidLegacyPlaintextAccount(value: string | null | undefined): boolean;
/**
 * Sanitizes an existing mask string so neither AES ciphertext nor raw 9-18 digit
 * account numbers can leak as a "mask".
 */
export declare function normalizeSafeBankAccountMask(storedMask: string | null | undefined): string | null;
/**
 * Validates and encrypts a new beneficiary bank account number for persistence.
 * Fails closed if validation or AES-256-GCM encryption fails (zero plaintext fallback).
 */
export declare function encryptBeneficiaryBankAccount(rawAccount: string | null | undefined, contextName?: string): EncryptedBeneficiaryBankAccountWrite;
/**
 * Decrypts and validates a stored bank account (encrypted envelope or strict legacy numeric).
 * Fails closed on corrupted ciphertext, auth-tag failures, wrong key, or ambiguous plaintext.
 */
export declare function decryptStoredBankAccountFailClosed(storedValue: string | null | undefined, options?: {
    contextName?: string;
    tracker?: LegacyPlaintextTracker;
    allowLegacyPlaintext?: boolean;
    notConfiguredCode?: string;
}): DecryptedBeneficiaryBankAccount;
/**
 * Validates beneficiary bank account data non-destructively for settlement preview.
 * Never derives a mask from AES ciphertext and never exposes plaintext/ciphertext.
 */
export declare function validateBeneficiaryBankAccountForSettlement(storedAccount: string | null | undefined, options?: {
    storedMask?: string | null;
    contextName?: string;
    tracker?: LegacyPlaintextTracker;
}): BeneficiaryAccountValidationOutcome;
/**
 * Resolves a safe display mask (`XXXX-XXXX-NNNN`) preferring persisted customer/batch masks
 * and never slicing AES ciphertext tails.
 */
export declare function resolveBeneficiaryBankMask(params: {
    storedMask?: string | null;
    storedAccount?: string | null;
    allowDecryptFallback?: boolean;
    tracker?: LegacyPlaintextTracker;
}): string | null;
//# sourceMappingURL=beneficiary-bank-account.d.ts.map