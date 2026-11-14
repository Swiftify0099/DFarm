export type CustomerStatus =
  | 'DRAFT'
  | 'PENDING_FACE_ENROLLMENT'
  | 'PENDING_RFID_ASSIGNMENT'
  | 'PENDING_SYNC'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'REJECTED'
  | 'SOFT_DELETED';

export type MilkCategory = 'COW' | 'BUFFALO';

export type IdentificationMethod = 'FACE' | 'RFID' | 'SUPERVISOR_MANUAL';

export type Shift = 'MORNING' | 'EVENING';

export type SessionState =
  | 'WAITING_FOR_CUSTOMER'
  | 'CUSTOMER_IDENTIFIED'
  | 'CUSTOMER_VERIFIED'
  | 'CATEGORY_PENDING'
  | 'CATEGORY_SELECTED'
  | 'SESSION_CREATED'
  | 'WAITING_FOR_MEASUREMENTS'
  | 'MEASUREMENTS_RECEIVED'
  | 'VALIDATING'
  | 'READY_FOR_REVIEW'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'INCOMPLETE'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING_SYNC';

export type ReadingSource =
  | 'MANUAL_ENTRY'
  | 'AUTOMATED_ANALYZER'
  | 'AUTOMATED_SCALE'
  | 'TEST_FIXTURE';

export type ValidationStatus = 'PENDING' | 'VALID' | 'INVALID' | 'OVERRIDDEN';

export type MeasurementUnit = 'KG' | 'LITRE';

export interface Customer {
  id: string;
  organizationId: string;
  primaryCenterId: string;
  farmerCode: string;
  fullName: string;
  mobileNumber: string;
  status: CustomerStatus;
  permittedCategories: MilkCategory[];
  rfidCardId?: string | null;
  isDeleted?: boolean;
}

export interface MilkQualityMeasurement {
  fatPercentage: number;
  snfPercentage: number;
  clr?: number | null;
  timestamp?: number;
  source?: ReadingSource;
  validationStatus?: ValidationStatus;
  sessionUuid: string;
}

export interface MilkWeightMeasurement {
  grossWeight?: number | null;
  tareWeight?: number | null;
  netWeight: number;
  unit?: MeasurementUnit;
  timestamp?: number;
  source?: ReadingSource;
  validationStatus?: ValidationStatus;
  sessionUuid: string;
}

export interface RateCalculationResult {
  rateVersionId: string;
  rateVersionNumber: number;
  rateChartId: string;
  appliedRate: number;
  quantity: number;
  totalAmount: number;
  calculationRule: string;
  roundingMode: string;
}

export interface CollectionSession {
  sessionUuid: string;
  customerUuid: string;
  organizationId: string;
  centerId: string;
  deviceId: string;
  identificationMethod: IdentificationMethod;
  milkCategory: MilkCategory;
  shift: Shift;
  businessDate: string;
  startedAt?: number;
  completedAt?: number | null;
  state: SessionState;
  idempotencyReference: string;
  qualityMeasurement?: MilkQualityMeasurement | null;
  weightMeasurement?: MilkWeightMeasurement | null;
  rateCalculation?: RateCalculationResult | null;
  cancellationReason?: string | null;
}

export interface CollectionReceipt {
  receiptNumber: string;
  sessionUuid: string;
  businessDate: string;
  shift: Shift;
  centerName: string;
  operatorName: string;
  customerCode: string;
  customerName: string;
  identificationMethod: IdentificationMethod;
  milkCategory: MilkCategory;
  weightKg: number;
  fatPercentage: number;
  snfPercentage: number;
  ratePerUnit: number;
  totalAmount: number;
  timestamp: number;
  verificationHash: string;
}

export interface CenterValidationLimits {
  cowFatMin: number;
  cowFatMax: number;
  cowSnfMin: number;
  cowSnfMax: number;
  buffaloFatMin: number;
  buffaloFatMax: number;
  buffaloSnfMin: number;
  buffaloSnfMax: number;
  minWeightKg: number;
  maxWeightKg: number;
  isApproved?: boolean;
  configurationStatus?: string;
  limitsVersion?: string;
}

export const DEFAULT_CENTER_LIMITS: CenterValidationLimits = {
  cowFatMin: 2.8,
  cowFatMax: 6.0,
  cowSnfMin: 7.8,
  cowSnfMax: 10.2,
  buffaloFatMin: 5.0,
  buffaloFatMax: 12.0,
  buffaloSnfMin: 8.2,
  buffaloSnfMax: 11.5,
  minWeightKg: 0.5,
  maxWeightKg: 200.0,
  isApproved: false,
  configurationStatus: 'PENDING_OWNER_APPROVAL',
  limitsVersion: 'v1.0-draft',
};

// API Models
export interface AssignedCenter {
  centerId: string;
  centerName: string;
  centerCode: string;
}

export interface OfficerProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  centerId?: string | null;
  assignedCenters: AssignedCenter[];
}

export interface LoginResponse {
  success: boolean;
  token?: string | null;
  officer?: OfficerProfile | null;
  message?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T | null;
  message?: string | null;
  error?: {
    code?: string;
    message?: string;
    details?: string;
  } | null;
}

export interface CustomerDto {
  id: string;
  organizationId?: string | null;
  primaryCenterId?: string | null;
  farmerCode?: string | null;
  fullName: string;
  mobileNumber?: string | null;
  normalizedMobileNumber?: string | null;
  status: string;
  permittedCategories: string[];
  isDeleted?: boolean;
}

export interface CustomerListResponse {
  items: CustomerDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IdentificationCustomerDto {
  id: string;
  fullName: string;
  farmerCode?: string | null;
  status: string;
  permittedCategories: string[];
}

export interface IdentificationResponseDto {
  success: boolean;
  sessionId?: string | null;
  currentState?: string | null;
  customerUuid?: string | null;
  method?: string | null;
  message?: string | null;
  rejectionReason?: string | null;
  customer?: IdentificationCustomerDto | null;
}

export interface CreateSessionRequest {
  customerId: string;
  centerId: string;
  identificationMethod: string;
  milkCategory: string;
  shift?: string | null;
  businessDate?: string | null;
  deviceId?: string;
  intakeSequenceUuid?: string | null;
}

export interface CreateSessionResponseDto {
  sessionId: string;
  centerId: string;
  customerId: string;
  customerName?: string | null;
  farmerCode?: string | null;
  businessDate?: string | null;
  shiftType?: string | null;
  selectedMilkCategory: string;
  identificationMethod: string;
  sessionState: string;
  intakeSequenceUuid?: string | null;
}

export interface CalculateRateRequest {
  centerId?: string | null;
  milkCategory: string;
  fat: number;
  snf: number;
  netWeight: number;
  businessDate?: string | null;
  measurementUnit?: string;
}

export interface CalculateRateResponseDto {
  rateVersionId?: string | null;
  rateVersionNumber?: number | null;
  rateChartId?: string | null;
  appliedRate: number;
  quantity: number;
  totalAmount: number;
  calculationRule: string;
  roundingMode: string;
}

export interface CompleteSessionRequest {
  clientIntakeUuid: string;
  idempotencyKey: string;
  netWeight: number;
  fatPercentage: number;
  snfPercentage: number;
  source?: string;
  deviceId?: string;
}

export interface CompleteSessionResponseDto {
  session?: {
    id: string;
    session_state: string;
  } | null;
  collection?: {
    id: string;
    total_amount: number;
  } | null;
  ledger?: {
    newBalance?: number | null;
    previousBalance?: number | null;
  } | null;
  receipt?: {
    receiptNumber: string;
  } | null;
  status?: string;
}

export interface ReceiptResponseDto {
  receiptText: string;
}

export interface CollectionHistoryItemDto {
  id: string;
  customer_id: string;
  farmer_code?: string | null;
  customer_name?: string | null;
  selected_milk_category: string;
  shift_type: string;
  business_date: string;
  session_state: string;
  net_weight?: number | null;
  fat_percentage?: number | null;
  snf_percentage?: number | null;
  applied_rate_per_unit?: number | null;
  total_amount?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ShiftSummaryDto {
  centerId?: string | null;
  shift: string;
  businessDate: string;
  totalCollections: number;
  totalWeightKg: number;
  averageFat: number;
  averageSnf: number;
  totalAmount: number;
}

// Offline Database Entities
export interface CachedCustomer {
  customerId: string;
  farmerCode: string;
  fullName: string;
  mobileNumber: string;
  primaryCenterId: string;
  status: string;
  isDeleted: boolean;
  isRevoked: boolean;
  version: number;
  updatedAt: number;
  permittedCategories: string[];
  rfidCardId?: string | null;
}

export interface CachedFaceTemplate {
  id: string;
  customerId: string;
  modelVersion: string;
  cryptoNonce: string;
  authTag: string;
  encryptedEmbedding: string;
  status: string;
  updatedAt: number;
}

export interface CachedRateCell {
  id: string;
  rateChartVersionId: string;
  fatPercentage: number;
  snfPercentage: number;
  ratePerUnit: number;
  updatedAt: number;
}

export interface LocalCollectionSession {
  sessionId: string;
  customerId: string;
  centerId: string;
  deviceId: string;
  businessDate: string;
  shiftType: string;
  milkCategory: string;
  identificationMethod: string;
  intakeSequenceUuid: string;
  sessionState: string;
  startedAt: number;
  completedAt?: number | null;
}

export interface LocalMilkCollection {
  collectionId: string;
  sessionId: string;
  customerId: string;
  centerId: string;
  businessDate: string;
  shiftType: string;
  milkCategory: string;
  netWeight: number;
  fatPercentage: number;
  snfPercentage: number;
  appliedRatePerUnit: number;
  totalAmount: number;
  idempotencyKey: string;
  syncStatus: string;
  createdAt: number;
  syncedAt?: number | null;
}

export interface SyncJournalEvent {
  eventId: string;
  entityType: string;
  entityId: string;
  action: string;
  idempotencyKey: string;
  payloadJson: string;
  syncStatus: string;
  retryCount: number;
  lastError?: string | null;
  createdAt: number;
  syncedAt?: number | null;
}

export interface RevocationTombstone {
  tombstoneId: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  revokedAt: number;
}

export interface DeviceSyncState {
  deviceId: string;
  lastSyncTimestamp: number;
  serverCustomerCursor: number;
  serverTombstoneCursor: number;
  maxOfflineHours: number;
  deviceStatus: string;
}

export interface SyncPushRequest {
  deviceId: string;
  centerId: string;
  events: Array<{
    eventId: string;
    entityType: string;
    action: string;
    idempotencyKey: string;
    payload: any;
  }>;
}

export interface SyncPushResponseDto {
  applied: number;
  results: Array<{
    eventId: string;
    status: string;
    error?: string | null;
  }>;
}

export interface SyncAcknowledgeRequest {
  deviceId: string;
  eventIds: string[];
}

export interface UserMeResponse {
  user: {
    id: string;
    email: string;
    full_name?: string | null;
    role: string;
    organization_id: string;
    center_id?: string | null;
  };
  assignedCenters?: Array<{
    centerId: string;
    centerName: string;
    centerCode?: string | null;
  }>;
}
