import {
  CenterValidationLimits,
  MeasurementUnit,
  MilkCategory,
  MilkQualityMeasurement,
  MilkWeightMeasurement,
  DEFAULT_CENTER_LIMITS,
} from '../../types';

export enum HardwareConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  DEFERRED_HARDWARE_BOUNDARY = 'DEFERRED_HARDWARE_BOUNDARY',
}

export interface ValidationOutcome {
  isValid: boolean;
  errors: string[];
}

export class MeasurementValidationEngine {
  static validateQuality(
    measurement: MilkQualityMeasurement,
    category: MilkCategory,
    limits: CenterValidationLimits = DEFAULT_CENTER_LIMITS
  ): ValidationOutcome {
    const errors: string[] = [];

    if (measurement.fatPercentage <= 0.0) {
      errors.push(
        `Fat percentage must be strictly positive (got ${measurement.fatPercentage})`
      );
    }
    if (measurement.snfPercentage <= 0.0) {
      errors.push(
        `SNF percentage must be strictly positive (got ${measurement.snfPercentage})`
      );
    }

    if (category === 'COW') {
      if (
        measurement.fatPercentage < limits.cowFatMin ||
        measurement.fatPercentage > limits.cowFatMax
      ) {
        errors.push(
          `Cow Fat ${measurement.fatPercentage}% is outside approved biological limits [${limits.cowFatMin} - ${limits.cowFatMax}%]`
        );
      }
      if (
        measurement.snfPercentage < limits.cowSnfMin ||
        measurement.snfPercentage > limits.cowSnfMax
      ) {
        errors.push(
          `Cow SNF ${measurement.snfPercentage}% is outside approved biological limits [${limits.cowSnfMin} - ${limits.cowSnfMax}%]`
        );
      }
    } else if (category === 'BUFFALO') {
      if (
        measurement.fatPercentage < limits.buffaloFatMin ||
        measurement.fatPercentage > limits.buffaloFatMax
      ) {
        errors.push(
          `Buffalo Fat ${measurement.fatPercentage}% is outside approved biological limits [${limits.buffaloFatMin} - ${limits.buffaloFatMax}%]`
        );
      }
      if (
        measurement.snfPercentage < limits.buffaloSnfMin ||
        measurement.snfPercentage > limits.buffaloSnfMax
      ) {
        errors.push(
          `Buffalo SNF ${measurement.snfPercentage}% is outside approved biological limits [${limits.buffaloSnfMin} - ${limits.buffaloSnfMax}%]`
        );
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  static validateWeight(
    measurement: MilkWeightMeasurement,
    limits: CenterValidationLimits = DEFAULT_CENTER_LIMITS
  ): ValidationOutcome {
    const errors: string[] = [];

    if (measurement.netWeight <= 0.0) {
      errors.push(
        `Net weight must be strictly positive (got ${measurement.netWeight})`
      );
    }
    if (measurement.netWeight < limits.minWeightKg) {
      errors.push(
        `Weight ${measurement.netWeight} kg is below minimum deliverable intake ${limits.minWeightKg} kg`
      );
    }
    if (measurement.netWeight > limits.maxWeightKg) {
      errors.push(
        `Weight ${measurement.netWeight} kg exceeds maximum single intake limit ${limits.maxWeightKg} kg`
      );
    }
    if (measurement.unit && measurement.unit !== 'KG') {
      errors.push('Weight must be recorded in KG (no silent unit conversion)');
    }

    return { isValid: errors.length === 0, errors };
  }
}

/**
 * Production Manual Measurement Providers:
 * Strict boundary where physical analyzer hardware is deferred.
 * Accepts genuine manual operator input and marks source = MANUAL_ENTRY.
 */
export class ProductionManualQualityProvider {
  private pendingFat: number | null = null;
  private pendingSnf: number | null = null;
  private pendingClr: number | null = null;

  setManualInput(fat: number, snf: number, clr?: number | null) {
    this.pendingFat = fat;
    this.pendingSnf = snf;
    this.pendingClr = clr ?? null;
  }

  readQuality(sessionUuid: string): {
    success: boolean;
    measurement?: MilkQualityMeasurement;
    error?: string;
  } {
    if (this.pendingFat === null || this.pendingSnf === null) {
      return {
        success: false,
        error: 'MEASUREMENT SOURCE NOT CONNECTED. Manual entry required.',
      };
    }
    return {
      success: true,
      measurement: {
        fatPercentage: this.pendingFat,
        snfPercentage: this.pendingSnf,
        clr: this.pendingClr,
        source: 'MANUAL_ENTRY',
        sessionUuid,
        validationStatus: 'PENDING',
      },
    };
  }

  getMeasurementStatus(): HardwareConnectionStatus {
    return HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY;
  }
}

export class ProductionManualWeightProvider {
  private pendingWeight: number | null = null;

  setManualInput(weight: number) {
    this.pendingWeight = weight;
  }

  readWeight(sessionUuid: string): {
    success: boolean;
    measurement?: MilkWeightMeasurement;
    error?: string;
  } {
    if (this.pendingWeight === null) {
      return {
        success: false,
        error: 'MEASUREMENT SOURCE NOT CONNECTED. Manual entry required.',
      };
    }
    return {
      success: true,
      measurement: {
        netWeight: this.pendingWeight,
        unit: 'KG',
        source: 'MANUAL_ENTRY',
        sessionUuid,
        validationStatus: 'PENDING',
      },
    };
  }

  getMeasurementStatus(): HardwareConnectionStatus {
    return HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY;
  }
}
