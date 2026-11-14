import { z } from 'zod';
import {
  MilkCategory,
  CustomerStatus,
  IdentificationMethod,
  SessionType,
  RfidTechnology,
  RfidCardStatus,
  SupervisorReasonCategory,
  SupervisorAuthMethod,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
  PaymentBatchStatus,
  ReconciliationStatus,
  BillingCycleType,
  BillingPeriodStatus,
  BillStatus,
  EmploymentStatus,
  EmploymentType,
  EmployeeShiftType,
  AttendanceStatus,
  LeaveType,
  LeaveStatus,
  SalaryCalculationBasis,
  EmployeeAdvanceStatus,
  PayrollRunStatus,
  PayslipPaymentStatus,
  SalaryPaymentMethod,
  SalaryPaymentStatus,
  UserRole,
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
  CommunicationConsentType,
} from '@dfarm/shared-types';

export const E164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Must be a valid E.164 normalized phone number (e.g. +919876543210)');

/**
 * Normalizes an RFID UID into canonical uppercase hexadecimal string.
 * Strips colons, hyphens, and whitespace.
 * e.g. "04:a1:b2:c3:d4" -> "04A1B2C3D4"
 */
export function normalizeRfidUid(rawUid: string): string {
  if (!rawUid || typeof rawUid !== 'string') {
    throw new Error('RFID UID must be a non-empty string');
  }
  const normalized = rawUid.trim().replace(/[:\s-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{4,64}$/.test(normalized)) {
    throw new Error(`Invalid RFID UID format: "${rawUid}". Must be 4 to 64 hexadecimal characters.`);
  }
  return normalized;
}

export const RfidUidSchema = z
  .string()
  .min(4, 'RFID UID must be at least 4 characters')
  .max(64, 'RFID UID cannot exceed 64 characters')
  .transform(val => normalizeRfidUid(val));

export const CustomerAddressSchema = z.object({
  village: z.string().min(1).max(100),
  hamletArea: z.string().max(100).nullable().optional(),
  talukaSubdistrict: z.string().max(100).nullable().optional(),
  district: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().max(20).nullable().optional(),
});

export const CustomerRegistrationSchema = z.object({
  fullName: z.string().min(2).max(150),
  mobileNumber: E164PhoneSchema,
  permittedCategories: z.array(z.nativeEnum(MilkCategory)).min(1),
  biometricConsentGranted: z.boolean().refine(val => val === true, 'Consent is required'),
  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.DRAFT),
});

export const CreateCustomerInputSchema = z.object({
  fullName: z.string().min(2).max(150),
  mobileNumber: z.string().min(10, 'Mobile number must be at least 10 digits').optional(),
  normalizedMobileNumber: z.string().min(10, 'Mobile number must be at least 10 digits').optional(),
  permittedCategories: z.array(z.nativeEnum(MilkCategory)).min(1).optional(),
  milkCategories: z.array(z.nativeEnum(MilkCategory)).min(1).optional(),
  centerId: z.string().uuid().optional(),
  primaryCenterId: z.string().uuid().optional(),
  farmerCode: z.string().min(1).max(30).optional(),
  address: CustomerAddressSchema.partial().optional(),
  bankName: z.string().max(100).nullable().optional(),
  bankAccountNumber: z.string().max(50).nullable().optional(),
  bankIfscCode: z.string().max(20).nullable().optional(),
  bankAccountHolderName: z.string().max(150).nullable().optional(),
}).refine(data => !!(data.mobileNumber || data.normalizedMobileNumber), {
  message: 'Mobile number is required',
  path: ['mobileNumber'],
}).transform(data => ({
  ...data,
  mobileNumber: (data.mobileNumber || data.normalizedMobileNumber) as string,
  permittedCategories: (data.permittedCategories || data.milkCategories || [MilkCategory.COW]) as MilkCategory[],
  centerId: data.centerId || data.primaryCenterId,
}));

export const UpdateCustomerInputSchema = z.object({
  fullName: z.string().min(3).max(150).optional(),
  permittedCategories: z.array(z.nativeEnum(MilkCategory)).min(1).optional(),
  bankName: z.string().max(100).nullable().optional(),
  bankAccountNumber: z.string().max(50).nullable().optional(),
  bankIfscCode: z.string().max(20).nullable().optional(),
  bankAccountHolderName: z.string().max(150).nullable().optional(),
  address: CustomerAddressSchema.partial().optional(),
});

export const CustomerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  centerId: z.string().uuid().optional(),
  sortBy: z.enum(['full_name', 'created_at', 'farmer_code']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const CustomerDeleteSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export const CustomerRestoreSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

// RFID Assignment & Lifecycle Schemas
export const RfidAssignInputSchema = z.object({
  cardUid: RfidUidSchema,
  cardType: z.nativeEnum(RfidTechnology).default(RfidTechnology.MIFARE_CLASSIC_1K),
  centerId: z.string().uuid().optional(),
  deviceId: z.string().min(1).default('REGISTRATION_APP'),
  note: z.string().max(250).optional(),
});

export const RfidReplaceInputSchema = z.object({
  newCardUid: RfidUidSchema,
  cardType: z.nativeEnum(RfidTechnology).default(RfidTechnology.MIFARE_CLASSIC_1K),
  reasonCategory: z.string().min(3).optional(),
  justificationNotes: z.string().min(5, 'Justification notes must be at least 5 characters').optional(),
  reason: z.string().optional(),
  centerId: z.string().uuid().optional(),
  deviceId: z.string().min(1).default('REGISTRATION_APP'),
}).refine(data => !!(data.reasonCategory || data.reason), {
  message: 'Replacement reason is required',
  path: ['reasonCategory'],
});

export const RfidRevokeInputSchema = z.object({
  status: z.enum([RfidCardStatus.REVOKED, RfidCardStatus.LOST, RfidCardStatus.BLOCKED]).default(RfidCardStatus.REVOKED),
  reason: z.string().min(5, 'Revocation reason must be at least 5 characters'),
});

export const RfidBlockInputSchema = z.object({
  reason: z.string().min(5, 'Block reason must be at least 5 characters'),
});

// Identification Session & Verification Schemas
export const StartIdentificationSessionSchema = z.object({
  centerId: z.string().uuid('centerId must be a valid UUID'),
  deviceId: z.string().min(1, 'deviceId is required'),
});

export const FaceIdentificationInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  centerId: z.string().uuid('centerId must be a valid UUID'),
  deviceId: z.string().min(1, 'deviceId is required'),
  probeEmbedding: z.array(z.number()).optional().nullable(),
  qualityScore: z.number().min(0).max(1).optional(),
});

export const RfidIdentificationInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  cardUid: RfidUidSchema,
  centerId: z.string().uuid('centerId must be a valid UUID'),
  deviceId: z.string().min(1, 'deviceId is required'),
});

export const SupervisorVerificationInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  targetCustomerUuid: z.string().uuid('targetCustomerUuid must be a valid UUID'),
  reasonCategory: z.nativeEnum(SupervisorReasonCategory),
  justificationNotes: z.string().min(5, 'Justification notes must be at least 5 characters'),
  authenticatedVia: z.nativeEnum(SupervisorAuthMethod).default(SupervisorAuthMethod.PIN),
  centerId: z.string().uuid('centerId must be a valid UUID'),
  deviceId: z.string().min(1, 'deviceId is required'),
  supervisorId: z.string().uuid().optional(),
  supervisorPin: z.string().optional(),
});

export const MilkCollectionInputSchema = z.object({
  customerUuid: z.string().uuid(),
  sessionType: z.nativeEnum(SessionType),
  milkCategory: z.nativeEnum(MilkCategory),
  weightKg: z.number().positive().max(250.0),
  fatPercentage: z.number().min(1.5).max(15.0),
  snfPercentage: z.number().min(5.0).max(13.0),
  identificationMethod: z.nativeEnum(IdentificationMethod),
  clientIntakeUuid: z.string().uuid(),
});

export const EncryptedBiometricTemplateSchema = z.object({
  ciphertextBase64: z.string().min(1, 'Ciphertext is required'),
  ivBase64: z.string().min(12, 'Base64 IV is required'),
  authTagBase64: z.string().min(16, 'Base64 16-byte Auth Tag is required'),
  keyReference: z.string().min(3).max(50).default('key-v1-2026'),
  algorithm: z.literal('AES-256-GCM').default('AES-256-GCM'),
});

export const FaceEnrollmentInputSchema = z.object({
  modelVersionId: z.string().uuid('Valid Model Version UUID is required').optional().default('f0000000-0000-0000-0000-000000000001'),
  encryptedTemplate: EncryptedBiometricTemplateSchema,
  qualityScore: z.number().min(0.0).max(1.0),
  livenessScore: z.number().min(0.0).max(1.0).optional().nullable(),
  livenessClassification: z.enum(['LIVE', 'SUSPECTED_SPOOF', 'RESTRICTED_PASS', 'FAILED']).default('RESTRICTED_PASS'),
  deviceId: z.string().min(1).max(100).default('REGISTRATION_APP'),
  samplesCount: z.number().int().min(1).max(10).default(3),
  officerConsentConfirmation: z.boolean().default(true),
});

export const FaceRevocationInputSchema = z.object({
  reason: z.string().min(3, 'Revocation reason required').max(500),
  permanentErasure: z.boolean().default(false),
});


export const CreateCollectionSessionSchema = z.object({
  centerId: z.string().uuid(),
  customerId: z.string().uuid(),
  operatorId: z.string().uuid(),
  deviceId: z.string().min(1).max(100),
  shiftType: z.nativeEnum(SessionType),
  selectedMilkCategory: z.nativeEnum(MilkCategory),
  identificationMethod: z.nativeEnum(IdentificationMethod),
  intakeSequenceUuid: z.string().uuid().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const RecordQualityMeasurementSchema = z.object({
  sessionId: z.string().uuid(),
  fatPercentage: z.number().min(1.0).max(18.0),
  snfPercentage: z.number().min(4.0).max(15.0),
  densityClr: z.number().optional(),
  readingSource: z.enum(['MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE']).default('MANUAL_ENTRY'),
  deviceId: z.string().max(100).optional(),
});

export const RecordWeightMeasurementSchema = z.object({
  sessionId: z.string().uuid(),
  netWeight: z.number().positive().max(500.0),
  grossWeight: z.number().positive().optional(),
  tareWeight: z.number().min(0.0).optional().default(0.0),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
  readingSource: z.enum(['MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE']).default('MANUAL_ENTRY'),
  deviceId: z.string().max(100).optional(),
});

export const ValidateSessionSchema = z.object({
  sessionId: z.string().uuid(),
  netWeight: z.number().positive().max(500.0),
  fatPercentage: z.number().min(1.0).max(18.0),
  snfPercentage: z.number().min(4.0).max(15.0),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
});

export const CompleteCollectionSessionSchema = z.object({
  sessionId: z.string().uuid(),
  netWeight: z.number().positive().max(500.0),
  fatPercentage: z.number().min(1.0).max(18.0),
  snfPercentage: z.number().min(4.0).max(15.0),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
  readingSource: z.enum(['MANUAL_ENTRY', 'SOFTWARE_SIMULATOR', 'HARDWARE_INTERFACE']).default('MANUAL_ENTRY'),
  clientIntakeUuid: z.string().uuid(),
  idempotencyKey: z.string().min(10).max(128),
});

export const CancelCollectionSessionSchema = z.object({
  reason: z.string().min(3).max(500),
  operatorId: z.string().uuid().optional(),
});

export const SupervisorAdjustmentSchema = z.object({
  supervisorId: z.string().uuid(),
  reason: z.string().min(5).max(500),
  adjustmentType: z.enum(['CORRECTION', 'FULL_REVERSAL']),
  adjustedNetWeight: z.number().positive().max(500.0).optional(),
  adjustedFatPercentage: z.number().min(1.0).max(18.0).optional(),
  adjustedSnfPercentage: z.number().min(4.0).max(15.0).optional(),
});

export const CenterValidationLimitsSchema = z.object({
  cowFatMin: z.number().default(2.8),
  cowFatMax: z.number().default(6.0),
  cowSnfMin: z.number().default(7.8),
  cowSnfMax: z.number().default(10.2),
  buffaloFatMin: z.number().default(5.0),
  buffaloFatMax: z.number().default(12.0),
  buffaloSnfMin: z.number().default(8.2),
  buffaloSnfMax: z.number().default(11.5),
  offlineSyncMaxDisconnectionHours: z.number().default(72),
});

export const SyncPushBatchSchema = z.object({
  deviceId: z.string().min(1).max(100),
  centerId: z.string().uuid(),
  events: z.array(z.object({
    id: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    action: z.enum(['INSERT', 'UPDATE', 'DELETE', 'RESTORE']),
    payload: z.record(z.any()),
    idempotencyKey: z.string().optional(),
    createdAt: z.string().optional(),
  })).min(1),
});

export const DeviceRegisterSchema = z.object({
  deviceIdentifier: z.string().min(3).max(100),
  deviceType: z.enum(['REGISTRATION_TABLET', 'COUNTER_TERMINAL', 'MOBILE_COLLECTOR']),
  centerId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  publicKey: z.string().optional(),
  appVersion: z.string().optional(),
});

export const DeviceRevokeSchema = z.object({
  deviceId: z.string().uuid().optional(),
  deviceIdentifier: z.string().min(3).max(100).optional(),
  reason: z.string().min(3).max(500),
});

export const SyncAcknowledgeSchema = z.object({
  deviceId: z.string().min(1).max(100).optional(),
  cursor: z.number().int().min(0).optional(),
  downstreamCursor: z.number().int().min(0).optional(),
  downstreamTombstoneCursor: z.number().int().min(0).optional(),
  clientAppVersion: z.string().optional(),
});

// ============================================================================
// PHASE 14: FEED INVENTORY, PROCUREMENT, SALES & STOCK ACCOUNTING SCHEMAS
// ============================================================================

export const CreateFeedCategorySchema = z.object({
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric with underscores or dashes'),
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional().nullable(),
});

export const CreateFeedProductSchema = z.object({
  categoryId: z.string().uuid(),
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric with underscores or dashes'),
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional().nullable(),
  baseUnit: z.enum(['KG', 'BAG', 'PIECE', 'LITRE']),
  packSize: z.number().positive().default(1),
  packUnit: z.string().min(1).max(20).default('KG'),
  defaultPurchasePrice: z.number().nonnegative().default(0),
  sellingPrice: z.number().positive(),
  taxRatePercent: z.number().min(0).max(100).default(0),
  hsnCode: z.string().max(20).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
  minimumStockLevel: z.number().nonnegative().default(0),
});

export const UpdateFeedProductSchema = CreateFeedProductSchema.partial().extend({
  categoryId: z.string().uuid().optional(),
});

export const CreateFeedSupplierSchema = z.object({
  supplierCode: z.string().min(2).max(50).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric with underscores or dashes'),
  name: z.string().min(2).max(150),
  contactPerson: z.string().max(100).optional().nullable(),
  phoneNumber: z.string().min(10).max(20),
  email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  gstNumber: z.string().max(30).optional().nullable(),
  panNumber: z.string().max(30).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE'),
});

export const FeedPurchaseItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  unitCost: z.number().nonnegative(),
  taxRatePercent: z.number().min(0).max(100).default(0),
  batchNumber: z.string().max(100).optional().nullable(),
  expiryDate: z.string().optional().nullable(),
});

export const CreateFeedPurchaseSchema = z.object({
  centerId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseOrderNumber: z.string().max(100).optional().nullable(),
  supplierInvoiceNumber: z.string().min(1).max(100),
  purchaseDate: z.string().min(10).max(10),
  items: z.array(FeedPurchaseItemInputSchema).min(1),
  notes: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
});

export const ReceiveFeedPurchaseSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  notes: z.string().max(500).optional().nullable(),
});

export const FeedSaleItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  discountAmount: z.number().min(0).default(0),
});

export const CreateFeedSaleSchema = z.object({
  centerId: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(FeedSaleItemInputSchema).min(1),
  paymentMode: z.enum(['CREDIT', 'CASH']).default('CREDIT'),
  discountAmount: z.number().min(0).default(0),
  discountApprovedBy: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
  clientSaleUuid: z.string().uuid().optional().nullable(),
});

export const CreateFeedReturnSchema = z.object({
  saleItemId: z.string().uuid(),
  returnQuantity: z.number().positive(),
  stockCondition: z.enum(['SALEABLE', 'DAMAGED']),
  reason: z.string().min(3).max(500),
  approvedBy: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
});

export const CreateInventoryTransferSchema = z.object({
  sourceCenterId: z.string().uuid(),
  destinationCenterId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  notes: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
});

export const CreateInventoryAdjustmentSchema = z.object({
  centerId: z.string().uuid(),
  productId: z.string().uuid(),
  adjustmentType: z.enum(['DAMAGED_WRITE_OFF', 'STOCK_CORRECTION', 'PHYSICAL_AUDIT_SURPLUS', 'PHYSICAL_AUDIT_DEFICIT']),
  quantity: z.number().positive(),
  direction: z.enum(['IN', 'OUT']),
  reason: z.string().min(3).max(500),
  approvedBy: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

// ==========================================
// Phase 15: Customer Payments & Reconciliation
// ==========================================

export const PaymentDirectionSchema = z.nativeEnum(PaymentDirection);
export const PaymentMethodSchema = z.nativeEnum(PaymentMethod);
export const PaymentStatusSchema = z.nativeEnum(PaymentStatus);
export const PaymentBatchStatusSchema = z.nativeEnum(PaymentBatchStatus);
export const ReconciliationStatusSchema = z.nativeEnum(ReconciliationStatus);

export const CreatePayoutInputSchema = z.object({
  centerId: z.string().uuid(),
  customerId: z.string().uuid(),
  amount: z.number().positive('Payout amount must be greater than zero'),
  currency: z.string().default('INR'),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().max(100).optional().nullable(),
  sourceTransactionType: z.string().max(50).default('MANUAL_PAYOUT'),
  sourceTransactionId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
  notes: z.string().max(500).optional().nullable(),
  allowOverpaymentAdvance: z.boolean().default(false),
});

export const ApprovePayoutInputSchema = z.object({
  comments: z.string().max(500).optional().nullable(),
});

export const SubmitPayoutInputSchema = z.object({
  paymentReference: z.string().max(100).optional().nullable(),
});

export const ConfirmPayoutInputSchema = z.object({
  paymentReference: z.string().min(1, 'Payment reference is mandatory for settlement').max(100),
  settledAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const FailPayoutInputSchema = z.object({
  failureReason: z.string().min(3, 'Failure reason must be at least 3 characters').max(500),
});

export const ReversePayoutInputSchema = z.object({
  reason: z.string().min(5, 'Reversal reason must be at least 5 characters').max(500),
  idempotencyKey: z.string().min(8).max(128),
});

export const CreateReceiptInputSchema = z.object({
  centerId: z.string().uuid(),
  customerId: z.string().uuid(),
  amount: z.number().positive('Receipt amount must be greater than zero'),
  currency: z.string().default('INR'),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().min(1, 'Reference number is mandatory').max(100),
  sourceTransactionType: z.string().max(50).default('DEBT_REPAYMENT'),
  sourceTransactionId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
  notes: z.string().max(500).optional().nullable(),
});

export const ConfirmReceiptInputSchema = z.object({
  referenceNumber: z.string().min(1).max(100).optional(),
});

export const CreatePaymentBatchSchema = z.object({
  centerId: z.string().uuid().optional().nullable(),
  billingCycleId: z.string().uuid().optional().nullable(),
  billingPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format YYYY-MM-DD required').optional().nullable(),
  billingPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format YYYY-MM-DD required').optional().nullable(),
  paymentMethod: PaymentMethodSchema.default(PaymentMethod.BANK_TRANSFER),
  customerIds: z.array(z.string().uuid()).optional(),
  payoutIds: z.array(z.string().uuid()).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const ReconcileBatchItemInputSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(['SETTLED', 'FAILED']),
  beneficiaryReference: z.string().max(100).optional().nullable(),
  failureReason: z.string().max(500).optional().nullable(),
});

export const ReconcileBatchSchema = z.object({
  results: z.array(ReconcileBatchItemInputSchema).min(1, 'At least one beneficiary result required'),
});

export const BankStatementRowSchema = z.object({
  transactionDate: z.string(),
  referenceNumber: z.string().min(1),
  amount: z.number().positive(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  description: z.string().optional().nullable(),
});

export const BankStatementImportSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(BankStatementRowSchema).min(1, 'Statement cannot be empty'),
});

export const ResolveReconciliationSchema = z.object({
  action: z.enum(['CONFIRMED_SETTLED', 'FLAGGED_MISMATCH', 'REJECTED_DUPLICATE', 'MANUALLY_MATCHED', 'DISMISSED']),
  matchedPayoutId: z.string().uuid().optional().nullable(),
  matchedReceiptId: z.string().uuid().optional().nullable(),
  notes: z.string().min(3, 'Notes must be at least 3 characters').max(500),
});

// ==============================================================================
// Billing & Customer Settlement Validation Schemas (Phase 13)
// ==============================================================================

export const BillStatusSchema = z.nativeEnum(BillStatus);
export const BillingCycleTypeSchema = z.nativeEnum(BillingCycleType);
export const BillingPeriodStatusSchema = z.nativeEnum(BillingPeriodStatus);

export const CreateBillingPeriodSchema = z.object({
  centerId: z.string().uuid('Valid Center UUID required'),
  periodName: z.string().min(2, 'Period name must be at least 2 characters').max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid startDate format YYYY-MM-DD required'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid endDate format YYYY-MM-DD required'),
  cycleType: z.nativeEnum(BillingCycleType).default(BillingCycleType.CALENDAR_MONTH),
}).refine(data => data.startDate <= data.endDate, {
  message: 'startDate must be less than or equal to endDate',
  path: ['endDate'],
});

export const GenerateBillsSchema = z.object({
  customerId: z.string().uuid('Valid Customer UUID required').optional().nullable(),
  idempotencyKey: z.string().max(128).optional(),
});

export const AdjustBillSchema = z.object({
  adjustmentType: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive('Adjustment amount must be positive'),
  reason: z.string().min(3, 'Adjustment reason must be at least 3 characters').max(500),
});

export const SubmitReviewSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export const ApproveBillSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export const FinalizeBillSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export const ListBillingPeriodsQuerySchema = z.object({
  centerId: z.string().uuid().optional(),
  status: z.nativeEnum(BillingPeriodStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const BillingSchedulerRunSchema = z.object({
  centerId: z.string().uuid().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dryRun: z.boolean().default(false),
});

// ==============================================================================
// PHASE 11: MILK RATE MANAGEMENT VALIDATION SCHEMAS & MATRIX ENGINE
// ==============================================================================

export const CreateRateChartSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  milkCategory: z.nativeEnum(MilkCategory),
  centerId: z.string().uuid('Center ID must be a valid UUID').optional().nullable(),
  pricingType: z.enum(['GRID', 'TOTAL_SOLIDS_FORMULA', 'TWO_AXIS_FORMULA']).default('GRID'),
  description: z.string().max(500).optional().nullable(),
});

export const CreateRateVersionSchema = z.object({
  effectiveFrom: z.string().datetime({ message: 'effectiveFrom must be a valid ISO 8601 datetime' }),
  effectiveTo: z.string().datetime({ message: 'effectiveTo must be a valid ISO 8601 datetime' }).optional().nullable(),
  pricingUnit: z.enum(['PER_KG', 'PER_LITER']).default('PER_KG'),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
  notes: z.string().max(500).optional().nullable(),
  fatMin: z.number().min(1.5).max(15.0).optional().nullable(),
  fatMax: z.number().min(1.5).max(15.0).optional().nullable(),
  snfMin: z.number().min(5.0).max(13.0).optional().nullable(),
  snfMax: z.number().min(5.0).max(13.0).optional().nullable(),
});

export const RateMatrixCellSchema = z.object({
  fatPercentage: z.number().refine(val => Math.round(val * 10) === val * 10, {
    message: 'Fat percentage must have at most 1 decimal place (0.1 step)',
  }),
  snfPercentage: z.number().refine(val => Math.round(val * 10) === val * 10, {
    message: 'SNF percentage must have at most 1 decimal place (0.1 step)',
  }),
  ratePerUnit: z.number().positive('Rate per unit must be greater than 0').refine(
    val => Math.round(val * 100) === val * 100,
    { message: 'Rate per unit must have at most 2 decimal places' }
  ),
});

export const RateMatrixSubmissionSchema = z.object({
  cells: z.array(RateMatrixCellSchema).min(1, 'Matrix must contain at least 1 rate cell'),
});

export const RateCalculationRequestSchema = z.object({
  centerId: z.string().uuid('Valid Center UUID required'),
  milkCategory: z.nativeEnum(MilkCategory),
  fat: z.number().min(1.5).max(15.0),
  snf: z.number().min(5.0).max(13.0),
  netWeight: z.number().positive('Net weight must be positive').optional(),
  quantity: z.number().positive('Quantity must be positive').optional(),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  versionId: z.string().uuid().optional(),
}).refine(data => data.netWeight !== undefined || data.quantity !== undefined, {
  message: 'Either netWeight or quantity must be provided and positive',
  path: ['netWeight'],
}).transform(data => ({
  ...data,
  netWeight: (data.netWeight ?? data.quantity) as number,
}));

export const RatePreviewCalculationSchema = z.object({
  fat: z.number().min(1.5).max(15.0),
  snf: z.number().min(5.0).max(13.0),
  netWeight: z.number().positive('Net weight must be positive'),
  measurementUnit: z.enum(['KG', 'LITERS']).default('KG'),
});

/**
 * Validates a rate matrix for duplicates, decimal precision, valid step, and range integrity.
 */
export function validateRateMatrix(
  cells: Array<{ fatPercentage: number; snfPercentage: number; ratePerUnit: number }>,
  category: MilkCategory
): {
  isValid: boolean;
  totalCells: number;
  duplicateCells: Array<{ fat: number; snf: number }>;
  errors: string[];
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  const duplicateCells: Array<{ fat: number; snf: number }> = [];

  const fatBounds = category === MilkCategory.COW ? { min: 2.8, max: 6.0 } : { min: 5.0, max: 12.0 };
  const snfBounds = category === MilkCategory.COW ? { min: 7.8, max: 10.2 } : { min: 8.2, max: 11.5 };

  for (const cell of cells) {
    const roundedFat = Math.round(cell.fatPercentage * 10) / 10;
    const roundedSnf = Math.round(cell.snfPercentage * 10) / 10;

    // Check bounds for milk category
    if (roundedFat < fatBounds.min || roundedFat > fatBounds.max) {
      errors.push(`Fat ${roundedFat}% is out of bounds for ${category} (allowed: ${fatBounds.min}-${fatBounds.max}%)`);
    }
    if (roundedSnf < snfBounds.min || roundedSnf > snfBounds.max) {
      errors.push(`SNF ${roundedSnf}% is out of bounds for ${category} (allowed: ${snfBounds.min}-${snfBounds.max}%)`);
    }

    // Check step precision
    if (Math.round(cell.fatPercentage * 10) !== cell.fatPercentage * 10) {
      errors.push(`Fat ${cell.fatPercentage} has invalid decimal precision (must be 1 decimal)`);
    }
    if (Math.round(cell.snfPercentage * 10) !== cell.snfPercentage * 10) {
      errors.push(`SNF ${cell.snfPercentage} has invalid decimal precision (must be 1 decimal)`);
    }
    if (cell.ratePerUnit <= 0) {
      errors.push(`Rate ${cell.ratePerUnit} at Fat: ${roundedFat}, SNF: ${roundedSnf} must be positive`);
    }

    // Check duplicate key
    const key = `${roundedFat.toFixed(1)}_${roundedSnf.toFixed(1)}`;
    if (seen.has(key)) {
      duplicateCells.push({ fat: roundedFat, snf: roundedSnf });
      errors.push(`Duplicate cell detected at Fat: ${roundedFat}%, SNF: ${roundedSnf}%`);
    } else {
      seen.add(key);
    }
  }

  return {
    isValid: errors.length === 0,
    totalCells: cells.length,
    duplicateCells,
    errors,
  };
}

// ==============================================================================
// PHASE 16: EMPLOYEE MANAGEMENT, ATTENDANCE & PAYROLL SCHEMAS
// ==============================================================================

export const PayrollRunStatusSchema = z.nativeEnum(PayrollRunStatus);
export const PayslipPaymentStatusSchema = z.nativeEnum(PayslipPaymentStatus);
export const SalaryPaymentStatusSchema = z.nativeEnum(SalaryPaymentStatus);

export const CreateEmployeeSchema = z.object({
  employeeCode: z.string().min(2).max(50).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  mobileNumber: z.string().min(10).max(20),
  email: z.string().email().optional().nullable(),
  nationalIdMask: z.string().max(50).optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  employmentStatus: z.nativeEnum(EmploymentStatus).default(EmploymentStatus.ACTIVE),
  employmentType: z.nativeEnum(EmploymentType).default(EmploymentType.FULL_TIME),
  designation: z.string().min(1).max(100),
  department: z.string().min(1).max(100),
  primaryCenterId: z.string().uuid().optional().nullable(),
  emergencyContactName: z.string().max(150).optional().nullable(),
  emergencyContactPhone: z.string().max(20).optional().nullable(),
  emergencyContactRelation: z.string().max(50).optional().nullable(),
  emergencyContactApproved: z.boolean().default(false),
  bankName: z.string().max(100).optional().nullable(),
  bankAccountNumberMask: z.string().max(50).optional().nullable(),
  bankIfsc: z.string().max(20).optional().nullable(),
  role: z.nativeEnum(UserRole).optional(),
  createUserAccount: z.boolean().default(false),
  username: z.string().min(3).max(50).optional(),
});

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  mobileNumber: z.string().min(10).max(20).optional(),
  email: z.string().email().optional().nullable(),
  nationalIdMask: z.string().max(50).optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  designation: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(100).optional(),
  primaryCenterId: z.string().uuid().optional().nullable(),
  emergencyContactName: z.string().max(150).optional().nullable(),
  emergencyContactPhone: z.string().max(20).optional().nullable(),
  emergencyContactRelation: z.string().max(50).optional().nullable(),
  emergencyContactApproved: z.boolean().optional(),
  bankName: z.string().max(100).optional().nullable(),
  bankAccountNumberMask: z.string().max(50).optional().nullable(),
  bankIfsc: z.string().max(20).optional().nullable(),
});

export const AssignEmployeeRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
  centerIds: z.array(z.string().uuid()).optional(),
  primaryCenterId: z.string().uuid().optional(),
});

export const AssignEmployeeCenterSchema = z.object({
  centerId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

export const CreateShiftSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be HH:MM or HH:MM:SS'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be HH:MM or HH:MM:SS'),
  gracePeriodMinutes: z.number().int().min(0).max(120).default(15),
  halfDayThresholdHours: z.number().min(1).max(12).default(4.0),
  fullDayThresholdHours: z.number().min(2).max(24).default(8.0),
});

export const RecordAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  centerId: z.string().uuid(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.nativeEnum(EmployeeShiftType).default(EmployeeShiftType.GENERAL),
  shiftId: z.string().uuid().optional().nullable(),
  checkInTime: z.string().datetime().optional().nullable(),
  checkOutTime: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  overtimeHours: z.number().min(0).max(24).default(0),
  notes: z.string().max(500).optional().nullable(),
});

export const AttendanceCorrectionSchema = z.object({
  checkInTime: z.string().datetime().optional().nullable(),
  checkOutTime: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  overtimeHours: z.number().min(0).max(24).optional(),
  reason: z.string().min(5, 'Correction reason is mandatory and must be at least 5 characters'),
  notes: z.string().max(500).optional().nullable(),
});

export const CreateLeaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.nativeEnum(LeaveType),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysCount: z.number().positive(),
  reason: z.string().min(3).max(500),
});

export const ApproveLeaveSchema = z.object({
  status: z.enum([LeaveStatus.APPROVED, LeaveStatus.REJECTED]),
  rejectionReason: z.string().max(500).optional().nullable(),
});

export const CreateSalaryStructureSchema = z.object({
  employeeId: z.string().uuid(),
  calculationBasis: z.nativeEnum(SalaryCalculationBasis).default(SalaryCalculationBasis.MONTHLY),
  baseSalary: z.number().nonnegative(),
  hra: z.number().nonnegative().default(0),
  travelAllowance: z.number().nonnegative().default(0),
  specialAllowance: z.number().nonnegative().default(0),
  medicalAllowance: z.number().nonnegative().default(0),
  providentFundEmployee: z.number().nonnegative().default(0),
  professionalTax: z.number().nonnegative().default(0),
  tdsTax: z.number().nonnegative().default(0),
  otherDeductions: z.number().nonnegative().default(0),
  overtimeHourlyRate: z.number().nonnegative().default(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const CreateEmployeeAdvanceSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().positive(),
  monthlyInstallment: z.number().positive(),
  reason: z.string().min(5).max(500),
});

export const ApproveEmployeeAdvanceSchema = z.object({
  status: z.enum([EmployeeAdvanceStatus.APPROVED, EmployeeAdvanceStatus.REJECTED]),
  disbursedAmount: z.number().positive().optional(),
});

export const InitiatePayrollRunSchema = z.object({
  centerId: z.string().uuid().optional().nullable(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  notes: z.string().max(500).optional().nullable(),
});

export const ApprovePayrollRunSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().max(500).optional().nullable(),
});

export const FinalizePayrollRunSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export const RecordSalaryPaymentSchema = z.object({
  payrollRunId: z.string().uuid(),
  payslipId: z.string().uuid(),
  employeeId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(SalaryPaymentMethod).default(SalaryPaymentMethod.BANK_TRANSFER),
  transactionId: z.string().max(100).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  bankAccountMask: z.string().max(50).optional().nullable(),
  bankIfsc: z.string().max(20).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

// ==============================================================================
// PHASE 19: NOTIFICATION ENGINE, PUSH & WHATSAPP BUSINESS AUTOMATION
// ==============================================================================

export const NotificationChannelSchema = z.nativeEnum(NotificationChannel);
export const NotificationEventTypeSchema = z.nativeEnum(NotificationEventType);
export const NotificationStatusSchema = z.nativeEnum(NotificationStatus);
export const CommunicationConsentTypeSchema = z.nativeEnum(CommunicationConsentType);

export const DeviceTokenRegistrationSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required').max(128),
  devicePlatform: z.enum(['ANDROID', 'IOS', 'WEB']).default('ANDROID'),
  fcmToken: z.string().min(10, 'FCM token must be valid string').max(4096),
});

export const DeviceTokenRefreshSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required').max(128),
  fcmToken: z.string().min(10, 'FCM token must be valid string').max(4096),
});

export const CommunicationPreferenceSchema = z.object({
  whatsappOptIn: z.boolean().default(true),
  pushOptIn: z.boolean().default(true),
  smsOptIn: z.boolean().default(true),
  preferredLanguage: z.enum(['mr', 'en']).default('mr'),
  optOutReason: z.string().max(500).optional().nullable(),
});

export const ListCustomerNotificationsQuerySchema = z.object({
  isRead: z.coerce.boolean().optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  eventType: z.nativeEnum(NotificationEventType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SendNotificationRequestSchema = z.object({
  customerId: z.string().uuid('Valid customer ID required'),
  eventType: z.nativeEnum(NotificationEventType),
  eventId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128),
  channels: z.array(z.nativeEnum(NotificationChannel)).optional(),
  customTitle: z.string().max(255).optional(),
  customBody: z.string().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
  forceLanguage: z.enum(['mr', 'en']).optional(),
});

export const WhatsAppWebhookVerificationSchema = z.object({
  'hub.mode': z.string(),
  'hub.challenge': z.string(),
  'hub.verify_token': z.string(),
});





