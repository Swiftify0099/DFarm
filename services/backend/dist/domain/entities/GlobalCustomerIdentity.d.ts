export interface GlobalCustomerIdentityProps {
    id: string;
    normalizedMobileNumber: string;
    phoneVerifiedAt: string | Date;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}
export declare class GlobalCustomerIdentity {
    private props;
    constructor(props: GlobalCustomerIdentityProps);
    get id(): string;
    get normalizedMobileNumber(): string;
    get phoneVerifiedAt(): string;
    get createdAt(): string;
    get updatedAt(): string;
    toJSON(): {
        id: string;
        normalizedMobileNumber: string;
        phoneVerifiedAt: string;
        createdAt: string;
        updatedAt: string;
    };
}
//# sourceMappingURL=GlobalCustomerIdentity.d.ts.map