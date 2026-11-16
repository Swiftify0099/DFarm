import { IBiometricEncryptor, ICustomerRepository } from '../../ports/index.js';
export declare class GetFaceTemplatesUseCase {
    execute(params: {
        organizationId: string;
        centerId?: string;
    }): Promise<{
        templateId: any;
        customerId: any;
        farmerCode: any;
        fullName: any;
        modelName: any;
        modelVersion: any;
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
        embedding: number[];
        modelVersion?: string;
    }): Promise<{
        success: boolean;
        message: string;
        modelVersion: string;
        dimension: any;
        keyReference: string;
    }>;
}
//# sourceMappingURL=BiometricUseCases.d.ts.map