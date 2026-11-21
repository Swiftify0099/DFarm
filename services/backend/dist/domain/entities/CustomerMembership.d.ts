export type MembershipStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'UNREGISTERED';
export interface CustomerMembershipProps {
    id: string;
    globalCustomerId: string;
    organizationId: string;
    tenantCustomerId: string;
    farmerCode?: string | null;
    customerName?: string | null;
    membershipStatus: MembershipStatus;
    dairyName: string;
    dairyCode?: string | null;
    dairyAddress?: string | null;
    centerId?: string | null;
    centerName?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    lastSynchronizedAt?: string | Date;
}
export declare class CustomerMembership {
    private props;
    constructor(props: CustomerMembershipProps);
    get id(): string;
    get globalCustomerId(): string;
    get organizationId(): string;
    get tenantCustomerId(): string;
    get farmerCode(): string | null | undefined;
    get customerName(): string | null | undefined;
    get membershipStatus(): MembershipStatus;
    get dairyName(): string;
    get dairyCode(): string | null | undefined;
    get dairyAddress(): string | null | undefined;
    get centerId(): string | null | undefined;
    get centerName(): string | null | undefined;
    get isApproved(): boolean;
    updateStatus(status: MembershipStatus, farmerCode?: string | null): void;
    toJSON(): {
        id: string;
        globalCustomerId: string;
        organizationId: string;
        dairyId: string;
        tenantCustomerId: string;
        farmerCode: string | null | undefined;
        customerName: string | null | undefined;
        membershipStatus: MembershipStatus;
        status: MembershipStatus;
        dairyName: string;
        dairyCode: string | null | undefined;
        dairyAddress: string | null | undefined;
        centerId: string | null | undefined;
        centerName: string | null | undefined;
        isApproved: boolean;
        createdAt: string;
        updatedAt: string;
        lastSynchronizedAt: string;
    };
}
//# sourceMappingURL=CustomerMembership.d.ts.map