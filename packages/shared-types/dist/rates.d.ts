export type RateVersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
export type PricingUnit = 'PER_KG' | 'PER_LITER';
export type CanonicalQuantityUnit = 'KG' | 'LITERS';
export type CenterScope = 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC';
export interface RateChartDTO {
    id: string;
    organizationId: string;
    centerId: string | null;
    name: string;
    milkCategory: 'COW' | 'BUFFALO';
    pricingType: 'GRID' | 'TOTAL_SOLIDS_FORMULA' | 'TWO_AXIS_FORMULA';
    centerScope: CenterScope;
    isActive: boolean;
    description?: string | null;
    createdAt: string;
    versionsCount?: number;
    activeVersion?: RateChartVersionDTO | null;
}
export interface RateChartCellDTO {
    id?: string;
    rateChartVersionId?: string;
    fatPercentage: number;
    snfPercentage: number;
    ratePerUnit: number;
}
export interface RateChartVersionDTO {
    id: string;
    rateChartId: string;
    versionNumber: number;
    status: RateVersionStatus;
    effectiveFrom: string;
    effectiveTo: string | null;
    pricingUnit: PricingUnit;
    measurementUnit: CanonicalQuantityUnit;
    fatMin?: number | null;
    fatMax?: number | null;
    snfMin?: number | null;
    snfMax?: number | null;
    isApproved: boolean;
    approvedBy?: string | null;
    approvedAt?: string | null;
    submittedBy?: string | null;
    submittedAt?: string | null;
    publishedBy?: string | null;
    publishedAt?: string | null;
    notes?: string | null;
    cellCount?: number;
    cells?: RateChartCellDTO[];
    createdAt: string;
    updatedAt: string;
}
export interface RateMatrixValidationResult {
    isValid: boolean;
    totalCells: number;
    fatRange: {
        min: number;
        max: number;
        count: number;
    };
    snfRange: {
        min: number;
        max: number;
        count: number;
    };
    missingCells: Array<{
        fat: number;
        snf: number;
    }>;
    duplicateCells: Array<{
        fat: number;
        snf: number;
    }>;
    errors: string[];
}
export interface RateCalculationRequestDTO {
    centerId: string;
    milkCategory: 'COW' | 'BUFFALO';
    fat: number;
    snf: number;
    netWeight: number;
    measurementUnit?: CanonicalQuantityUnit;
    businessDate?: string;
    versionId?: string;
}
export interface RateCalculationResultDTO {
    rateChartId: string;
    rateChartName: string;
    rateVersionId: string;
    rateVersionNumber: number;
    milkCategory: 'COW' | 'BUFFALO';
    fatPercentage: number;
    snfPercentage: number;
    netWeight: number;
    appliedRate: number;
    pricingUnit: PricingUnit;
    measurementUnit: CanonicalQuantityUnit;
    totalAmount: number;
    calculationRule: 'EXACT_FAT_SNF_MATRIX_CELL';
    roundingMode: 'HALF_EVEN_2_DECIMALS';
}
export interface FaceCalibrationConfigDTO {
    modelName: string;
    modelVersion: string;
    embeddingDimension: number;
    similarityMetric: 'COSINE';
    recommendedThreshold: number;
    modelArtifactChecksum: string;
    artifactStatus: 'VERIFIED' | 'UNVERIFIED_EMPTY_DIGEST' | 'MISSING';
    calibrationStatus: 'CALIBRATED_STAGING_v1' | 'STAGING_UNVERIFIED' | 'PRODUCTION_APPROVED';
    isApprovedForProduction: boolean;
    failSafeBehavior: 'REJECT_OR_FALLBACK_TO_RFID';
}
export interface OfflineAuthorizationPolicyDTO {
    centerId?: string;
    deviceId?: string;
    isApproved: boolean;
    approvedMaxOfflineHours: number | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    status: 'APPROVED' | 'MISSING_OWNER_APPROVAL' | 'REJECTED';
}
export interface RateSyncChartDTO {
    chartId: string;
    versionId: string;
    versionNumber: number;
    name: string;
    milkCategory: 'COW' | 'BUFFALO';
    pricingType: 'GRID' | 'TWO_AXIS_FORMULA' | 'TOTAL_SOLIDS_FORMULA' | 'FORMULA';
    centerScope: CenterScope;
    centerId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    baseRate: number;
    baseFat: number;
    baseSnf: number;
    fatFactor?: number;
    snfFactor?: number;
    fatMin?: number;
    fatMax?: number;
    snfMin?: number;
    snfMax?: number;
    formulaDefinition?: FormulaDefinition | null;
    cells: Array<{
        fat: number;
        snf: number;
        ratePerLiter: number;
    }>;
    gridMatrix: Record<string, Record<string, number>>;
    cellCount: number;
}
export interface FormulaDefinition {
    fatFactor: number;
    snfFactor: number;
    baseFat?: number;
    baseSnf?: number;
    baseRate?: number;
    minRate?: number;
    maxRate?: number;
}
export interface RateSyncResponseDTO {
    organizationId: string;
    centerId?: string | null;
    scope?: CenterScope;
    syncedAt: string;
    charts: RateSyncChartDTO[];
}
//# sourceMappingURL=rates.d.ts.map