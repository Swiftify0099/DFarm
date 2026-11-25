import { ICustomerRepository, IShiftSessionRepository, ICollectionTransactionRepository, IRateChartRepository, ILedgerRepository } from '../../ports/index.js';
import { MilkCollectionTransaction, IdentificationMethod } from '../../../domain/entities/MilkCollectionTransaction.js';
import { MilkCategory } from '../../../domain/entities/Customer.js';
export interface ProcessMilkIntakeDTO {
    sessionId?: string;
    sessionCode?: string;
    customerId: string;
    organizationId: string;
    milkCategory: MilkCategory;
    weightLiters: number;
    fatPercentage: number;
    snfPercentage: number;
    clrDensity?: number;
    identificationMethod: IdentificationMethod;
    deviceId?: string;
    operatorId: string;
    operatorName: string;
    idempotencyKey?: string;
}
export declare class ProcessMilkIntakeUseCase {
    private readonly customerRepo;
    private readonly sessionRepo;
    private readonly transactionRepo;
    private readonly rateChartRepo;
    private readonly ledgerRepo;
    constructor(customerRepo: ICustomerRepository, sessionRepo: IShiftSessionRepository, transactionRepo: ICollectionTransactionRepository, rateChartRepo: IRateChartRepository, ledgerRepo: ILedgerRepository);
    execute(dto: ProcessMilkIntakeDTO): Promise<{
        transaction: MilkCollectionTransaction;
        receiptNumber: string;
        customerBalanceAfter: number;
        isIdempotentReplay: boolean;
    }>;
}
export declare class GetCustomerCollectionHistoryUseCase {
    private readonly transactionRepo;
    constructor(transactionRepo: ICollectionTransactionRepository);
    execute(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<{
        quantityLiters: number;
        ratePerLiter: number;
        animalType: "COW" | "BUFFALO";
        receiptNumber: string;
        collectionDate: string;
        collectionTime: string;
        id: string;
        transactionCode: string;
        sessionId: string;
        dairyId: string;
        centerId: string;
        customerId: string;
        customerCode: string;
        customerName: string;
        timestamp: string;
        date: string;
        shift: "MORNING" | "EVENING";
        milkCategory: "COW" | "BUFFALO";
        weightLiters: number;
        fatPercentage: number;
        snfPercentage: number;
        clrDensity: number;
        appliedRatePerLiter: number;
        rateChartVersion: number;
        totalAmount: number;
        identificationMethod: IdentificationMethod;
        syncStatus: import("../../../domain/entities/MilkCollectionTransaction.js").SyncStatus;
        deviceId: string;
        operatorName: string;
        idempotencyKey?: string;
    }[]>;
}
export declare class GetMonthlyMilkSummaryUseCase {
    private readonly transactionRepo;
    constructor(transactionRepo: ICollectionTransactionRepository);
    execute(customerId: string, monthYear?: string, organizationId?: string): Promise<{
        monthYear: string;
        totalLiters: number;
        cowLiters: number;
        buffaloLiters: number;
        avgFat: number;
        avgSnf: number;
        totalAmount: number;
        transactionCount: number;
    }>;
}
//# sourceMappingURL=MilkIntakeUseCases.d.ts.map