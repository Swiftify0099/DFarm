import { MilkCategory, RateSyncResponseDTO, CenterScope } from '@dfarm/shared-types';
import type { RateChartDTO, RateChartVersionDTO, RateCalculationResultDTO } from '@dfarm/shared-types';
export declare class RateService {
    /**
     * List rate charts with center scope, version counts, and active version info.
     */
    static listRateCharts(organizationId: string, centerId?: string, milkCategory?: MilkCategory): Promise<RateChartDTO[]>;
    /**
     * Get single rate chart by ID.
     */
    static getRateChartById(rateChartId: string, organizationId: string): Promise<RateChartDTO>;
    /**
     * Create a new rate chart.
     */
    static createRateChart(organizationId: string, dto: {
        name: string;
        milkCategory: MilkCategory;
        centerScope?: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC';
        centerId?: string | null;
        pricingType?: string;
        description?: string | null;
    }, createdBy: string): Promise<RateChartDTO>;
    /**
     * List versions of a rate chart.
     */
    static listRateChartVersions(rateChartId: string, organizationId: string): Promise<RateChartVersionDTO[]>;
    /**
     * Get single rate chart version with its complete cell matrix.
     */
    static getRateChartVersion(rateChartId: string, versionId: string, organizationId: string): Promise<RateChartVersionDTO>;
    /**
     * Create a new version for a rate chart. Starts in DRAFT status.
     */
    static createRateChartVersion(rateChartId: string, organizationId: string, dto: {
        effectiveFrom: string;
        effectiveTo?: string | null;
        pricingUnit?: string;
        measurementUnit?: string;
        notes?: string | null;
        fatMin?: number | null;
        fatMax?: number | null;
        snfMin?: number | null;
        snfMax?: number | null;
    }, createdBy: string): Promise<RateChartVersionDTO>;
    /**
     * Configure matrix cells for a DRAFT version.
     * STRICT IMMUTABILITY: Cannot modify an already PUBLISHED version!
     */
    static updateMatrixCells(rateChartId: string, versionId: string, organizationId: string, cells: Array<{
        fatPercentage: number;
        snfPercentage: number;
        ratePerUnit: number;
    }>, updatedBy: string): Promise<{
        versionId: string;
        cellCount: number;
        isValid: boolean;
    }>;
    /**
     * Preview calculation against a specific version (DRAFT or published).
     */
    static previewCalculation(_rateChartId: string, versionId: string, dto: {
        fat: number;
        snf: number;
        netWeight: number;
        measurementUnit?: string;
    }): Promise<{
        versionId: string;
        fat: number;
        snf: number;
        netWeight: number;
        measurementUnit: string;
        pricingUnit: string;
        appliedRate: number;
        totalAmount: number;
        calculationRule: string;
    }>;
    /**
     * Submit version for approval (transitions DRAFT -> SUBMITTED).
     */
    static submitForApproval(rateChartId: string, versionId: string, organizationId: string, submittedBy: string): Promise<RateChartVersionDTO>;
    /**
     * Approve rate chart version (requires Dairy Owner / Admin role).
     */
    static approveVersion(rateChartId: string, versionId: string, organizationId: string, approvedBy: string): Promise<RateChartVersionDTO>;
    /**
     * Publish rate chart version:
     * Calls publish_rate_chart_version RPC, supersedes earlier versions,
     * enforces immutability, and emits sync event.
     */
    static publishVersion(rateChartId: string, versionId: string, organizationId: string, publishedBy: string): Promise<any>;
    /**
     * Retrieves active approved rate chart and version for a given center and milk category.
     * Priority:
     * 1. rate_applicability_rules matching center_id
     * 2. Center-specific chart
     * 3. Organization-wide chart (center_id IS NULL)
     */
    static getActiveRateVersion(centerId: string, organizationId: string, milkCategory: MilkCategory, effectiveDate?: string): Promise<any>;
    /**
     * Authoritative backend rate calculation.
     * STRICT ENFORCEMENT:
     * - Canonical unit is KILOGRAM (KG).
     * - Explicit quantity unit verification.
     * - Exact matrix cell lookup; NO guessing, NO interpolation.
     * - Returns RATE_CELL_NOT_FOUND (404) on missing cell.
     * - Half-Even banker's rounding to 2 decimals.
     */
    static calculateRate(centerId: string, organizationId: string, milkCategory: MilkCategory, fat: number, snf: number, netWeight: number, overrideVersionId?: string, businessDate?: string, explicitUnit?: string): Promise<RateCalculationResultDTO>;
    /**
     * Generates a deterministic, composite cache key for rate matrix caches.
     * Encodes: tenant (organizationId), explicit scope, center identity, chart identity, and version identity.
     * Guarantees strict isolation across organizations, scopes, centers, and published versions.
     */
    static getRateCacheKey(params: {
        organizationId: string;
        scope: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC';
        centerId?: string | null;
        chartId: string;
        versionNumber: number;
        milkCategory: 'COW' | 'BUFFALO';
    }): string;
    /**
     * Complete Rate Matrix Delivery for Offline Sync (Prompt 4)
     * Fetches full active rate charts with exact GRID matrix cells or FORMULA factors.
     * Priority: Center-specific override first, dairy-wide fallback second.
     */
    static getSyncRateCharts(organizationId: string, centerId?: string | null, businessDate?: string, scope?: CenterScope): Promise<RateSyncResponseDTO>;
    /**
     * Validate offline rate calculation against authoritative historical rate version (Prompt 4).
     * Strict invariants:
     * - Must belong to the organization
     * - Must be effective on collection businessDate
     * - Must match exact GRID cell if pricingType is GRID
     * - Must match formula if pricingType is FORMULA
     * - Total amount must match banker's rounding of netWeight * rate
     */
    static validateHistoricalRate(params: {
        organizationId: string;
        centerId?: string | null;
        milkCategory: 'COW' | 'BUFFALO';
        fat: number;
        snf: number;
        weightLiters: number;
        ratePerLiter: number;
        totalAmount: number;
        businessDate: string;
        rateChartVersionId?: string;
        rateChartId?: string;
        rateChartVersionNumber?: number;
    }): Promise<{
        isValid: boolean;
        rateChartVersionId: string;
        versionNumber: number;
        authoritativeRate: number;
        authoritativeTotal: number;
        errorCode?: string;
        errorMessage?: string;
    }>;
}
//# sourceMappingURL=rate.service.d.ts.map