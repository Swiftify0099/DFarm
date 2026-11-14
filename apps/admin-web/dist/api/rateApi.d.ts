export interface RateChart {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    milkCategory: 'COW' | 'BUFFALO';
    pricingFormula: string;
    minFat: number;
    maxFat: number;
    minSnf: number;
    maxSnf: number;
    fatStep: number;
    snfStep: number;
    status: string;
    activeVersionId?: string;
    createdAt: string;
}
export interface RateChartVersion {
    id: string;
    rateChartId: string;
    versionNumber: number;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
    effectiveFrom: string;
    effectiveTo?: string | null;
    baseRatePerUnit: number;
    pricingModel: string;
    cellsCount?: number;
    createdBy: string;
    approvedBy?: string | null;
    publishedBy?: string | null;
    publishedAt?: string | null;
    createdAt: string;
    cells?: RateMatrixCell[];
}
export interface RateMatrixCell {
    fat: number;
    snf: number;
    ratePerUnit: number;
}
export declare const rateApi: {
    listCharts: (params?: {
        centerId?: string;
        milkCategory?: string;
    }) => Promise<RateChart[]>;
    createChart: (data: any) => Promise<RateChart>;
    getChart: (rateChartId: string) => Promise<RateChart>;
    listVersions: (rateChartId: string) => Promise<RateChartVersion[]>;
    createVersion: (rateChartId: string, data: any) => Promise<RateChartVersion>;
    getVersion: (rateChartId: string, versionId: string) => Promise<RateChartVersion>;
    updateMatrixCells: (rateChartId: string, versionId: string, cells: RateMatrixCell[]) => Promise<any>;
    previewCalculation: (rateChartId: string, versionId: string, data: {
        fat: number;
        snf: number;
        netWeight: number;
    }) => Promise<any>;
    submitVersion: (rateChartId: string, versionId: string) => Promise<any>;
    approveVersion: (rateChartId: string, versionId: string) => Promise<any>;
    publishVersion: (rateChartId: string, versionId: string) => Promise<any>;
    calculate: (data: {
        centerId?: string;
        milkCategory: string;
        fat: number;
        snf: number;
        netWeight: number;
        businessDate?: string;
    }) => Promise<any>;
};
//# sourceMappingURL=rateApi.d.ts.map