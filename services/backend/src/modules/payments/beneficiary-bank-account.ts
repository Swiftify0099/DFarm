// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// SHARED BENEFICIARY BANK ACCOUNT ENCRYPTION, DECRYPTION & MASK HELPERS
// (RESTART-10.4 / DF-022 / DF-024)
// ==============================================================================
//
// Security & Compatibility Policy:
//   1. New Writes:
//      - Always validate 9-18 numeric digits (never all-zero, never ciphertext-like).
//      - Always encrypt via CredentialEncryption.encrypt() (AES-256-GCM).
//      - Fail closed if encryption fails or produces an unexpected envelope.
//      - NEVER fall back to plaintext storage for new writes.
//
//   2. Encrypted Reads (`iv:authTag:ciphertext`):
//      - Strictly verify 12-byte IV (24 hex chars), 16-byte tag (32 hex chars),
//        and byte-aligned hex ciphertext before calling CredentialEncryption.decrypt().
//      - Throw a controlled AppError/BadRequestError on malformed/tampered ciphertext.
//      - NEVER catch decryption errors and return ciphertext as a bank account.
//
//   3. Legacy Plaintext Compatibility:
//      - Historical pre-encryption records are accepted for reads ONLY when the
//        trimmed stored value is strictly 9-18 ASCII numeric digits and not all-zero.
//      - Ambiguous, non-numeric, or colon-containing strings are rejected fail-closed.
//      - Counts legacy plaintext records via structured metrics/logs WITHOUT ever
//        logging raw account numbers or unmasked fragments.
//
// ==============================================================================

import { AppError, BadRequestError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import { CredentialEncryption } from '../../infrastructure/security/CredentialEncryption.js';
import { UnionBankValidator } from '../../integrations/banking/union-bank/UnionBankValidator.js';
import { maskAccountNumber } from './tenant-payment-context.js';

export const ENCRYPTED_BANK_ACCOUNT_ENVELOPE_REGEX =
  /^[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:(?:[0-9a-fA-F]{2})+$/;
export const LEGACY_PLAINTEXT_ACCOUNT_REGEX = /^[0-9]{9,18}$/;
export const ALL_ZERO_ACCOUNT_REGEX = /^0+$/;

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

let totalLegacyPlaintextDetected = 0;

/**
 * Returns total legacy plaintext beneficiary account reads detected in-process.
 */
export function getLegacyPlaintextDetectionCount(): number {
  return totalLegacyPlaintextDetected;
}

/**
 * Resets the in-process legacy plaintext detection counter (intended for tests).
 */
export function resetLegacyPlaintextDetectionCount(): void {
  totalLegacyPlaintextDetected = 0;
}

/**
 * Tracks legacy unencrypted bank account detections within an operation without
 * ever emitting raw account numbers into logs or error payloads.
 */
export function createLegacyPlaintextTracker(operation: string): LegacyPlaintextTracker {
  let detectedCount = 0;
  return {
    operation,
    get detectedCount() {
      return detectedCount;
    },
    record() {
      detectedCount += 1;
      totalLegacyPlaintextDetected += 1;
    },
    flushSummary(organizationId?: string | null): number {
      if (detectedCount > 0) {
        logger.info(
          {
            operation,
            organizationId: organizationId || undefined,
            legacyPlaintextDetectedCount: detectedCount,
          },
          'Detected legacy unencrypted beneficiary bank account records under compatibility policy'
        );
      }
      return detectedCount;
    },
  };
}

/**
 * Returns true if the string matches the AES-256-GCM envelope `iv:authTag:ciphertext`.
 */
export function isEncryptedBankAccountEnvelope(value: string | null | undefined): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 && ENCRYPTED_BANK_ACCOUNT_ENVELOPE_REGEX.test(trimmed);
}

/**
 * Returns true if a stored string carries an encrypted envelope delimiter (`:`).
 * Valid Indian bank account numbers never contain colons, so any colon-bearing
 * value must be processed strictly as encrypted (never as legacy plaintext).
 */
export function hasEncryptedEnvelopeMarker(value: string | null | undefined): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.includes(':');
}

/**
 * Returns true strictly for recognizable legacy plaintext numeric accounts
 * (9-18 ASCII numeric digits, non-all-zero, no letters/symbols/colons).
 */
export function isValidLegacyPlaintextAccount(value: string | null | undefined): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return (
    LEGACY_PLAINTEXT_ACCOUNT_REGEX.test(trimmed) &&
    !ALL_ZERO_ACCOUNT_REGEX.test(trimmed)
  );
}

/**
 * Sanitizes an existing mask string so neither AES ciphertext nor raw 9-18 digit
 * account numbers can leak as a "mask".
 */
export function normalizeSafeBankAccountMask(
  storedMask: string | null | undefined
): string | null {
  const trimmed = typeof storedMask === 'string' ? storedMask.trim() : '';
  if (!trimmed) return null;
  if (hasEncryptedEnvelopeMarker(trimmed)) return null;
  if (LEGACY_PLAINTEXT_ACCOUNT_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates and encrypts a new beneficiary bank account number for persistence.
 * Fails closed if validation or AES-256-GCM encryption fails (zero plaintext fallback).
 */
export function encryptBeneficiaryBankAccount(
  rawAccount: string | null | undefined,
  contextName?: string
): EncryptedBeneficiaryBankAccountWrite {
  const raw = typeof rawAccount === 'string' ? rawAccount.trim() : '';
  if (!raw) {
    throw new BadRequestError(
      `Bank account number is not configured${contextName ? ` for ${contextName}` : ''}.`,
      'INVALID_BANK_ACCOUNT'
    );
  }

  // Reject ciphertext strings or ambiguous alphabetic characters before digit stripping
  if (hasEncryptedEnvelopeMarker(raw) || /[^0-9\s-]/.test(raw)) {
    throw new BadRequestError(
      `Invalid bank account number${contextName ? ` for ${contextName}` : ''}. Must contain only 9 to 18 numeric digits.`,
      'INVALID_BANK_ACCOUNT'
    );
  }

  const cleanAccount = UnionBankValidator.validateAccountNumber(raw, contextName);

  let encryptedAccount = '';
  try {
    encryptedAccount = CredentialEncryption.encrypt(cleanAccount);
  } catch {
    throw new AppError(
      'Unable to encrypt beneficiary bank account number. Plaintext storage fallback is disabled.',
      500,
      'BENEFICIARY_BANK_ENCRYPTION_FAILED'
    );
  }

  if (!isEncryptedBankAccountEnvelope(encryptedAccount)) {
    throw new AppError(
      'Beneficiary bank account encryption produced an invalid ciphertext envelope.',
      500,
      'BENEFICIARY_BANK_ENCRYPTION_FAILED'
    );
  }

  return {
    cleanAccount,
    encryptedAccount,
    mask: maskAccountNumber(cleanAccount),
  };
}

/**
 * Decrypts and validates a stored bank account (encrypted envelope or strict legacy numeric).
 * Fails closed on corrupted ciphertext, auth-tag failures, wrong key, or ambiguous plaintext.
 */
export function decryptStoredBankAccountFailClosed(
  storedValue: string | null | undefined,
  options?: {
    contextName?: string;
    tracker?: LegacyPlaintextTracker;
    allowLegacyPlaintext?: boolean;
    notConfiguredCode?: string;
  }
): DecryptedBeneficiaryBankAccount {
  const contextName = options?.contextName;
  const trimmed = typeof storedValue === 'string' ? storedValue.trim() : '';

  if (!trimmed) {
    throw new BadRequestError(
      `Bank account number is not configured${contextName ? ` for ${contextName}` : ''}.`,
      options?.notConfiguredCode || 'INVALID_BANK_ACCOUNT'
    );
  }

  if (hasEncryptedEnvelopeMarker(trimmed)) {
    if (!isEncryptedBankAccountEnvelope(trimmed)) {
      throw new BadRequestError(
        `Malformed encrypted bank account envelope${contextName ? ` for ${contextName}` : ''}.`,
        'INVALID_ENCRYPTED_BANK_ACCOUNT'
      );
    }

    let decrypted = '';
    try {
      decrypted = CredentialEncryption.decrypt(trimmed).trim();
    } catch {
      throw new BadRequestError(
        `Unable to decrypt bank account number${contextName ? ` for ${contextName}` : ''}. Re-verification required.`,
        'INVALID_ENCRYPTED_BANK_ACCOUNT'
      );
    }

    if (!isValidLegacyPlaintextAccount(decrypted)) {
      throw new BadRequestError(
        `Decrypted bank account number is invalid${contextName ? ` for ${contextName}` : ''}.`,
        'INVALID_BANK_ACCOUNT'
      );
    }

    const clean = UnionBankValidator.validateAccountNumber(decrypted, contextName);
    return {
      accountNumber: clean,
      source: 'ENCRYPTED',
      mask: maskAccountNumber(clean),
    };
  }

  if (options?.allowLegacyPlaintext === false) {
    throw new BadRequestError(
      `Unencrypted bank account number is not permitted${contextName ? ` for ${contextName}` : ''}.`,
      'UNENCRYPTED_BANK_ACCOUNT_PROHIBITED'
    );
  }

  if (!isValidLegacyPlaintextAccount(trimmed)) {
    const contextSuffix = contextName ? ` for ${contextName}` : '';
    if (ALL_ZERO_ACCOUNT_REGEX.test(trimmed)) {
      throw new BadRequestError(
        `Invalid all-zero bank account number${contextSuffix}. Placeholder accounts are strictly prohibited.`,
        'INVALID_BANK_ACCOUNT'
      );
    }
    throw new BadRequestError(
      `Invalid or ambiguous legacy bank account number${contextSuffix}. Must be 9 to 18 numeric digits.`,
      'INVALID_BANK_ACCOUNT'
    );
  }

  options?.tracker?.record();
  if (!options?.tracker) {
    totalLegacyPlaintextDetected += 1;
  }

  const clean = UnionBankValidator.validateAccountNumber(trimmed, contextName);
  return {
    accountNumber: clean,
    source: 'LEGACY_PLAINTEXT',
    mask: maskAccountNumber(clean),
  };
}

/**
 * Validates beneficiary bank account data non-destructively for settlement preview.
 * Never derives a mask from AES ciphertext and never exposes plaintext/ciphertext.
 */
export function validateBeneficiaryBankAccountForSettlement(
  storedAccount: string | null | undefined,
  options?: {
    storedMask?: string | null;
    contextName?: string;
    tracker?: LegacyPlaintextTracker;
  }
): BeneficiaryAccountValidationOutcome {
  const safeStoredMask = normalizeSafeBankAccountMask(options?.storedMask);
  const trimmed = typeof storedAccount === 'string' ? storedAccount.trim() : '';

  if (!trimmed) {
    return {
      isValid: false,
      accountNumber: null,
      source: null,
      mask: safeStoredMask,
      errors: ['Missing bank account number'],
      hasMalformedCiphertext: false,
      isLegacyPlaintext: false,
    };
  }

  if (hasEncryptedEnvelopeMarker(trimmed)) {
    try {
      const decrypted = decryptStoredBankAccountFailClosed(trimmed, {
        contextName: options?.contextName,
        tracker: options?.tracker,
      });
      return {
        isValid: true,
        accountNumber: decrypted.accountNumber,
        source: decrypted.source,
        mask: safeStoredMask || decrypted.mask,
        errors: [],
        hasMalformedCiphertext: false,
        isLegacyPlaintext: false,
      };
    } catch {
      return {
        isValid: false,
        accountNumber: null,
        source: null,
        mask: safeStoredMask,
        errors: ['Encrypted bank account data is invalid or cannot be decrypted; re-verification required'],
        hasMalformedCiphertext: true,
        isLegacyPlaintext: false,
      };
    }
  }

  if (isValidLegacyPlaintextAccount(trimmed)) {
    options?.tracker?.record();
    if (!options?.tracker) {
      totalLegacyPlaintextDetected += 1;
    }
    return {
      isValid: true,
      accountNumber: trimmed,
      source: 'LEGACY_PLAINTEXT',
      mask: safeStoredMask || maskAccountNumber(trimmed),
      errors: [],
      hasMalformedCiphertext: false,
      isLegacyPlaintext: true,
    };
  }

  // Non-numeric / ambiguous / out-of-range plaintext validation
  const errors: string[] = [];
  if (ALL_ZERO_ACCOUNT_REGEX.test(trimmed)) {
    errors.push('Invalid all-zero bank account number');
  } else if (/^[0-9]+$/.test(trimmed)) {
    errors.push(`Invalid account number length (${trimmed.length} digits; expected 9 to 18 digits)`);
  } else {
    errors.push('Invalid or ambiguous bank account format (expected 9 to 18 numeric digits)');
  }

  return {
    isValid: false,
    accountNumber: null,
    source: null,
    mask: safeStoredMask,
    errors,
    hasMalformedCiphertext: false,
    isLegacyPlaintext: false,
  };
}

/**
 * Resolves a safe display mask (`XXXX-XXXX-NNNN`) preferring persisted customer/batch masks
 * and never slicing AES ciphertext tails.
 */
export function resolveBeneficiaryBankMask(params: {
  storedMask?: string | null;
  storedAccount?: string | null;
  allowDecryptFallback?: boolean;
  tracker?: LegacyPlaintextTracker;
}): string | null {
  const safeStoredMask = normalizeSafeBankAccountMask(params.storedMask);
  if (safeStoredMask) {
    return safeStoredMask;
  }

  const trimmed = typeof params.storedAccount === 'string' ? params.storedAccount.trim() : '';
  if (!trimmed) {
    return null;
  }

  if (hasEncryptedEnvelopeMarker(trimmed)) {
    if (!params.allowDecryptFallback || !isEncryptedBankAccountEnvelope(trimmed)) {
      return null;
    }
    try {
      const decrypted = CredentialEncryption.decrypt(trimmed).trim();
      return isValidLegacyPlaintextAccount(decrypted) ? maskAccountNumber(decrypted) : null;
    } catch {
      return null;
    }
  }

  if (isValidLegacyPlaintextAccount(trimmed)) {
    params.tracker?.record();
    if (!params.tracker) {
      totalLegacyPlaintextDetected += 1;
    }
    return maskAccountNumber(trimmed);
  }

  return null;
}
