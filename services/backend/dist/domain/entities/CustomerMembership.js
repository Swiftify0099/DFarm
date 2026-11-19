export class CustomerMembership {
    props;
    constructor(props) {
        this.props = {
            ...props,
            farmerCode: props.farmerCode ?? null,
            dairyCode: props.dairyCode ?? null,
            dairyAddress: props.dairyAddress ?? null,
            centerId: props.centerId ?? null,
            centerName: props.centerName ?? null,
            createdAt: props.createdAt || new Date(),
            updatedAt: props.updatedAt || new Date(),
            lastSynchronizedAt: props.lastSynchronizedAt || new Date(),
        };
    }
    get id() {
        return this.props.id;
    }
    get globalCustomerId() {
        return this.props.globalCustomerId;
    }
    get organizationId() {
        return this.props.organizationId;
    }
    get tenantCustomerId() {
        return this.props.tenantCustomerId;
    }
    get farmerCode() {
        return this.props.farmerCode;
    }
    get membershipStatus() {
        return this.props.membershipStatus;
    }
    get dairyName() {
        return this.props.dairyName;
    }
    get dairyCode() {
        return this.props.dairyCode;
    }
    get dairyAddress() {
        return this.props.dairyAddress;
    }
    get centerId() {
        return this.props.centerId;
    }
    get centerName() {
        return this.props.centerName;
    }
    get isApproved() {
        return this.props.membershipStatus === 'APPROVED';
    }
    updateStatus(status, farmerCode) {
        this.props.membershipStatus = status;
        if (farmerCode !== undefined) {
            this.props.farmerCode = farmerCode;
        }
        this.props.updatedAt = new Date();
        this.props.lastSynchronizedAt = new Date();
    }
    toJSON() {
        return {
            id: this.id,
            globalCustomerId: this.globalCustomerId,
            organizationId: this.organizationId,
            dairyId: this.organizationId,
            tenantCustomerId: this.tenantCustomerId,
            farmerCode: this.farmerCode,
            membershipStatus: this.membershipStatus,
            status: this.membershipStatus,
            dairyName: this.dairyName,
            dairyCode: this.dairyCode,
            dairyAddress: this.dairyAddress,
            centerId: this.centerId,
            centerName: this.centerName,
            isApproved: this.isApproved,
            createdAt: this.props.createdAt instanceof Date ? this.props.createdAt.toISOString() : String(this.props.createdAt),
            updatedAt: this.props.updatedAt instanceof Date ? this.props.updatedAt.toISOString() : String(this.props.updatedAt),
            lastSynchronizedAt: this.props.lastSynchronizedAt instanceof Date ? this.props.lastSynchronizedAt.toISOString() : String(this.props.lastSynchronizedAt),
        };
    }
}
//# sourceMappingURL=CustomerMembership.js.map