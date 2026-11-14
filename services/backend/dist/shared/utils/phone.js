import { ValidationError } from '../errors/app-error.js';
export function normalizeE164Phone(rawPhone, defaultCountryPrefix = '+91') {
    if (!rawPhone || typeof rawPhone !== 'string') {
        throw new ValidationError('Mobile number is required and must be a string');
    }
    // Strip all whitespace, dashes, dots, and parentheses
    const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');
    // If already starts with +
    if (cleaned.startsWith('+')) {
        const digitsOnly = cleaned.slice(1);
        if (!/^\d{10,15}$/.test(digitsOnly)) {
            throw new ValidationError(`Invalid international E.164 phone number: ${rawPhone}`);
        }
        return cleaned;
    }
    // If starts with 0 (e.g. Indian trunk prefix 09876543210)
    if (cleaned.startsWith('0')) {
        const localNumber = cleaned.slice(1);
        if (!/^\d{10}$/.test(localNumber)) {
            throw new ValidationError(`Invalid mobile number format: ${rawPhone}`);
        }
        return `${defaultCountryPrefix}${localNumber}`;
    }
    // Standard 10-digit mobile number
    if (/^\d{10}$/.test(cleaned)) {
        return `${defaultCountryPrefix}${cleaned}`;
    }
    throw new ValidationError(`Mobile number must be a valid 10-digit number or E.164 normalized format (+[country][number]): ${rawPhone}`);
}
/**
 * Masks a phone number for privacy-compliant logging and audit trails.
 * e.g. "+919876543210" -> "+9198****210"
 */
export function maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string')
        return '[REDACTED]';
    const trimmed = phone.trim();
    if (trimmed.length < 6)
        return '***';
    const prefix = trimmed.slice(0, Math.min(5, trimmed.length - 3));
    const suffix = trimmed.slice(-3);
    return `${prefix}${'*'.repeat(Math.max(3, trimmed.length - prefix.length - suffix.length))}${suffix}`;
}
//# sourceMappingURL=phone.js.map