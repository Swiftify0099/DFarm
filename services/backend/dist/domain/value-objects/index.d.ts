export declare class Money {
    private readonly amount;
    constructor(amount: number);
    get value(): number;
    add(other: Money): Money;
    subtract(other: Money): Money;
    multiply(factor: number): Money;
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