// DFarm Domain Value Objects
import { DomainValidationError } from '../errors/index.js';
import { roundHalfUp } from '@dfarm/shared-types';

export class Money {
  private readonly amount: number;

  constructor(amount: number) {
    if (isNaN(amount) || !isFinite(amount) || amount < 0) {
      throw new DomainValidationError('Invalid monetary amount: must be a non-negative number');
    }
    // DFarm Authoritative Commercial Round-Half-Up to exact 2 decimals (paise)
    this.amount = roundHalfUp(amount, 2);
  }

  public get value(): number {
    return this.amount;
  }

  public add(other: Money): Money {
    return new Money(this.amount + other.value);
  }

  public subtract(other: Money): Money {
    return new Money(this.amount - other.value);
  }

  public multiply(factor: number): Money {
    return new Money(this.amount * factor);
  }

  public toFixed(digits = 2): string {
    return this.amount.toFixed(digits);
  }
}

export class FatPercentage {
  private readonly val: number;

  constructor(val: number, milkCategory: 'COW' | 'BUFFALO') {
    if (isNaN(val) || val <= 0) {
      throw new DomainValidationError('Fat percentage must be a positive number');
    }
    const min = milkCategory === 'COW' ? 2.5 : 4.5;
    const max = milkCategory === 'COW' ? 8.0 : 15.0;

    if (val < min || val > max) {
      throw new DomainValidationError(
        `Fat percentage ${val}% is out of biological bounds [${min}% - ${max}%] for ${milkCategory} milk`
      );
    }
    this.val = Math.round((val + Number.EPSILON) * 10) / 10;
  }

  public get value(): number {
    return this.val;
  }
}

export class SnfPercentage {
  private readonly val: number;

  constructor(val: number, milkCategory: 'COW' | 'BUFFALO') {
    if (isNaN(val) || val <= 0) {
      throw new DomainValidationError('SNF percentage must be a positive number');
    }
    const min = milkCategory === 'COW' ? 7.0 : 7.5;
    const max = milkCategory === 'COW' ? 11.0 : 12.5;

    if (val < min || val > max) {
      throw new DomainValidationError(
        `SNF percentage ${val}% is out of biological bounds [${min}% - ${max}%] for ${milkCategory} milk`
      );
    }
    this.val = Math.round((val + Number.EPSILON) * 10) / 10;
  }

  public get value(): number {
    return this.val;
  }
}

export class MilkWeight {
  private readonly liters: number;

  constructor(liters: number) {
    if (isNaN(liters) || liters <= 0) {
      throw new DomainValidationError('Milk intake weight must be strictly positive');
    }
    if (liters > 500) {
      throw new DomainValidationError(`Milk intake weight ${liters}L exceeds single-can threshold of 500L`);
    }
    this.liters = Math.round((liters + Number.EPSILON) * 100) / 100;
  }

  public get value(): number {
    return this.liters;
  }
}

export class RfidUid {
  private readonly uid: string;

  constructor(raw: string) {
    if (!raw || typeof raw !== 'string') {
      throw new DomainValidationError('RFID card UID cannot be empty');
    }
    const normalized = raw.trim().replace(/[:\s-]/g, '').toUpperCase();
    if (!/^[0-9A-F]{4,64}$/.test(normalized)) {
      throw new DomainValidationError(`Invalid RFID UID format: "${raw}". Expected 4-64 hexadecimal characters.`);
    }
    this.uid = normalized;
  }

  public get value(): string {
    return this.uid;
  }
}

export class PhoneNumber {
  private readonly phone: string;

  constructor(raw: string) {
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

  public get e164(): string {
    return this.phone;
  }

  public get national10(): string {
    return this.phone.slice(-10);
  }
}
