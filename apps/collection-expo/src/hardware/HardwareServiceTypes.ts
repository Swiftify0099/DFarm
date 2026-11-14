/**
 * DFarm Hardware Service Types
 * Typed interfaces mirroring Kotlin MeasurementProviders.kt HardwareConnectionStatus enum.
 * Parity with: apps/collection-app/.../MeasurementProviders.kt
 */

export type HardwareConnectionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'NOT_CONFIGURED'
  | 'DEFERRED_HARDWARE_BOUNDARY'
  | 'PERMISSION_DENIED'
  | 'PAIRING_REQUIRED';

export interface WeightReading {
  netWeight: number;
  unit: 'KG' | 'L';
  source: 'SCALE_USB_SERIAL' | 'SCALE_BLUETOOTH' | 'MANUAL_ENTRY' | 'TEST_FIXTURE';
  sessionId: string;
  isStable: boolean;
  timestamp: number;
}

export interface QualityReading {
  fatPercentage: number;
  snfPercentage: number;
  density?: number;
  waterContent?: number;
  source: 'ANALYZER_USB_SERIAL' | 'ANALYZER_BLUETOOTH' | 'MANUAL_ENTRY' | 'TEST_FIXTURE';
  sessionId: string;
  isComplete: boolean;
  timestamp: number;
}

export interface WeightScaleProvider {
  readonly sourceLabel: string;
  readonly isPhysicalDevice: boolean;
  getConnectionStatus(): HardwareConnectionStatus;
  connect(): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  readWeight(sessionId: string): Promise<WeightReading | { error: string; code: string }>;
}

export interface MilkAnalyzerProvider {
  readonly sourceLabel: string;
  readonly isPhysicalDevice: boolean;
  getConnectionStatus(): HardwareConnectionStatus;
  connect(): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  readQuality(sessionId: string): Promise<QualityReading | { error: string; code: string }>;
}

export interface ThermalPrinterProvider {
  readonly sourceLabel: string;
  readonly isPhysicalDevice: boolean;
  getConnectionStatus(): HardwareConnectionStatus;
  connect(): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  printReceipt(receiptLines: string[]): Promise<{ success: boolean; error?: string }>;
}
