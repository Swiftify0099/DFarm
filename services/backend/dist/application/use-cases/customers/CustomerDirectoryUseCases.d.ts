import { ICustomerRepository } from '../../ports/index.js';
import { MilkCategory } from '../../../domain/entities/Customer.js';
export declare class GetCustomersUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(params: {
        organizationId: string;
        centerId?: string;
        search?: string;
        category?: MilkCategory;
        limit?: number;
        offset?: number;
        includeSoftDeleted?: boolean;
    }): Promise<{
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
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
    }[]>;
}
export declare class GetCustomerByIdUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(id: string): Promise<{
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
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
    }>;
}
export declare class LookupRfidCustomerUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(rawCardUid: string, organizationId?: string): Promise<{
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
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
    }>;
}
export interface RegisterCustomerDTO {
    fullName: string;
    mobileNumber: string;
    organizationId: string;
    centerId: string;
    village?: string;
    categories?: MilkCategory[];
    bankDetails?: {
        accountNumber: string;
        ifscCode: string;
        bankName: string;
        accountHolderName: string;
    };
}
export declare class RegisterCustomerUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(dto: RegisterCustomerDTO): Promise<{
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
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
    }>;
}
export declare class GetCustomerStatusUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(id: string): Promise<{
        id: string;
        organizationId: string;
        fullName: string;
        farmerCode: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
        rejectionReason: string | undefined;
        bankDetails: {
            bankName?: string;
            accountNumber?: string;
            ifscCode?: string;
            accountHolderName?: string;
        } | undefined;
        permittedCategories: MilkCategory[];
    }>;
}
export declare class GetPendingCustomerRegistrationsUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(organizationId?: string): Promise<{
        id: string;
        dairyId: string;
        candidateName: string;
        mobileNumber: string;
        submittedAt: any;
        address: any;
        village: string;
        preferredCategory: MilkCategory;
        bankDetails: {
            accountNumber: string;
            bankName: string;
            ifscCode: string;
        } | undefined;
        faceCapture: {
            templateVersion: string;
            modelVersion: "YuNet-v1.0 + SFace-INT8-v1.0";
            consentTimestamp: any;
            consentAgreed: boolean;
            enrollmentStatus: "PENDING_APPROVAL";
            qualityScore: number;
            captureDevice: string;
        };
        status: "PENDING";
        rejectionReason: string | undefined;
    }[]>;
}
export declare class ApproveCustomerRegistrationUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(customerId: string, operatorName: string, customCode?: string): Promise<{
        customerCode: string;
        isSoftDeleted: boolean;
        faceEnrollmentStatus: string;
        id: string;
        organizationId: string;
        centerId: string;
        farmerCode: string;
        fullName: string;
        mobileNumber: string;
        status: import("../../../domain/entities/Customer.js").CustomerStatus;
        registrationStatus: import("../../../domain/entities/Customer.js").CustomerRegistrationStatus;
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
    }>;
}
export declare class RejectCustomerRegistrationUseCase {
    private readonly customerRepo;
    constructor(customerRepo: ICustomerRepository);
    execute(customerId: string, reason: string, operatorName: string): Promise<{
        id: string;
        fullName: string;
        status: string;
        registrationStatus: string;
        rejectionReason: string;
        reviewedBy: string;
        reviewedAt: string;
    }>;
}
//# sourceMappingURL=CustomerDirectoryUseCases.d.ts.map