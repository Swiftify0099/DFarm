// DFarm Collection App — Strict Domain Types
// Greenfield browser-based milk collection and hardware telemetry architecture

export type MilkCategory = 'COW' | 'BUFFALO'
export type ShiftType = 'MORNING' | 'EVENING'

// 1. Operator & Dairy Session
export interface OperatorSession {
  id: string
  mobileNumber: string
  fullName: string
  dairyId: string
  dairyName: string
  dairyCode: string
  centerId?: string
  centerCode?: string
  timezone?: string
  role: 'PRIMARY_DAIRY_ADMIN' | 'COLLECTION_OPERATOR' | 'SHIFT_SUPERVISOR' | 'SUPER_ADMIN'
  sessionToken: string
  activeSessionId?: string
}

export interface ActiveCollectionSession {
  id: string
  sessionCode: string
  dairyId: string
  centerId?: string
  date: string
  businessDate?: string
  timezone?: string
  shift: ShiftType
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  closedAt?: string
  openingOperatorName: string
  closingOperatorName?: string
  deviceId: string
  deviceName: string
  totals: {
    totalLiters: number
    cowLiters: number
    buffaloLiters: number
    transactionCount: number
    totalAmount: number
    averageFat: number
    averageSnf: number
  }
}

// 2. Customer Identity
export interface CustomerIdentity {
  id: string
  customerCode: string // e.g. "C-101"
  farmerCode?: string
  fullName: string
  mobileNumber: string
  village: string
  preferredCategory: MilkCategory
  permittedCategories?: MilkCategory[]
  dairyId?: string
  centerId?: string
  status: 'ACTIVE' | 'SUSPENDED'
  balanceDue: number
  biometric?: {
    templateVersion: string
    qualityScore: number
    modelVersion: string
    consentVerified: boolean
  }
  rfidCardUid?: string
  lastDelivery?: {
    date: string
    shift: ShiftType
    liters: number
  }
}

// 3. Face Recognition State Machine (OpenCV YuNet + SFace ONNX)
export type FaceRecognitionStatus =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'CONNECTING'
  | 'WAITING_FOR_VIDEO_METADATA'
  | 'STARTING_PLAYBACK'
  | 'INITIALIZATION_FAILED'
  | 'CAMERA_PERMISSION_REQUIRED'
  | 'CAMERA_UNAVAILABLE'
  | 'CAMERA_ALREADY_IN_USE'
  | 'CAMERA_STARTING'
  | 'CAMERA_READY'
  | 'MODELS_LOADING'
  | 'MODELS_READY'
  | 'WAITING_FOR_FACE'
  | 'NO_FACE_DETECTED'
  | 'FACE_DETECTED'
  | 'EMBEDDING_GENERATED'
  | 'MATCHING_CUSTOMER'
  | 'CUSTOMER_MATCHED'
  | 'UNKNOWN_PERSON'
  | 'CAMERA_ERROR'

export interface FaceDetectionBoundingBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  landmarks?: [number, number][] // 5 facial landmarks
}

export interface FaceRecognitionState {
  status: FaceRecognitionStatus
  boundingBox: FaceDetectionBoundingBox | null
  confidenceScore: number
  matchedCustomer: CustomerIdentity | null
  unknownPersonAlert: boolean
  modelLoaded: boolean
  latencyMs: number
}

// 4. RFID Card Reader State
export type RfidReaderStatus = 'IDLE' | 'READING' | 'MATCHED' | 'UNASSIGNED_CARD' | 'DISCONNECTED'

export interface RfidScanState {
  status: RfidReaderStatus
  cardUid: string | null
  matchedCustomer: CustomerIdentity | null
}

// 5. Milk Measurements & Hardware Readings
export interface MilkMeasurements {
  milkCategory: MilkCategory
  fat: number
  snf: number
  clrDensity: number
  temperatureCelsius: number
  weightLiters: number
  analyzerConnected: boolean
  scaleConnected: boolean
  scaleStable: boolean
  opticalLactometerOk: boolean
  readingsValid: boolean
  validationErrors: string[]
}

export type TransactionSyncStatus =
  | 'SYNCED_CLOUD'
  | 'PENDING_OFFLINE'
  | 'SYNCING'
  | 'RETRYABLE'
  | 'REJECTED'
  | 'AUTH_REQUIRED'
  | 'DEVICE_BLOCKED'
  | 'MANUAL_REVIEW'
  | 'SYNC_FAILED'
  | 'PENDING_SYNC'

// 6. Collection Transaction
export interface CollectionTransaction {
  id: string
  clientIntakeUuid?: string // Permanent client-generated RFC 4122 v4 UUID
  serverTransactionId?: string // Server-generated canonical transaction ID
  transactionCode: string // e.g. "TXN-A1B2C3D4" or "COL-20261115-001"
  receiptNumber?: string
  sessionId: string
  dairyId: string
  centerId?: string
  customerId: string
  customerCode: string
  customerName: string
  timestamp: string
  date: string
  shift: ShiftType
  milkCategory: MilkCategory
  weightLiters: number
  fatPercentage: number
  snfPercentage: number
  clrDensity: number
  appliedRatePerLiter: number
  rateChartVersion: number
  totalAmount: number
  identificationMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH'
  syncStatus: TransactionSyncStatus
  syncedAt?: string
  syncErrorCode?: string | null
  syncErrorMessage?: string | null
  offlineAuthorizationToken?: string
  deviceId: string
  operatorName: string
  idempotencyKey?: string
  offlineCreated?: boolean
}

// 7. Hardware Devices Telemetry
export type HardwareDeviceCategory =
  | 'CAMERA'
  | 'FACE_MODEL'
  | 'RFID_READER'
  | 'MILK_ANALYZER'
  | 'DIGITAL_SCALE'
  | 'CLOUD_NETWORK'

export interface HardwareDevice {
  id: string
  name: string
  category: HardwareDeviceCategory
  connectionType: 'BROWSER_MEDIA' | 'WASM_ONNX' | 'WEB_SERIAL' | 'WEB_HID' | 'NETWORK_HTTPS'
  status: 'CONNECTED' | 'DISCONNECTED' | 'MEASURING' | 'ERROR'
  portOrEndpoint: string
  baudRate?: number
  lastReading?: string
  lastPing: string
  errorMessage: string | null
}

// 8. Offline Queue Item & Queue State Machine
export type SyncQueueStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'RETRYABLE'
  | 'REJECTED'
  | 'AUTH_REQUIRED'
  | 'DEVICE_BLOCKED'
  | 'MANUAL_REVIEW'
  | 'QUEUED' // backwards-compatibility alias for PENDING
  | 'FAILED' // backwards-compatibility alias for RETRYABLE
  | 'RESOLVED' // backwards-compatibility alias for SYNCED

export interface OfflineQueueItem {
  eventId: string
  transactionId: string
  clientIntakeUuid: string
  customerCode: string
  customerName: string
  timestamp: string
  retryCount: number
  status: SyncQueueStatus
  syncQueueStatus?: SyncQueueStatus
  errorReason: string | null
  lastError?: string | null
  errorCode?: string | null
  lastAttemptedAt?: string | null
  lastAttemptAt?: string | null
  nextRetryAt?: string | null
  nextAttemptAt?: string | null
  rejectionTimestamp?: string | null
  transaction: CollectionTransaction
  offlineAuthorizationToken?: string
}

export interface QueueSummary {
  total: number
  pending: number
  syncing: number
  synced: number
  retryable: number
  rejected: number
  manualReview: number
  authRequired?: number
  deviceBlocked?: number
}

export type NetworkStatus =
  | 'ONLINE'
  | 'BROWSER_OFFLINE'
  | 'BACKEND_UNREACHABLE'
  | 'AUTH_EXPIRED'
  | 'DEVICE_BLOCKED'

export interface SyncEngineStatus {
  isSyncing: boolean
  state: 'IDLE' | 'SYNCING' | 'BACKOFF' | 'PAUSED' | 'AUTH_REQUIRED' | 'DEVICE_BLOCKED'
  pendingCount: number
  syncingCount: number
  syncedCount: number
  retryableCount: number
  rejectedCount: number
  manualReviewCount: number
  lastSyncTime: string | null
  lastSyncError: string | null
  lastSyncErrorCode: string | null
  nextRetryScheduledAt: string | null
  currentBatchSize: number
  lastSyncedAt?: string | null
  recordsSyncedLastRun?: number
  lastErrorMessage?: string | null
  currentBackoffSeconds?: number
}

// 9. Rate Matrix & Cache
export interface RateMatrixConfig {
  version: number
  milkCategory: MilkCategory
  baseRatePerLiter: number
  effectiveDate: string
}

export interface RateChartCacheItem {
  id: string // e.g. `rc_${dairyId}_${explicitScope}_${centerIdOrOrg}_${chartId}_${versionNumber}_${versionId}`
  dairyId: string
  centerId?: string | null
  chartId?: string
  versionId?: string
  versionNumber?: number
  centerScope: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC'
  isOrganizationWide?: boolean
  milkCategory: MilkCategory
  pricingType?: 'GRID' | 'TWO_AXIS_FORMULA' | 'TOTAL_SOLIDS_FORMULA' | 'FORMULA'
  version: number
  effectiveFrom: string
  effectiveTo?: string
  baseFat: number
  baseSnf: number
  baseRate: number
  calculationFormula?: string
  ratePerFatUnit?: number
  ratePerSnfUnit?: number
  fatFactor?: number
  snfFactor?: number
  minFat?: number
  maxFat?: number
  minSnf?: number
  maxSnf?: number
  gridMatrix?: Record<string, Record<string, number>>
  cells?: Array<{ fat: number; snf: number; ratePerLiter: number }>
  etag?: string
  updatedAt: string
}

export interface RateCalculationResult {
  ratePerLiter: number
  version: number
  isValid: boolean
  error?: string
  rateChartId?: string
}

// 9b. Storage Quota & Persistence Status
export interface StorageQuotaStatus {
  isPersisted: boolean
  usageBytes: number
  quotaBytes: number
  percentageUsed: number
  isWarning: boolean
  isCritical: boolean
}

export interface SyncMetadataItem {
  key: string
  value: any
  updatedAt: string
}

// 10. Single Active Collection State Machine
export type CollectionWorkflowState =
  | 'IDLE'
  | 'SCANNING'
  | 'CUSTOMER_MATCHED'
  | 'ANNOUNCING'
  | 'WAITING_FOR_FAT'
  | 'FAT_CAPTURED'
  | 'WAITING_FOR_SNF'
  | 'SNF_CAPTURED'
  | 'WAITING_FOR_WEIGHT'
  | 'WEIGHT_CAPTURED'
  | 'VALIDATING'
  | 'SAVING'
  | 'COMMITTED'
  | 'WAITING_FOR_FACE_CLEAR'

export interface CollectionAttemptSession {
  attemptId: string
  customer: CustomerIdentity
  identificationMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH'
  state: CollectionWorkflowState
  matchedAt: string
  announced: boolean
  fat: number | null
  fatCapturedAt: string | null
  snf: number | null
  snfCapturedAt: string | null
  clrDensity: number | null
  weightLiters: number | null
  weightCapturedAt: string | null
  scaleStable: boolean
  appliedRatePerLiter: number | null
  totalAmount: number | null
  rateChartVersion: number | null
  errorReason: string | null
  transaction: CollectionTransaction | null
}

