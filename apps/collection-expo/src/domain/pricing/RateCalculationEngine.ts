import { MilkCategory, RateCalculationResult } from '../../types';

export interface RateCell {
  fatPercentage: number;
  snfPercentage: number;
  ratePerUnit: number;
}

export interface RateChartVersion {
  id: string;
  rateChartId: string;
  versionNumber: number;
  milkCategory: MilkCategory;
  isApproved: boolean;
  effectiveFrom: number;
  effectiveTo?: number | null;
  cells: RateCell[];
}

export class RateCellNotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateCellNotFoundException';
  }
}

/**
 * Banker's Rounding (Round Half to Even)
 * Matches Java BigDecimal.setScale(scale, RoundingMode.HALF_EVEN)
 */
export function roundHalfEven(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  const n = value * factor;
  const floor = Math.floor(n);
  const diff = n - floor;

  if (Math.abs(diff - 0.5) < 1e-9) {
    // Exactly halfway: round to nearest even number
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(n) / factor;
}

export class RateCalculationEngine {
  /**
   * Resolves exact rate from approved chart cells.
   * Throws RateCellNotFoundException if the exact Fat/SNF cell is not found.
   * No invented rates, no silent rounding of rates, no interpolation unless configured.
   */
  calculateRate(
    version: RateChartVersion,
    fat: number,
    snf: number,
    quantityKg: number
  ): RateCalculationResult {
    if (!version.isApproved) {
      throw new Error(
        `Rate chart version ${version.versionNumber} is not approved for production use`
      );
    }

    const roundedFat = Math.round(fat * 10) / 10;
    const roundedSnf = Math.round(snf * 10) / 10;

    const matchingCell = version.cells.find(
      (c) =>
        Math.abs(c.fatPercentage - roundedFat) < 0.001 &&
        Math.abs(c.snfPercentage - roundedSnf) < 0.001
    );

    if (!matchingCell) {
      throw new RateCellNotFoundException(
        `Controlled Pricing Error: No approved rate cell found for ${version.milkCategory} at Fat: ${roundedFat}%, SNF: ${roundedSnf}% in version ${version.versionNumber}`
      );
    }

    const appliedRate = matchingCell.ratePerUnit;
    const totalAmount = roundHalfEven(quantityKg * appliedRate, 2);

    return {
      rateVersionId: version.id,
      rateVersionNumber: version.versionNumber,
      rateChartId: version.rateChartId,
      appliedRate,
      quantity: quantityKg,
      totalAmount,
      calculationRule: 'EXACT_FAT_SNF_MATRIX_CELL',
      roundingMode: 'HALF_EVEN_2_DECIMALS',
    };
  }
}
