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
    get globalCustomerId() {
        return this.props.globalCustomerId;
    }
    setGlobalCustomerId(id) {
        this.props.globalCustomerId = id;
        this.props.updatedAt = new Date().toISOString();
    }
    get balanceDue() {
        return this.props.balanceDue || 0.0;
    }
    get isDeleted() {
        return Boolean(this.props.isDeleted);
    }
    get lastDelivery() {
        return this.props.lastDelivery;
    }
    validateCanDeliver(category) {
        if (this.props.status === 'SUSPENDED' || this.props.registrationStatus === 'SUSPENDED') {
            throw new CustomerSuspendedError(this.props.fullName);
        }
        if (this.props.registrationStatus !== 'APPROVED' || this.props.status !== 'ACTIVE') {
            throw new CustomerSuspendedError(`Farmer ${this.props.fullName} is not active or pending approval.`);
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
    suspend(reason) {
        this.props.status = 'SUSPENDED';
        if (reason) {
            this.props.rejectionReason = reason;
        }
        this.props.updatedAt = new Date().toISOString();
    }
    reactivate() {
        this.props.status = 'ACTIVE';
        this.props.updatedAt = new Date().toISOString();
    }
    updateProfile(updates) {
        if (updates.fullName && updates.fullName.trim()) {
            this.props.fullName = updates.fullName.trim();
        }
        if (updates.village !== undefined) {
            this.props.village = updates.village.trim();
        }
        if (updates.permittedCategories && updates.permittedCategories.length > 0) {
            this.props.permittedCategories = [...updates.permittedCategories];
        }
        if (updates.mobileNumber && updates.mobileNumber.trim()) {
            this.props.mobileNumber = updates.mobileNumber.trim();
        }
        this.props.updatedAt = new Date().toISOString();
    }
    toJSON() {
        return {
            ...this.props,
            customerCode: this.props.farmerCode, // Backward compatibility with frontend
            isSoftDeleted: Boolean(this.props.isDeleted),
            faceEnrollmentStatus: this.props.faceTemplateEnrolled ? 'ENROLLED' : 'NOT_ENROLLED',
        };
    }
}
//# sourceMappingURL=Customer.js.map