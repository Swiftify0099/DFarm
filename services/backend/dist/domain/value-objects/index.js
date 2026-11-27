// DFarm Domain Value Objects
import { DomainValidationError } from '../errors/index.js';
import { roundHalfUp } from '@dfarm/shared-types';
export class Money {
    amount;
    constructor(amount) {
        if (isNaN(amount) || !isFinite(amount) || amount < 0) {
            throw new DomainValidationError('Invalid monetary amount: must be a non-negative number');
        }
        // DFarm Authoritative Commercial Round-Half-Up to exact 2 decimals (paise)
        this.amount = roundHalfUp(amount, 2);
    }
    get value() {
        return this.amount;
    }
    add(other) {
        return new Money(this.amount + other.value);
    }
    subtract(other) {
        return new Money(this.amount - other.value);
    }
    multiply(factor) {
        return new Money(this.amount * factor);
    }
    toFixed(digits = 2) {
        return this.amount.toFixed(digits);
    }
}
/**
 * LedgerBalance — a signed running-balance value object.
 *
 * Unlike Money (which enforces non-negative amounts for individual transaction
 * entries), a customer ledger running balance may legitimately be negative when
 * the farmer owes the dairy (e.g. after a cash advance exceeds milk earnings).
 *
 * Key invariants:
 *   • The running balance itself can be any finite number (positive, zero, or negative).
 *   • Individual transaction amounts (credits, debits) are always non-negative — use Money.
 *   • Round-half-up to 2 decimal places matches DFarm NUMERIC(12,2) PostgreSQL precision.
 */
export class LedgerBalance {
    amount;
    constructor(amount) {
        if (isNaN(amount) || !isFinite(amount)) {
            throw new DomainValidationError('Invalid ledger balance: must be a finite number (positive, zero, or negative)');
        }
        this.amount = roundHalfUp(amount, 2);
    }
    get value() {
        return this.amount;
    }
    add(transactionAmount) {
        return new LedgerBalance(this.amount + roundHalfUp(transactionAmount, 2));
    }
    subtract(transactionAmount) {
        return new LedgerBalance(this.amount - roundHalfUp(transactionAmount, 2));
    }
    toFixed(digits = 2) {
        return this.amount.toFixed(digits);
    }
}
export class FatPercentage {
    val;
    constructor(val, milkCategory) {
        if (isNaN(val) || val <= 0) {
            throw new DomainValidationError('Fat percentage must be a positive number');
        }
        const min = milkCategory === 'COW' ? 2.5 : 4.5;
        const max = milkCategory === 'COW' ? 8.0 : 15.0;
        if (val < min || val > max) {
            throw new DomainValidationError(`Fat percentage ${val}% is out of biological bounds [${min}% - ${max}%] for ${milkCategory} milk`);
        }
        this.val = Math.round((val + Number.EPSILON) * 10) / 10;
    }
    get value() {
        return this.val;
    }
}
export class SnfPercentage {
    val;
    constructor(val, milkCategory) {
        if (isNaN(val) || val <= 0) {
            throw new DomainValidationError('SNF percentage must be a positive number');
        }
        const min = milkCategory === 'COW' ? 7.0 : 7.5;
        const max = milkCategory === 'COW' ? 11.0 : 12.5;
        if (val < min || val > max) {
            throw new DomainValidationError(`SNF percentage ${val}% is out of biological bounds [${min}% - ${max}%] for ${milkCategory} milk`);
        }
        this.val = Math.round((val + Number.EPSILON) * 10) / 10;
    }
    get value() {
        return this.val;
    }
}
export class MilkWeight {
    liters;
    constructor(liters) {
        if (isNaN(liters) || liters <= 0) {
            throw new DomainValidationError('Milk intake weight must be strictly positive');
        }
        if (liters > 500) {
            throw new DomainValidationError(`Milk intake weight ${liters}L exceeds single-can threshold of 500L`);
        }
        this.liters = Math.round((liters + Number.EPSILON) * 100) / 100;
    }
    get value() {
        return this.liters;
    }
}
export class RfidUid {
    uid;
    constructor(raw) {
        if (!raw || typeof raw !== 'string') {
            throw new DomainValidationError('RFID card UID cannot be empty');
        }
        const normalized = raw.trim().replace(/[:\s-]/g, '').toUpperCase();
        if (!/^[0-9A-F]{4,64}$/.test(normalized)) {
            throw new DomainValidationError(`Invalid RFID UID format: "${raw}". Expected 4-64 hexadecimal characters.`);
        }
        this.uid = normalized;
    }
    get value() {
        return this.uid;
    }
}
export class PhoneNumber {
    phone;
    constructor(raw) {
        if (!raw || typeof raw !== 'string') {
            throw new DomainValidationError('Phone number cannot be empty');
        }
        const cleaned = raw.replace(/\D/g, '');
        if (cleaned.length < 10) {
            throw new DomainValidationError('Phone number must have at least 10 digits');
        }
        const national = cleaned.slice(-10);
        this.phone = `+91${national}`;
    }
    get e164() {
        return this.phone;
    }
    get national10() {
        return this.phone.slice(-10);
    }
}
//# sourceMappingURL=index.js.map