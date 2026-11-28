import type pg from 'pg';
import type { AuthContext } from '../../middleware/authenticate.js';
export interface CalculationPeriodParams {
    organizationId: string;
    centerId?: string | null;
    periodStart: string;
    periodEnd: string;
    customerIds?: string[];
    excludeUnverifiedBankDetails?: boolean;
}
export interface FarmerPayableItem {
    customerId: string;
    farmerCode: string;
    fullName: string;
    centerId: string;
    centerName?: string;
    bankName: string | null;
    bankAccountNumberMask: string | null;
    bankIfsc: string | null;
    bankVerificationStatus: string;
    beneficiaryStatus: string;
    isBankValid: boolean;
    hasBankValidationWarning: boolean;
    bankValidationErrors: string[];
    openingBalance: number;
    grossMilkAmount: number;
    milkQuantityLiters: number;
    collectionCount: number;
    deductionsAmount: number;
    adjustmentsCredit: number;
    adjustmentsDebit: number;
    alreadyPaidAmount: number;
    pendingReservedAmount: number;
    netPayableAmount: number;
    remainingBalance: number;
    sourceLedgerTransactionIds: string[];
    sourceCollectionIds: string[];
}
export interface CentreTotalSummary {
    centerId: string;
    centerName: string;
    centerCode: string;
    farmerCount: number;
    eligibleCount: number;
    totalMilkQuantity: number;
    totalGrossPayable: number;
    totalDeductions: number;
    totalNetPayable: number;
    totalAlreadyPaid: number;
    totalRemainingBalance: number;
}
export interface SettlementCalculationResult {
    organizationId: string;
    centerId: string | null;
    periodStart: string;
    periodEnd: string;
    calculatedAt: string;
    calculationSnapshotHash: string;
    totalFarmers: number;
    totalEligibleFarmers: number;
    totalMilkQuantityLiters: number;
    totalGrossPayable: number;
    totalDeductions: number;
    totalNetPayable: number;
    totalAlreadyPaid: number;
    totalRemainingBalance: number;
    warningsCount: number;
    farmersWithInvalidBankCount: number;
    centerBreakdowns: CentreTotalSummary[];
    farmers: FarmerPayableItem[];
}
export declare class SettlementCalculationService {
    /**
     * Calculates farmer milk settlement payables using authoritative posted PostgreSQL ledger entries.
     * Enforces exact DECIMAL/NUMERIC arithmetic and multi-center / multi-tenant isolation.
     */
    static calculateSettlement(params: CalculationPeriodParams, _auth?: AuthContext, existingClient?: pg.PoolClient): Promise<SettlementCalculationResult>;
    private static calculateSettlementWithClient;
    /**
     * Persists an immutable calculation snapshot for an approved payment batch.
     */
    static persistSettlementSnapshot(client: any, batchId: string, organizationId: string, periodStart: string, periodEnd: string, farmerItems: Array<{
        batchItemId: string;
        item: FarmerPayableItem;
    }>): Promise<void>;
}
//# sourceMappingURL=settlement-calculation.service.d.ts.map