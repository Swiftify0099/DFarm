import { Money } from '../value-objects/index.js';

export interface LedgerEntry {
  id: string;
  transactionDate: string;
  type: 'MILK_CREDIT' | 'FEED_DEBIT' | 'CASH_ADVANCE_DEBIT' | 'BANK_PAYOUT' | 'ADJUSTMENT';
  description: string;
  creditAmount: number;
  debitAmount: number;
  runningBalance: number;
  referenceId?: string;
}

export interface CustomerLedgerAccountProps {
  id: string;
  customerId: string;
  organizationId: string;
  currentBalance: number; // positive = payable to farmer
  totalMilkEarnings: number;
  totalDeductions: number;
  lastUpdated: string;
}

export class CustomerLedgerAccount {
  private props: CustomerLedgerAccountProps;

  constructor(props: CustomerLedgerAccountProps) {
    this.props = { ...props };
  }

  public get id(): string {
    return this.props.id;
  }

  public get customerId(): string {
    return this.props.customerId;
  }

  public get organizationId(): string {
    return this.props.organizationId;
  }

  public get currentBalance(): number {
    return this.props.currentBalance;
  }

  public get totalMilkEarnings(): number {
    return this.props.totalMilkEarnings;
  }

  public get totalDeductions(): number {
    return this.props.totalDeductions;
  }

  public postCredit(amount: number, description: string, referenceId?: string): LedgerEntry {
    const credit = new Money(amount).value;
    const newBal = new Money(this.props.currentBalance + credit).value;
    this.props.currentBalance = newBal;
    this.props.totalMilkEarnings = new Money(this.props.totalMilkEarnings + credit).value;
    this.props.lastUpdated = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      transactionDate: this.props.lastUpdated,
      type: 'MILK_CREDIT',
      description,
      creditAmount: credit,
      debitAmount: 0.0,
      runningBalance: newBal,
      referenceId,
    };
  }

  public postDebit(amount: number, type: 'FEED_DEBIT' | 'CASH_ADVANCE_DEBIT' | 'BANK_PAYOUT', description: string, referenceId?: string): LedgerEntry {
    const debit = new Money(amount).value;
    const newBal = new Money(this.props.currentBalance - debit).value;
    this.props.currentBalance = newBal;
    this.props.totalDeductions = new Money(this.props.totalDeductions + debit).value;
    this.props.lastUpdated = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      transactionDate: this.props.lastUpdated,
      type,
      description,
      creditAmount: 0.0,
      debitAmount: debit,
      runningBalance: newBal,
      referenceId,
    };
  }

  public toKhataSummary() {
    return {
      customerId: this.props.customerId,
      currentBalance: this.props.currentBalance,
      totalMilkEarnings: this.props.totalMilkEarnings,
      totalDeductions: this.props.totalDeductions,
      lastUpdated: this.props.lastUpdated,
    };
  }
}
