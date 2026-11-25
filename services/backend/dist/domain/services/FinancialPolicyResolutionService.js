import { superAdminRepo } from '../../infrastructure/repositories/PostgresSuperAdminRepository.js';
import { roundHalfUp } from '@dfarm/shared-types';
export { roundHalfUp };
export class FinancialPolicyResolutionService {
    /**
     * Resolves the active PUBLISHED global rate policy version effective on the given business date.
     * Quarantines DRAFT, EXPIRED, ARCHIVED, and SUPERSEDED versions.
     */
    async resolveEffectiveGlobalRatePolicy(businessDate, milkCategory) {
        try {
            const policies = await superAdminRepo.listGlobalRatePolicies();
            const targetDate = new Date(businessDate).getTime();
            for (const policy of policies) {
                if (!policy.isActive)
                    continue;
                for (const v of policy.versions || []) {
                    if (v.status !== 'PUBLISHED')
                        continue;
                    const fromTime = new Date(v.effectiveFrom).getTime();
                    const toTime = v.effectiveTo ? new Date(v.effectiveTo).getTime() : Infinity;
                    if (targetDate >= fromTime && targetDate <= toTime) {
                        // Check if this policy has procurement floor price parameters
                        let floorRate;
                        if (v.parameters) {
                            if (milkCategory === 'COW') {
                                floorRate = v.parameters.floorPriceCow ?? v.parameters.minimumPricePerLiter ?? v.parameters.mspPrice;
                            }
                            else {
                                floorRate = v.parameters.floorPriceBuffalo ?? v.parameters.minimumPricePerLiter ?? v.parameters.mspPrice;
                            }
                        }
                        const numFloor = floorRate ? Number(floorRate) : undefined;
                        return {
                            policyId: policy.id,
                            versionId: v.id,
                            policyType: policy.policyType,
                            procurementFloorRate: numFloor,
                            statutoryFloorRate: numFloor,
                        };
                    }
                }
            }
        }
        catch {
            // Fallback: If control plane is in-memory double or unreachable, proceed gracefully
        }
        return null;
    }
    /**
     * Resolves the active PUBLISHED global FAT/SNF adjustment policy version effective on the date.
     */
    async resolveEffectiveGlobalFatSnfPolicy(businessDate, milkCategory) {
        try {
            const policies = await superAdminRepo.listGlobalFatSnfPolicies();
            const targetDate = new Date(businessDate).getTime();
            for (const policy of policies) {
                if (!policy.isActive)
                    continue;
                for (const v of policy.versions || []) {
                    if (v.status !== 'PUBLISHED')
                        continue;
                    const fromTime = new Date(v.effectiveFrom).getTime();
                    const toTime = v.effectiveTo ? new Date(v.effectiveTo).getTime() : Infinity;
                    if (targetDate >= fromTime && targetDate <= toTime) {
                        if (v.milkCategory === 'BOTH' || v.milkCategory === milkCategory) {
                            return {
                                policyId: policy.id,
                                versionId: v.id,
                                roundingPolicy: v.roundingPolicy || 'NEAREST_TWO_DECIMALS',
                                fatAdjustmentRules: v.fatAdjustmentRules || [],
                                snfAdjustmentRules: v.snfAdjustmentRules || [],
                            };
                        }
                    }
                }
            }
        }
        catch { }
        return null;
    }
    /**
     * Deterministic Authoritative Calculation Engine.
     * Evaluates Dairy Rate Chart + Global FAT/SNF adjustments + Global Statutory MSP Floor.
     */
    async calculateAuthoritativePrice(params) {
        const { rateChart, milkCategory, weightLiters, fatPercentage, snfPercentage, businessDate } = params;
        // 1. Calculate Base Rate from Dairy Rate Chart (Grid lookup or two-axis formula)
        const baseCalc = rateChart.calculateRate(fatPercentage, snfPercentage);
        let currentRate = baseCalc.ratePerLiter;
        let qualityDeduction = 0.00;
        // 2. Resolve & Apply Global FAT/SNF Adjustment Policy (if published)
        const fatSnfPolicy = await this.resolveEffectiveGlobalFatSnfPolicy(businessDate, milkCategory);
        let roundingMethod = 'NEAREST_TWO_DECIMALS';
        if (fatSnfPolicy) {
            roundingMethod = fatSnfPolicy.roundingPolicy;
            // Evaluate FAT adjustment rules
            for (const rule of fatSnfPolicy.fatAdjustmentRules) {
                if (fatPercentage >= rule.minFat && fatPercentage <= rule.maxFat) {
                    if (rule.deductionPerPoint > 0) {
                        qualityDeduction += rule.deductionPerPoint;
                    }
                }
            }
            // Evaluate SNF adjustment rules
            for (const rule of fatSnfPolicy.snfAdjustmentRules) {
                if (snfPercentage >= rule.minSnf && snfPercentage <= rule.maxSnf) {
                    if (rule.deductionPerPoint > 0) {
                        qualityDeduction += rule.deductionPerPoint;
                    }
                }
            }
            currentRate = Math.max(0.00, currentRate - qualityDeduction);
            // Apply Rounding Policy to intermediate rate
            if (roundingMethod === 'ROUND_DOWN') {
                currentRate = Math.floor(currentRate * 100) / 100;
            }
            else if (roundingMethod === 'ROUND_UP') {
                currentRate = Math.ceil(currentRate * 100) / 100;
            }
            else {
                // NEAREST_TWO_DECIMALS with strict half-up
                currentRate = roundHalfUp(currentRate, 2);
            }
        }
        // 3. Resolve & Enforce Procurement Price Floor (Authorized Dairy / Federation floor benchmark)
        // Note: The Government of India does not regulate milk procurement prices (PIB 2287066, DAHD).
        const ratePolicy = await this.resolveEffectiveGlobalRatePolicy(businessDate, milkCategory);
        let floorApplied = false;
        const floorRate = ratePolicy?.procurementFloorRate ?? ratePolicy?.statutoryFloorRate;
        if (floorRate !== undefined && floorRate > 0) {
            if (currentRate < floorRate) {
                currentRate = floorRate;
                floorApplied = true;
            }
        }
        // 4. Exact Paise-Level Final Amount Calculation using standard commercial ROUND_HALF_UP
        const totalAmount = roundHalfUp(weightLiters * currentRate, 2);
        const snapshot = {
            rateChartId: rateChart.props?.id || rateChart.id || 'DEFAULT_CHART',
            rateChartVersion: rateChart.version,
            globalRatePolicyId: ratePolicy?.policyId,
            globalRatePolicyVersionId: ratePolicy?.versionId,
            globalRatePolicyType: ratePolicy?.policyType,
            fatSnfPolicyId: fatSnfPolicy?.policyId,
            fatSnfPolicyVersionId: fatSnfPolicy?.versionId,
            rawFat: fatPercentage,
            rawSnf: snfPercentage,
            weightLiters,
            baseRatePerLiter: baseCalc.ratePerLiter,
            qualityDeductionApplied: qualityDeduction,
            procurementFloorApplied: floorApplied,
            procurementFloorRate: floorRate,
            statutoryMinimumApplied: floorApplied,
            statutoryFloorRate: floorRate,
            finalRatePerLiter: currentRate,
            totalAmount,
            roundingMethod,
            calculatedAt: new Date().toISOString(),
        };
        return {
            ratePerLiter: currentRate,
            totalAmount,
            snapshot,
        };
    }
}
export const financialPolicyResolutionService = new FinancialPolicyResolutionService();
//# sourceMappingURL=FinancialPolicyResolutionService.js.map