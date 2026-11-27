export declare class Money {
    private readonly amount;
    constructor(amount: number);
    get value(): number;
    add(other: Money): Money;
    subtract(other: Money): Money;
    multiply(factor: number): Money;
    toFixed(digits?: number): string;
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
export declare class LedgerBalance {
    private readonly amount;
    constructor(amount: number);
    get value(): number;
    add(transactionAmount: number): LedgerBalance;
    subtract(transactionAmount: number): LedgerBalance;
    toFixed(digits?: number): string;
}
export declare class FatPercentage {
    private readonly val;
    constructor(val: number, milkCategory: 'COW' | 'BUFFALO');
    get value(): number;
}
export declare class SnfPercentage {
    private readonly val;
    constructor(val: number, milkCategory: 'COW' | 'BUFFALO');
    get value(): number;
}
export declare class MilkWeight {
    private readonly liters;
    constructor(liters: number);
    get value(): number;
}
export declare class RfidUid {
    private readonly uid;
    constructor(raw: string);
    get value(): string;
}
export declare class PhoneNumber {
    private readonly phone;
    constructor(raw: string);
    get e164(): string;
    get national10(): string;
}
//# sourceMappingURL=index.d.ts.map