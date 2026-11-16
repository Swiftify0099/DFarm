import { Money } from '../value-objects/index.js';
export class CustomerLedgerAccount {
    props;
    constructor(props) {
        this.props = { ...props };
    }
    get id() {
        return this.props.id;
    }
    get customerId() {
        return this.props.customerId;
    }
    get currentBalance() {
        return this.props.currentBalance;
    }
    get totalMilkEarnings() {
        return this.props.totalMilkEarnings;
    }
    get totalDeductions() {
        return this.props.totalDeductions;
    }
    postCredit(amount, description, referenceId) {
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
    postDebit(amount, type, description, referenceId) {
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
    toKhataSummary() {
        return {
            customerId: this.props.customerId,
            currentBalance: this.props.currentBalance,
            totalMilkEarnings: this.props.totalMilkEarnings,
            totalDeductions: this.props.totalDeductions,
            lastUpdated: this.props.lastUpdated,
        };
    }
}
//# sourceMappingURL=CustomerLedgerAccount.js.map