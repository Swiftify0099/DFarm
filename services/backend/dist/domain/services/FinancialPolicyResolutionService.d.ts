import { RateChart } from '../entities/RateChart.js';
import { roundHalfUp } from '@dfarm/shared-types';
export { roundHalfUp };
export interface PricingCalculationSnapshot {
    rateChartId: string;
    rateChartVersion: number;
    globalRatePolicyId?: string;
    globalRatePolicyVersionId?: string;
    globalRatePolicyType?: string;
    fatSnfPolicyId?: string;
    fatSnfPolicyVersionId?: string;
    rawFat: number;
    rawSnf: number;
    weightLiters: number;
    baseRatePerLiter: number;
    qualityDeductionApplied: number;
    /**
     * Authorized Dairy / Federation Procurement Price Floor.
     * Note: The Government of India does not regulate milk procurement prices and does not
     * administer a statutory MSP for milk (confirmed via DAHD PIB release 2287066, 21 July 2026).
     */
    procurementFloorApplied: boolean;
    procurementFloorRate?: number;
    /** Backward-compatible aliases for legacy consumers */
    statutoryMinimumApplied: boolean;
    statutoryFloorRate?: number;
    finalRatePerLiter: number;
    totalAmount: number;
    roundingMethod: string;
    calculatedAt: string;
}
export declare class FinancialPolicyResolutionService {
    /**
     * Resolves the active PUBLISHED global rate policy version effective on the given business date.
     * Quarantines DRAFT, EXPIRED, ARCHIVED, and SUPERSEDED versions.
     */
    resolveEffectiveGlobalRatePolicy(businessDate: string, milkCategory: 'COW' | 'BUFFALO'): Promise<{
        policyId?: string;
        versionId?: string;
        policyType?: string;
        procurementFloorRate?: number;
        statutoryFloorRate?: number;
    } | null>;
    /**
     * Resolves the active PUBLISHED global FAT/SNF adjustment policy version effective on the date.
     */
    resolveEffectiveGlobalFatSnfPolicy(businessDate: string, milkCategory: 'COW' | 'BUFFALO'): Promise<{
        policyId?: string;
        versionId?: string;
        roundingPolicy: 'NEAREST_TWO_DECIMALS' | 'ROUND_DOWN' | 'ROUND_UP';
        fatAdjustmentRules: Array<{
            minFat: number;
            maxFat: number;
            deductionPerPoint: number;
            description?: string;
        }>;
        snfAdjustmentRules: Array<{
            minSnf: number;
            maxSnf: number;
            deductionPerPoint: number;
            description?: string;
        }>;
    } | null>;
    /**
     * Deterministic Authoritative Calculation Engine.
     * Evaluates Dairy Rate Chart + Global FAT/SNF adjustments + Global Statutory MSP Floor.
     */
    calculateAuthoritativePrice(params: {
        rateChart: RateChart;
        milkCategory: 'COW' | 'BUFFALO';
        weightLiters: number;
        fatPercentage: number;
        snfPercentage: number;
        businessDate: string;
    }): Promise<{
        ratePerLiter: number;
        totalAmount: number;
        snapshot: PricingCalculationSnapshot;
    }>;
}
export declare const financialPolicyResolutionService: FinancialPolicyResolutionService;
//# sourceMappingURL=FinancialPolicyResolutionService.d.ts.map