import { Money, FatPercentage, SnfPercentage, MilkWeight } from '../value-objects/index.js';
export class MilkCollectionTransaction {
    props;
    constructor(props) {
        // Domain validation using value objects
        new MilkWeight(props.weightLiters);
        new FatPercentage(props.fatPercentage, props.milkCategory);
        new SnfPercentage(props.snfPercentage, props.milkCategory);
        new Money(props.totalAmount);
        this.props = { ...props };
    }
    get id() {
        return this.props.id;
    }
    get transactionCode() {
        return this.props.transactionCode;
    }
    get customerId() {
        return this.props.customerId;
    }
    get customerCode() {
        return this.props.customerCode;
    }
    get customerName() {
        return this.props.customerName;
    }
    get weightLiters() {
        return this.props.weightLiters;
    }
    get totalAmount() {
        return this.props.totalAmount;
    }
    get appliedRatePerLiter() {
        return this.props.appliedRatePerLiter;
    }
    get idempotencyKey() {
        return this.props.idempotencyKey;
    }
    toJSON() {
        return {
            ...this.props,
            quantityLiters: this.props.weightLiters,
            ratePerLiter: this.props.appliedRatePerLiter,
            animalType: this.props.milkCategory,
            receiptNumber: this.props.transactionCode,
            collectionDate: this.props.date,
            collectionTime: this.props.timestamp?.includes('T')
                ? (this.props.timestamp.split('T')[1] || '').substring(0, 5)
                : (this.props.timestamp || ''),
        };
    }
}
//# sourceMappingURL=MilkCollectionTransaction.js.map