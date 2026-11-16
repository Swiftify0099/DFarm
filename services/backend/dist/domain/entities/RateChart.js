import { Money } from '../value-objects/index.js';
export class RateChart {
    props;
    constructor(props) {
        this.props = {
            ...props,
            fatFactor: props.fatFactor ?? (props.milkCategory === 'COW' ? 4.2 : 5.0),
            snfFactor: props.snfFactor ?? (props.milkCategory === 'COW' ? 3.5 : 4.0),
            cells: props.cells || [],
        };
    }
    get version() {
        return this.props.version;
    }
    get versionId() {
        return this.props.versionId;
    }
    get milkCategory() {
        return this.props.milkCategory;
    }
    calculateRate(fat, snf) {
        const roundedFat = Math.round(fat * 10) / 10;
        const roundedSnf = Math.round(snf * 10) / 10;
        // 1. Check if exact cell exists in matrix
        const exactCell = this.props.cells?.find((c) => Math.abs(c.fat - roundedFat) < 0.05 && Math.abs(c.snf - roundedSnf) < 0.05);
        if (exactCell) {
            const rate = exactCell.ratePerLiter;
            return {
                ratePerLiter: rate,
                rule: 'EXACT_GRID_CELL',
                totalForVolume: (vol) => new Money(vol * rate).value,
            };
        }
        // 2. If pricingType is GRID and no cells exist, or cell missing, use Two-Axis Formula Fallback
        const baseFat = this.props.milkCategory === 'COW' ? 3.5 : 6.0;
        const baseSnf = this.props.milkCategory === 'COW' ? 8.5 : 9.0;
        const fatDiff = roundedFat - baseFat;
        const snfDiff = roundedSnf - baseSnf;
        const calculated = this.props.baseRatePerLiter +
            fatDiff * (this.props.fatFactor || 4.2) +
            snfDiff * (this.props.snfFactor || 3.5);
        // Biological floor rate to protect farmer
        const rate = Math.max(15.0, new Money(calculated).value);
        return {
            ratePerLiter: rate,
            rule: 'TWO_AXIS_FORMULA_FALLBACK',
            totalForVolume: (vol) => new Money(vol * rate).value,
        };
    }
}
//# sourceMappingURL=RateChart.js.map