import { ICustomerRepository, IShiftSessionRepository, ICollectionTransactionRepository } from '../../ports/index.js';
import type { BulkCollectionSyncRequestDTO, BulkCollectionSyncResponseDTO } from '@dfarm/shared-types';
export declare class BulkCollectionSyncUseCase {
    private readonly customerRepo;
    private readonly sessionRepo;
    private readonly transactionRepo;
    constructor(customerRepo: ICustomerRepository, sessionRepo: IShiftSessionRepository, transactionRepo: ICollectionTransactionRepository);
    execute(params: {
        organizationId: string;
        operatorId: string;
        operatorName: string;
        authenticatedDeviceId?: string;
        requestId: string;
        batch: BulkCollectionSyncRequestDTO;
    }): Promise<BulkCollectionSyncResponseDTO>;
}
//# sourceMappingURL=BulkCollectionSyncUseCase.d.ts.map