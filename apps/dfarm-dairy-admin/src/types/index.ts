// DFarm Dairy Admin Web — Core Domain Type Definitions
// Strictly typed according to the Greenfield Product Specification

export type MilkCategory = 'COW' | 'BUFFALO'
export type CustomerStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'DELETED'
export type ShiftType = 'MORNING' | 'EVENING'

// 1. Tenant & Dairy Profile
export interface DairyProfile {
  id: string
  dairyCode: string
  name: string
  registrationNumber: string
  ownerName: string
  primaryContactPhone: string
  contactEmail: string
  address: {
    village: string
    subDistrict: string
    district: string
    state: string
    pincode: string
  }
  operationalDetails: {
    morningShiftStart: string
    morningShiftEnd: string
    eveningShiftStart: string
    eveningShiftEnd: string
    activeMilkTypes: MilkCategory[]
    billingCycleDays: 7 | 10 | 15 | 30
    autoApproveBiometrics: false // Always requires Dairy Admin review
  }
  subscriptionTier: 'STANDARD_DAIRY' | 'ENTERPRISE_DAIRY'
  status: 'ACTIVE' | 'PENDING_SETUP' | 'SUSPENDED'
  createdAt: string
  updatedAt: string
}

// 2. Authentication & Admin Operator
export interface DairyAdminUser {
  id: string
  mobileNumber: string
  fullName: string
  dairyId: string
  dairyName: string
  dairyCode: string
  isPrimaryAdmin: boolean
  role: 'PRIMARY_DAIRY_ADMIN' | 'SHIFT_SUPERVISOR' | 'COLLECTION_OPERATOR' | 'ACCOUNTANT'
  permissions: Permission[]
  lastLoginAt: string
  sessionToken: string
}

export type Permission =
  | 'VIEW_DASHBOARD'
  | 'MANAGE_CUSTOMERS'
  | 'APPROVE_REGISTRATIONS'
  | 'MANAGE_FACE_ENROLLMENT'
  | 'MANAGE_RFID'
  | 'MANAGE_COLLECTIONS'
  | 'PERFORM_ADJUSTMENTS'
  | 'MANAGE_RATE_CHARTS'
  | 'VIEW_LEDGER'
  | 'PERFORM_LEDGER_ADJUSTMENT'
  | 'GENERATE_BILLS'
  | 'MANAGE_FEED_INVENTORY'
  | 'RECORD_FEED_SALES'
  | 'RECONCILE_PAYMENTS'
  | 'VIEW_REPORTS'
  | 'EXPORT_REPORTS'
  | 'MANAGE_DEVICES'
  | 'MANAGE_STAFF'
  | 'VIEW_AUDIT_LOGS'

// 3. Customer & Registration
export interface Customer {
  id: string
  dairyId: string
  customerCode: string // e.g. "C-104"
  fullName: string
  mobileNumber: string
  fatherOrHusbandName: string
  status: CustomerStatus
  preferredCategory: MilkCategory
  registrationDate: string
  village: string
  bankDetails?: {
    accountHolderName: string
    bankName: string
    accountNumber: string
    ifscCode: string
    upiId?: string
  }
  biometric: {
    faceEnrollmentStatus: FaceEnrollmentStatus
    faceEnrolledAt?: string
    faceModelVersion?: string
    consentEvidenceHash?: string
  }
  rfidCard?: {
    cardUid: string
    assignedAt: string
    status: 'ACTIVE' | 'LOST' | 'DISABLED' | 'REVOKED'
  }
  summary: {
    totalLitersDelivered: number
    pendingBalance: number
    totalFeedPurchased: number
    lastDeliveryDate?: string
  }
  isSoftDeleted: boolean
  deletedAt?: string
  deletedReason?: string
  auditCount: number
}

export interface CustomerRegistrationRequest {
  id: string
  dairyId: string
  candidateName: string
  mobileNumber: string
  submittedAt: string
  address: string
  village: string
  preferredCategory: MilkCategory
  bankDetails?: {
    accountNumber: string
    bankName: string
    ifscCode: string
  }
  faceCapture: {
    templateVersion: string
    modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0'
    consentTimestamp: string
    consentAgreed: boolean
    enrollmentStatus: FaceEnrollmentStatus
    qualityScore: number // e.g., 94.5%
    captureDevice: string
  }
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectionReason?: string
  reviewedBy?: string
  reviewedAt?: string
}

// 4. Face Enrollment Management
export type FaceEnrollmentStatus =
  | 'NOT_ENROLLED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RE_ENROLL_REQUESTED'
  | 'REJECTED'
  | 'REVOKED'

export interface FaceEnrollmentRecord {
  id: string
  customerId: string
  customerCode: string
  customerName: string
  dairyId: string
  status: FaceEnrollmentStatus
  modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0'
  templateVersion: number
  consentGiven: boolean
  consentTimestamp: string
  qualityScore: number
  enrolledAt: string
  approvedAt?: string
  approvedBy?: string
  revokedAt?: string
  revokedBy?: string
  revocationReason?: string
  reEnrollmentNote?: string
  auditLogs: {
    timestamp: string
    action: string
    operator: string
    note?: string
  }[]
}

// 5. RFID Card Management
export interface RfidCardRecord {
  id: string
  cardUid: string
  dairyId: string
  customerId?: string
  customerCode?: string
  customerName?: string
  status: 'ACTIVE' | 'LOST' | 'DISABLED' | 'REVOKED' | 'UNASSIGNED'
  issuedAt: string
  issuedBy: string
  lastScannedAt?: string
  lastScannedDevice?: string
  replacementOfCardUid?: string
  notes?: string
}

// 6. Collection Session Management
export interface CollectionSession {
  id: string
  sessionId: string // e.g. "SES-2026-11-15-M"
  dairyId: string
  date: string
  shift: ShiftType
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  closedAt?: string
  openingOperatorId: string
  openingOperatorName: string
  closingOperatorId?: string
  closingOperatorName?: string
  deviceId: string
  deviceName: string
  totals: {
    transactionCount: number
    totalLiters: number
    cowLiters: number
    buffaloLiters: number
    averageFat: number
    averageSnf: number
    totalAmount: number
  }
  syncStatus: 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR'
}

// 7. Milk Collection Transaction
export interface MilkCollectionTransaction {
  id: string
  transactionId: string // e.g. "TXN-78492"
  dairyId: string
  sessionId: string
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
  appliedRatePerLiter: number
  rateChartVersion: number
  rateChartId: string
  totalAmount: number
  deviceId: string
  operatorId: string
  status: 'CONFIRMED' | 'ADJUSTED' | 'FLAGGED'
  syncState: 'SYNCED' | 'OFFLINE_SYNCED' | 'PENDING'
  adjustment?: {
    adjustedAt: string
    adjustedBy: string
    originalWeight: number
    originalAmount: number
    reason: string
    adjustmentId: string
  }
}

// 8. Milk Quality Reading
export interface MilkQualityReading {
  id: string
  dairyId: string
  timestamp: string
  date: string
  shift: ShiftType
  customerCode: string
  customerName: string
  category: MilkCategory
  fat: number
  snf: number
  clrDensity: number
  temperatureCelsius: number
  adulterationStatus: 'CLEAN' | 'SUSPECTED_WATER' | 'SUSPECTED_CHEMICAL'
  readingValid: boolean
  sensorTelemetry: {
    opticalLactometerOk: boolean
    weightCellStable: boolean
  }
}

// 9. Milk Rate Chart
export interface RateChartCell {
  fat: number
  snf: number
  rate: number
}

export interface MilkRateChart {
  id: string
  dairyId: string
  title: string
  milkCategory: MilkCategory
  version: number
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'ARCHIVED'
  effectiveDate: string
  baseRatePerLiter: number
  minFat: number
  maxFat: number
  fatStep: number
  minSnf: number
  maxSnf: number
  snfStep: number
  rateMatrix: RateChartCell[]
  createdAt: string
  createdBy: string
  activatedAt?: string
  activatedBy?: string
  changeNotes: string
}

// 10. Customer Ledger
export type LedgerEntryType =
  | 'MILK_CREDIT'
  | 'FEED_DEBIT'
  | 'PAYMENT_RECEIVED'
  | 'AUTHORIZED_ADJUSTMENT'

export interface CustomerLedgerEntry {
  id: string
  dairyId: string
  customerId: string
  customerCode: string
  customerName: string
  timestamp: string
  date: string
  entryType: LedgerEntryType
  referenceType: 'COLLECTION_TX' | 'FEED_SALE' | 'PAYMENT_RECEIPT' | 'ADMIN_ADJUSTMENT'
  referenceId: string
  description: string
  debit: number // Amount owed by customer / deducted
  credit: number // Amount earned by customer / milk value
  runningBalance: number
  authorizedBy: string
  reason?: string
}

// 11. Billing and Monthly Settlement
export interface DairyBill {
  id: string
  billNumber: string // e.g. "BILL-2026-11-0042"
  dairyId: string
  customerId: string
  customerCode: string
  customerName: string
  periodStart: string
  periodEnd: string
  cycleName: string
  totalMilkVolumeLiters: number
  totalMilkAmount: number
  totalFeedDeduction: number
  otherAdjustments: number
  netPayableAmount: number
  amountPaid: number
  outstandingBalance: number
  status: 'GENERATED' | 'PARTIALLY_PAID' | 'SETTLED' | 'CANCELLED'
  generatedAt: string
  generatedBy: string
  settledAt?: string
  notes?: string
}

// 12. Feed Inventory and Sales
export interface FeedProduct {
  id: string
  dairyId: string
  sku: string
  name: string
  category: 'CATTLE_FEED_CONCENTRATE' | 'MINERAL_MIXTURE' | 'CALCIUM_SUPPLEMENT' | 'SILAGE' | 'FODDER_SEEDS'
  unit: 'BAG_50KG' | 'BAG_25KG' | 'CAN_5L' | 'KG' | 'PACKET'
  purchaseRate: number
  sellingRate: number
  availableStock: number
  minStockAlertLevel: number
  status: 'ACTIVE' | 'INACTIVE'
  description: string
  updatedAt: string
}

export interface FeedStockMovement {
  id: string
  dairyId: string
  productId: string
  productName: string
  movementType: 'PURCHASE_RESTOCK' | 'CUSTOMER_SALE' | 'DAMAGED_WRITE_OFF' | 'MANUAL_AUDIT_ADJUSTMENT'
  quantity: number
  previousStock: number
  resultingStock: number
  referenceId: string
  reason: string
  performedBy: string
  timestamp: string
}

export interface CustomerFeedSale {
  id: string
  dairyId: string
  saleId: string // e.g. "FEED-SALE-9402"
  customerId: string
  customerCode: string
  customerName: string
  productId: string
  productName: string
  quantity: number
  unit: string
  unitPrice: number
  totalAmount: number
  purchaseDate: string
  paymentMode: 'LEDGER_DEBIT' | 'CASH' | 'ONLINE'
  ledgerReferenceId?: string
  recordedBy: string
  notes?: string
}

// 13. Payments and Receipts
export interface PaymentRecord {
  id: string
  dairyId: string
  receiptNumber: string // e.g. "REC-8291"
  customerId: string
  customerCode: string
  customerName: string
  amount: number
  paymentDate: string
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'
  transactionReference: string
  linkedBillId?: string
  linkedLedgerEntryId: string
  status: 'SUCCESS' | 'RECONCILED' | 'FAILED' | 'VOID'
  bankAccountLast4?: string
  reconciledAt?: string
  verifiedBy: string
  notes?: string
}

export interface PaymentOverviewMetrics {
  totalPayableAmount: number
  totalPaidAmount: number
  paidCount: number
  pendingAmount: number
  pendingCount: number
  failedAmount: number
  failedCount: number
  unreconciledAmount: number
  unreconciledCount: number
}

export interface FarmerSettlementPreviewItem {
  customerId: string
  farmerCode: string
  fullName: string
  centerId: string
  centerName?: string
  bankName: string | null
  bankAccountNumberMask: string | null
  bankIfsc: string | null
  bankVerificationStatus: string
  beneficiaryStatus: string
  isBankValid: boolean
  bankValidationErrors: string[]
  openingBalance: number
  grossMilkAmount: number
  milkQuantityLiters: number
  collectionCount: number
  deductionsAmount: number
  adjustmentsCredit: number
  adjustmentsDebit: number
  alreadyPaidAmount: number
  pendingReservedAmount: number
  netPayableAmount: number
  remainingBalance: number
}

export interface SettlementCalculationPreview {
  organizationId: string
  centerId: string | null
  periodStart: string
  periodEnd: string
  calculatedAt: string
  calculationSnapshotHash: string
  totalFarmers: number
  totalEligibleFarmers: number
  totalMilkQuantityLiters: number
  totalGrossPayable: number
  totalDeductions: number
  totalNetPayable: number
  totalAlreadyPaid: number
  totalRemainingBalance: number
  warningsCount: number
  farmersWithInvalidBankCount: number
  centerBreakdowns: Array<{
    centerId: string
    centerName: string
    centerCode: string
    farmerCount: number
    eligibleCount: number
    totalMilkQuantity: number
    totalGrossPayable: number
    totalDeductions: number
    totalNetPayable: number
    totalAlreadyPaid: number
    totalRemainingBalance: number
  }>
  farmers: FarmerSettlementPreviewItem[]
}

export interface PaymentBatchRecord {
  id: string
  organizationId: string
  centerId: string | null
  batchNumber: string
  billingCycleId: string | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  paymentMethod: string
  status:
    | 'DRAFT'
    | 'CALCULATED'
    | 'UNDER_REVIEW'
    | 'APPROVED'
    | 'SUBMITTED'
    | 'SUBMITTED_TO_BANK'
    | 'PROCESSING'
    | 'SETTLED'
    | 'PAID'
    | 'PARTIALLY_SETTLED'
    | 'PARTIALLY_PAID'
    | 'FAILED'
    | 'UNKNOWN'
    | 'CANCELLED'
    | 'RECONCILED'
  totalBeneficiaries: number
  totalAmount: number
  successfulCount: number
  successfulAmount: number
  failedCount: number
  failedAmount: number
  pendingCount: number
  pendingAmount: number
  reconciliationStatus: string
  calculationSnapshotHash?: string
  bankName?: string
  bankChannel?: string
  bankBatchReference?: string
  bankSubmissionId?: string
  createdAt: string
  items?: PaymentBatchItemRecord[]
}

export interface PaymentBatchItemRecord {
  id: string
  payoutId: string
  customerId: string
  customerName: string
  farmerCode: string
  amount: number
  currency: string
  bankAccountMask: string | null
  bankIfsc: string | null
  status: string
  beneficiaryReference?: string
  bankUtr?: string
  failureReason?: string
  settledAt?: string
  grossPayable?: number
  totalDeductions?: number
  netPayable?: number
  remainingBalance?: number
}

// 14. Device Telemetry & Sync Monitoring
export interface CollectionDevice {
  id: string
  dairyId: string
  deviceId: string // e.g. "DF-KIOSK-001"
  deviceName: string
  deviceType: 'INTEGRATED_ANALYZER_KIOSK' | 'BLUETOOTH_DAIRY_POS' | 'WEIGHING_SCALE_STATION'
  ipAddress: string
  macAddress: string
  firmwareVersion: string
  faceModelCacheVersion: 'YuNet-v1.0 + SFace-INT8-v1.0'
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR'
  lastConnectedAt: string
  lastSyncAt: string
  pendingOfflineSyncEvents: number
  failedSyncEvents: number
  hardwareHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL'
  lastErrorMessage?: string
  locationAssigned: string
}

// 15. Staff & Operator Access
export interface StaffMember {
  id: string
  dairyId: string
  fullName: string
  mobileNumber: string
  role: 'PRIMARY_DAIRY_ADMIN' | 'SHIFT_SUPERVISOR' | 'COLLECTION_OPERATOR' | 'ACCOUNTANT'
  permissions: Permission[]
  isActive: boolean
  createdAt: string
  lastActiveAt?: string
  centerId?: string
  centerName?: string
  centerCode?: string
  counterName?: string
}

// 16. Audit Log
export interface AuditLogEntry {
  id: string
  dairyId: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: string
  action:
    | 'CUSTOMER_REGISTRATION_APPROVED'
    | 'CUSTOMER_REGISTRATION_REJECTED'
    | 'CUSTOMER_PROFILE_UPDATED'
    | 'CUSTOMER_SOFT_DELETED'
    | 'CUSTOMER_RESTORED'
    | 'FACE_ENROLLMENT_APPROVED'
    | 'FACE_ENROLLMENT_REVOKED'
    | 'FACE_RE_ENROLLMENT_REQUESTED'
    | 'RFID_CARD_ASSIGNED'
    | 'RFID_CARD_REVOKED'
    | 'RFID_CARD_MARKED_LOST'
    | 'COLLECTION_SESSION_OPENED'
    | 'COLLECTION_SESSION_CLOSED'
    | 'COLLECTION_RECORD_ADJUSTED'
    | 'RATE_CHART_CREATED'
    | 'RATE_CHART_ACTIVATED'
    | 'LEDGER_BALANCE_ADJUSTED'
    | 'BILL_GENERATED'
    | 'PAYMENT_RECORDED'
    | 'FEED_STOCK_RESTOCKED'
    | 'FEED_STOCK_ADJUSTED'
    | 'FEED_SOLD'
    | 'DEVICE_REGISTERED'
    | 'DEVICE_REVOKED'
    | 'STAFF_PERMISSIONS_UPDATED'
  targetEntity: string
  entityId: string
  details: string
  previousState?: Record<string, any>
  newState?: Record<string, any>
  reason?: string
}

// 17. Dairy Notifications
export interface DairyNotification {
  id: string
  dairyId: string
  title: string
  message: string
  category: 'REGISTRATION' | 'DEVICE' | 'SYNC' | 'INVENTORY' | 'BILLING' | 'PAYMENT'
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS'
  isRead: boolean
  createdAt: string
  actionUrl?: string
}

// 18. Dashboard Summary
export interface DashboardSummary {
  dairyProfile: {
    name: string
    code: string
    subscription: string
  }
  customers: {
    totalRegistered: number
    pendingApprovals: number
    activeToday: number
    newThisMonth: number
  }
  todayCollection: {
    totalLiters: number
    cowLiters: number
    buffaloLiters: number
    transactionCount: number
    totalAmount: number
    averageFat: number
    averageSnf: number
  }
  monthlyCollection: {
    totalLiters: number
    totalAmount: number
    shiftBreakdown: {
      morningLiters: number
      eveningLiters: number
    }
  }
  finance: {
    pendingCustomerBalances: number
    currentBillingCycleStatus: 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'READY_FOR_SETTLEMENT'
    totalPaymentsThisMonth: number
  }
  inventory: {
    totalProducts: number
    lowStockItemCount: number
    todayFeedSalesAmount: number
  }
  systemStatus: {
    activeSessionId?: string
    activeSessionShift?: ShiftType
    connectedDevicesCount: number
    offlineDevicesCount: number
    pendingSyncEventsCount: number
  }
}

// 15. Dairy Admin Realtime Dashboard & Station Monitoring Types
export interface DairyAdminMetrics {
  businessDate: string
  organizationId: string
  centerId: string | null
  totalMilkLiters: number
  totalAmount: number
  transactionCount: number
  cowLiters: number
  buffaloLiters: number
  activeSessionsCount: number
  totalStationsCount: number
  onlineStationsCount: number
  degradedStationsCount: number
  offlineStationsCount: number
  blockedStationsCount: number
  pendingSyncCount: number
  manualReviewCount: number
  rejectedCount: number
  lastCollectionTime: string | null
  lastUpdated: string
}

export interface CenterLiveMetric {
  centerId: string
  centerCode: string
  centerName: string
  status: 'OPEN' | 'CLOSED' | 'INACTIVE'
  activeSession: {
    sessionId: string
    shift: ShiftType
    openedAt: string
    operatorName: string
  } | null
  totalCollections: number
  totalLiters: number
  cowLiters: number
  buffaloLiters: number
  totalAmount: number
  latestCollectionTime: string | null
  activeStationsCount: number
  degradedStationsCount: number
  offlineStationsCount: number
  blockedStationsCount: number
  pendingSyncCount: number
  manualReviewCount: number
  rejectedCount: number
}

export interface LiveCollectionFeedItem {
  id: string
  collectionReference: string
  centerId: string
  centerCode: string
  centerName: string
  sessionId: string
  milkCategory: MilkCategory
  quantityLiters: number
  fatPercentage: number
  snfPercentage: number
  ratePerLiter: number
  totalAmount: number
  financialStatus: 'COMPLETED' | 'MANUAL_REVIEW' | 'REJECTED'
  syncStatus: 'SYNCED_CLOUD' | 'LOCAL_ONLY' | 'PENDING'
  isReplayed: boolean
  collectedAt: string
  farmerCode: string
  maskedFarmerName: string
}

export interface SessionMonitoringItem {
  sessionId: string
  centerId: string
  centerCode: string
  centerName: string
  deviceId: string
  deviceName: string
  businessDate: string
  shift: ShiftType
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  closedAt: string | null
  operatorId: string
  operatorName: string
  totalTransactions: number
  totalLiters: number
  cowLiters: number
  buffaloLiters: number
  totalAmount: number
  syncStatus: string
}

export type StationStatusClassification = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'BLOCKED' | 'UNKNOWN'

export interface StationMonitoringItem {
  deviceId: string
  deviceName: string
  deviceType: string
  centerId: string | null
  centerCode: string | null
  centerName: string | null
  registrationStatus: string
  isBlocked: boolean
  revokedAt: string | null
  revocationReason: string | null
  statusClassification: StationStatusClassification
  lastSeenAt: string | null
  lastHeartbeatAt: string | null
  lastSuccessfulSyncAt: string | null
  pendingQueueCount: number
  syncFailureCategory: string | null
  lastSyncError: string | null
  appVersion: string | null
  batteryLevel: number | null
  networkMode: string | null
  hardwareSerial: string | null
}

