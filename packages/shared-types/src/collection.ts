import { MilkCategory, IdentificationMethod, SessionType, ReadingSource } from './enums.js';

export type QualityValidationStatus = 'VALID' | 'OUT_OF_BOUNDS_OVERRIDDEN' | 'SUSPICIOUS' | 'PENDING';
export type WeightValidationStatus = 'VALID' | 'OUT_OF_BOUNDS_OVERRIDDEN' | 'SUSPICIOUS' | 'PENDING';
export type MeasurementUnit = 'KG' | 'LITERS';

export interface MilkQualityMeasurement {
  fatPercentage: number;
  snfPercentage: number;
  densityClr?: number;
  validationStatus: QualityValidationStatus;
  readingSource: ReadingSource;
  timestamp: string;
  deviceId?: string;
  sessionId?: string;
}

export interface MilkWeightMeasurement {
  grossWeight?: number;
  tareWeight?: number;
  netWeight: number;
  measurementUnit: MeasurementUnit;
  validationStatus: WeightValidationStatus;
  readingSource: ReadingSource;
  timestamp: string;
  deviceId?: string;
  sessionId?: string;
}

export interface RateCalculationResult {
  rateChartId: string;
  rateChartVersionId: string;
  versionNumber: number;
  appliedRatePerUnit: number;
  totalAmount: number;
  calculationMethod: 'GRID' | 'FORMULA';
  fatPercentage: number;
  snfPercentage: number;
  netWeight: number;
  roundingInfo: {
    mode: 'ROUND_HALF_UP';
    decimals: 2;
  };
}

export interface CollectionReceipt {
  receiptNumber: string;
  collectionId: string;
  sessionUuid: string;
  organizationName: string;
  centerName: string;
  centerCode: string;
  customerName: string;
  farmerCode: string;
  customerUuid: string;
  businessDate: string;
  shiftType: SessionType;
  milkCategory: MilkCategory;
  netWeight: number;
  measurementUnit: MeasurementUnit;
  fatPercentage: number;
  snfPercentage: number;
  appliedRate: number;
  totalAmount: number;
  identificationMethod: IdentificationMethod;
  transactionStatus: 'COMPLETED' | 'ADJUSTED' | 'REVERSED';
  operatorName: string;
  timestamp: string;
}

export interface SupervisorAdjustmentPayload {
  collectionId: string;
  supervisorId: string;
  reason: string;
  adjustedNetWeight?: number;
  adjustedFatPercentage?: number;
  adjustedSnfPercentage?: number;
  adjustmentType: 'CORRECTION' | 'FULL_REVERSAL';
}

export interface ShiftSummary {
  centerId: string;
  businessDate: string;
  shiftType: SessionType;
  totalDeliveries: number;
  cowDeliveries: number;
  buffaloDeliveries: number;
  totalCowWeight: number;
  totalBuffaloWeight: number;
  totalWeight: number;
  avgCowFat: number;
  avgCowSnf: number;
  avgBuffaloFat: number;
  avgBuffaloSnf: number;
  totalAmount: number;
}

// ==============================================================================
// Prompt 4 / 4.2: Bulk Collection Sync Gateway & Offline Session Authorization
// ==============================================================================

export interface OfflineSessionAuthorizationPayload {
  authorizationId: string;
  version: 1;
  organizationId: string;
  centerId: string;
  sessionId: string;
  sessionCode: string;
  businessDate: string;
  shift: 'MORNING' | 'EVENING';
  deviceIdentifier: string;
  operatorId: string;
  operatorName?: string;
  timezone: string;
  validFrom: string;
  validUntil: string;
  issuedAt: string;
  maxReconciliationDays?: number;
}

export interface OfflineSessionAuthorizationDTO {
  token: string;
  payload: OfflineSessionAuthorizationPayload;
}

export interface BulkCollectionItemDTO {
  clientIntakeUuid: string;
  idempotencyKey: string;
  customerId: string;
  sessionId?: string;
  sessionCode?: string;
  centerId?: string;
  milkCategory: MilkCategory;
  quantityLiters?: number;
  weightLiters?: number;
  fat?: number;
  fatPercentage?: number;
  snf?: number;
  snfPercentage?: number;
  clrDensity?: number;
  collectionTimestamp: string;
  businessDate: string;
  shift?: SessionType | string;
  rateChartId?: string;
  rateChartVersionId?: string;
  rateChartVersion?: number;
  ratePerLiter: number;
  totalAmount: number;
  identificationMethod?: IdentificationMethod | string;
  deviceId?: string;
  offlineAuthorizationToken?: string;
}

export interface BulkCollectionSyncRequestDTO {
  batchId: string;
  schemaVersion: number;
  deviceId?: string;
  offlineAuthorizationToken?: string;
  transactions: BulkCollectionItemDTO[];
}

export type BulkItemSyncStatus = 'ACCEPTED' | 'REPLAYED' | 'REJECTED' | 'RETRYABLE';

export interface BulkCollectionResultItemDTO {
  clientIntakeUuid: string;
  idempotencyKey: string;
  status: BulkItemSyncStatus;
  serverTransactionId?: string;
  receiptNumber?: string;
  isIdempotentReplay: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface BulkCollectionSyncResponseDTO {
  batchId: string;
  requestId: string;
  summary: {
    received: number;
    accepted: number;
    replayed: number;
    rejected: number;
    retryable: number;
  };
  results: BulkCollectionResultItemDTO[];
}

