export interface RateMatrixCell {
    fat: number;
    snf: number;
    ratePerLiter: number;
}
export interface RateChartProps {
    id: string;
    organizationId: string;
    centerId?: string | null;
    name: string;
    milkCategory: 'COW' | 'BUFFALO';
    pricingType: 'GRID' | 'FORMULA';
    version: number;
    versionId: string;
    baseRatePerLiter: number;
    fatFactor?: number;
    snfFactor?: number;
    cells?: RateMatrixCell[];
    isActive: boolean;
    effectiveFrom: string;
}
export declare class RateChart {
    private props;
    constructor(props: RateChartProps);
    get version(): number;
    get versionId(): string;
    get milkCategory(): 'COW' | 'BUFFALO';
    calculateRate(fat: number, snf: number): {
        ratePerLiter: number;
        totalForVolume: (volume: number) => number;
        rule: string;
    };
}
//# sourceMappingURL=RateChart.d.ts.map