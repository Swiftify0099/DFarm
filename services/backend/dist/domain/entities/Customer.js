import { RfidUid } from '../value-objects/index.js';
import { CustomerSuspendedError, CategoryNotAuthorizedError } from '../errors/index.js';
export class Customer {
    props;
    constructor(props) {
        this.props = {
            ...props,
            balanceDue: props.balanceDue ?? 0.0,
            permittedCategories: props.permittedCategories || ['COW'],
        };
    }
    get id() {
        return this.props.id;
    }
    get organizationId() {
        return this.props.organizationId;
    }
    get centerId() {
        return this.props.centerId;
    }
    get farmerCode() {
        return this.props.farmerCode;
    }
    get fullName() {
        return this.props.fullName;
    }
    get mobileNumber() {
        return this.props.mobileNumber;
    }
    get status() {
        return this.props.status;
    }
    get registrationStatus() {
        return this.props.registrationStatus;
    }
    get permittedCategories() {
        return [...this.props.permittedCategories];
    }
    get village() {
        return this.props.village;
    }
    get rfidCardUid() {
        return this.props.rfidCardUid;
    }
    get isBiometricEnrolled() {
        return Boolean(this.props.faceTemplateEnrolled);
    }
    get balanceDue() {
        return this.props.balanceDue || 0.0;
    }
    get lastDelivery() {
        return this.props.lastDelivery;
    }
    validateCanDeliver(category) {
        if (this.props.status === 'SUSPENDED') {
            throw new CustomerSuspendedError(this.props.fullName);
        }
        if (!this.props.permittedCategories.includes(category)) {
            throw new CategoryNotAuthorizedError(category, this.props.fullName);
        }
    }
    assignRfid(cardUid) {
        const rfid = new RfidUid(cardUid);
        this.props.rfidCardUid = rfid.value;
    }
    setFaceTemplateEnrolled(enrolled) {
        this.props.faceTemplateEnrolled = enrolled;
    }
    get bankDetails() {
        return this.props.bankDetails;
    }
    get rejectionReason() {
        return this.props.rejectionReason;
    }
    approveRegistration(assignedCode) {
        this.props.registrationStatus = 'APPROVED';
        this.props.status = 'ACTIVE';
        if (assignedCode) {
            this.props.farmerCode = assignedCode;
        }
        this.props.updatedAt = new Date().toISOString();
    }
    rejectRegistration(reason) {
        this.props.registrationStatus = 'REJECTED';
        this.props.status = 'INACTIVE';
        this.props.rejectionReason = reason;
        this.props.updatedAt = new Date().toISOString();
    }
    toJSON() {
        return {
            ...this.props,
            customerCode: this.props.farmerCode, // Backward compatibility with frontend
        };
    }
}
//# sourceMappingURL=Customer.js.map