export type MilkCategory = 'COW' | 'BUFFALO';
export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'DRAFT' | 'INACTIVE';
export type CustomerRegistrationStatus = 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export interface CustomerProps {
    id: string;
    organizationId: string;
    centerId: string;
    farmerCode: string;
    fullName: string;
    mobileNumber: string;
    status: CustomerStatus;
    registrationStatus: CustomerRegistrationStatus;
    permittedCategories: MilkCategory[];
    village?: string;
    rfidCardUid?: string | null;
    faceTemplateEnrolled?: boolean;
    balanceDue?: number;
    lastDelivery?: {
        date: string;
        shift: 'MORNING' | 'EVENING';
        liters: number;
    } | null;
    bankDetails?: {
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
        accountHolderName?: string;
    };
    isDeleted?: boolean;
    deletionReason?: string;
    rejectionReason?: string;
    createdAt?: string;
    updatedAt?: string;
}
export declare class Customer {
    private props;
    constructor(props: CustomerProps);
    get id(): string;
    get organizationId(): string;
    get centerId(): string;
    get farmerCode(): string;
    get fullName(): string;
    get mobileNumber(): string;
    get status(): CustomerStatus;
    get registrationStatus(): CustomerRegistrationStatus;
    get permittedCategories(): MilkCategory[];
    get village(): string | undefined;
    get rfidCardUid(): string | null | undefined;
    get isBiometricEnrolled(): boolean;
    get balanceDue(): number;
    get isDeleted(): boolean;
    get lastDelivery(): {
        date: string;
        shift: "MORNING" | "EVENING";
        liters: number;
    } | null | undefined;
    validateCanDeliver(category: MilkCategory): void;
    assignRfid(cardUid: string): void;
    setFaceTemplateEnrolled(enrolled: boolean): void;
    get bankDetails(): {
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
        accountHolderName?: string;
    } | undefined;
    get rejectionReason(): string | undefined;
    approveRegistration(assignedCode?: string): void;
    rejectRegistration(reason: string): void;
    toJSON(): {
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: CustomerStatus;
        registrationStatus: CustomerRegistrationStatus;
        permittedCategories: MilkCategory[];
        village?: string;
        rfidCardUid?: string | null;
        faceTemplateEnrolled?: boolean;
        balanceDue?: number;
        lastDelivery?: {
            date: string;
            shift: "MORNING" | "EVENING";
            liters: number;
        } | null;
        bankDetails?: {
            bankName?: string;
            accountNumber?: string;
            ifscCode?: string;
            accountHolderName?: string;
        };
        isDeleted?: boolean;
        deletionReason?: string;
        rejectionReason?: string;
        createdAt?: string;
        updatedAt?: string;
    };
}
//# sourceMappingURL=Customer.d.ts.map