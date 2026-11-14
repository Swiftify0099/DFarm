/**
 * DFarm Manual Entry Hardware Providers
 *
 * Software fallback providers implementing WeightScaleProvider and MilkAnalyzerProvider.
 * Mirrors Kotlin ProductionManualWeightProvider / ProductionManualQualityProvider from
 * MeasurementProviders.kt, with DEFERRED_HARDWARE_BOUNDARY status and explicit labeling.
 *
 * These providers accept operator manual input and NEVER fabricate automated device signals.
 */

import {
  HardwareConnectionStatus,
  MilkAnalyzerProvider,
  QualityReading,
  WeightReading,
  WeightScaleProvider,
} from './HardwareServiceTypes';

// ---------------------------------------------------------------------------
// ManualEntryWeightProvider
// ---------------------------------------------------------------------------

export class ManualEntryWeightProvider implements WeightScaleProvider {
  readonly sourceLabel = 'MANUAL_ENTRY — PHYSICAL SCALE NOT CONNECTED';
  readonly isPhysicalDevice = false;

  private pendingWeight: number | null = null;

  /** Call before readWeight() to set the operator-entered value. */
  setManualWeight(weight: number): void {
    this.pendingWeight = weight;
  }

  getConnectionStatus(): HardwareConnectionStatus {
    return 'DEFERRED_HARDWARE_BOUNDARY';
  }

  async connect(): Promise<{ success: boolean; error?: string }> {
    // No physical device — connection is always vacuously satisfied for manual entry.
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.pendingWeight = null;
  }

  async readWeight(sessionId: string): Promise<WeightReading | { error: string; code: string }> {
    const weight = this.pendingWeight;

    if (weight === null) {
      return {
        error: 'MEASUREMENT SOURCE NOT CONNECTED. Manual weight entry required.',
        code: 'NO_WEIGHT_READING',
      };
    }

    // Validation: weight must be > 0 and < 200 kg per Indian dairy center intake norms.
    if (weight <= 0) {
      return {
        error: `Net weight must be strictly positive (got ${weight} KG)`,
        code: 'WEIGHT_BELOW_MINIMUM',
      };
    }
    if (weight >= 200) {
      return {
        error: `Net weight ${weight} KG exceeds maximum single intake limit 200 KG`,
        code: 'WEIGHT_ABOVE_MAXIMUM',
      };
    }

    // Clear pending so a re-read without new input returns an error (no silent re-use).
    this.pendingWeight = null;

    const reading: WeightReading = {
      netWeight: weight,
      unit: 'KG',
      source: 'MANUAL_ENTRY',
      sessionId,
      isStable: true,
      timestamp: Date.now(),
    };
    return reading;
  }
}

// ---------------------------------------------------------------------------
// ManualEntryMilkAnalyzerProvider
// ---------------------------------------------------------------------------

export class ManualEntryMilkAnalyzerProvider implements MilkAnalyzerProvider {
  readonly sourceLabel = 'MANUAL_ENTRY — PHYSICAL ANALYZER NOT CONNECTED';
  readonly isPhysicalDevice = false;

  private pendingFat: number | null = null;
  private pendingSnf: number | null = null;

  /** Call before readQuality() to set operator-entered fat and SNF values. */
  setManualInput(fat: number, snf: number): void {
    this.pendingFat = fat;
    this.pendingSnf = snf;
  }

  getConnectionStatus(): HardwareConnectionStatus {
    return 'DEFERRED_HARDWARE_BOUNDARY';
  }

  async connect(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.pendingFat = null;
    this.pendingSnf = null;
  }

  async readQuality(
    sessionId: string
  ): Promise<QualityReading | { error: string; code: string }> {
    const fat = this.pendingFat;
    const snf = this.pendingSnf;

    if (fat === null || snf === null) {
      return {
        error: 'MEASUREMENT SOURCE NOT CONNECTED. Manual fat/SNF entry required.',
        code: 'NO_QUALITY_READING',
      };
    }

    // Fat validation: 0.1 – 10.0 %  (covers both cow and buffalo biological limits)
    if (fat < 0.1 || fat > 10.0) {
      return {
        error: `Fat percentage ${fat}% is outside accepted biological limits [0.1 – 10.0%]`,
        code: 'FAT_OUT_OF_RANGE',
      };
    }

    // SNF validation: 5.0 – 15.0 %
    if (snf < 5.0 || snf > 15.0) {
      return {
        error: `SNF percentage ${snf}% is outside accepted biological limits [5.0 – 15.0%]`,
        code: 'SNF_OUT_OF_RANGE',
      };
    }

    // Clear pending — no silent re-use.
    this.pendingFat = null;
    this.pendingSnf = null;

    const reading: QualityReading = {
      fatPercentage: fat,
      snfPercentage: snf,
      source: 'MANUAL_ENTRY',
      sessionId,
      isComplete: true,
      timestamp: Date.now(),
    };
    return reading;
  }
}
