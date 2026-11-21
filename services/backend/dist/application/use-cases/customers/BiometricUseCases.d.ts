import { IBiometricEncryptor, ICustomerRepository } from '../../ports/index.js';
export declare class GetFaceTemplatesUseCase {
    execute(params: {
        organizationId: string;
        centerId?: string;
    }): Promise<{
        templateId: any;
        customerId: any;
        globalCustomerId: any;
        farmerCode: any;
        fullName: any;
        modelName: any;
        modelVersion: any;
        modelVersionId: any;
        dimension: any;
        metric: any;
        threshold: number;
        encryptedPayload: {
            encryptedData: any;
            iv: any;
            authTag: any;
            keyReference: any;
        };
    }[]>;
}
export declare class UpdateCustomerBiometricsUseCase {
    private readonly customerRepo;
    private readonly encryptor;
    constructor(customerRepo: ICustomerRepository, encryptor: IBiometricEncryptor);
    execute(params: {
        customerId: string;
        organizationId?: string;
        embedding: number[];
        modelVersion?: string;
    }): Promise<{
        success: boolean;
        customerId: string;
        modelVersion: string;
        status: string;
        enrolledAt: string;
    }>;
}
//# sourceMappingURL=BiometricUseCases.d.ts.map