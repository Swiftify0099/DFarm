export class GlobalCustomerIdentity {
    props;
    constructor(props) {
        this.props = {
            ...props,
            phoneVerifiedAt: props.phoneVerifiedAt || new Date(),
            createdAt: props.createdAt || new Date(),
            updatedAt: props.updatedAt || new Date(),
        };
    }
    get id() {
        return this.props.id;
    }
    get normalizedMobileNumber() {
        return this.props.normalizedMobileNumber;
    }
    get phoneVerifiedAt() {
        return this.props.phoneVerifiedAt instanceof Date
            ? this.props.phoneVerifiedAt.toISOString()
            : String(this.props.phoneVerifiedAt);
    }
    get createdAt() {
        return this.props.createdAt instanceof Date
            ? this.props.createdAt.toISOString()
            : String(this.props.createdAt);
    }
    get updatedAt() {
        return this.props.updatedAt instanceof Date
            ? this.props.updatedAt.toISOString()
            : String(this.props.updatedAt);
    }
    toJSON() {
        return {
            id: this.id,
            normalizedMobileNumber: this.normalizedMobileNumber,
            phoneVerifiedAt: this.phoneVerifiedAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
//# sourceMappingURL=GlobalCustomerIdentity.js.map