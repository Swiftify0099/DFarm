/**
 * DFarm Registration App - Data Transfer Objects & Domain Models
 * Full parity with Kotlin ApiModels.kt, Customer.kt, RfidCard.kt
 */

export interface AssignedCenter {
  centerId: string;
  centerName: string;
  centerCode: string;
}

export interface CenterDto {
  id: string;
  code?: string | null;
  name?: string | null;
  isPrimary?: boolean;
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

export interface LoginRequest {
  email: string;
  password: string;
  username?: string;
}

export interface LoginUserData {
  id?: string | null;
  organizationId?: string | null;
  role?: string | null;
  primaryCenterId?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  assignedCenters?: CenterDto[];
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token?: string;
    user?: LoginUserData;
  };
  token?: string;
  officer?: OfficerProfile;
  message?: string;
}

export interface UserMeResponse {
  success: boolean;
  data?: {
    authUserId?: string;
    internalId?: string;
    actorType?: string;
    role?: string;
    organizationId?: string;
    authorizedCenterIds?: string[];
    primaryCenterId?: string;
    officer?: OfficerProfile;
  };
  officer?: OfficerProfile;
  message?: string;
}

export interface CustomerAddress {
  village: string;
  hamletArea?: string | null;
  talukaSubdistrict?: string | null;
  district: string;
  state: string;
  postalCode?: string | null;
}

export type MilkCategory = 'COW' | 'BUFFALO';

export interface CustomerDto {
  id: string; // Server canonical UUID
  organizationId: string;
  primaryCenterId: string;
  farmerCode?: string | null;
  fullName: string;
  normalizedMobileNumber: string;
  status: string; // 'DRAFT' | 'PENDING_FACE_ENROLLMENT' | 'PENDING_RFID_ASSIGNMENT' | 'ACTIVE' | 'SUSPENDED' | 'SOFT_DELETED'
  registrationStatus: string; // 'IN_PROGRESS' | 'COMPLETED'
  address?: CustomerAddress | null;
  permittedCategories: string[];
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CustomerListResponse {
  items: CustomerDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    details?: string;
  };
}

export interface CreateCustomerRequest {
  fullName: string;
  normalizedMobileNumber: string;
  mobileNumber?: string;
  permittedCategories: string[];
  primaryCenterId?: string | null;
  centerId?: string | null;
  farmerCode?: string | null;
  address?: CustomerAddress | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
}

export interface UpdateCustomerRequest {
  fullName?: string | null;
  address?: CustomerAddress | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
}

export interface CustomerDeleteRequest {
  reason: string;
}

export interface CustomerRestoreRequest {
  reason: string;
}

export interface RfidAssignRequest {
  cardUid: string;
  cardType?: string;
  deviceId?: string;
}

export interface RfidReplaceRequest {
  newCardUid: string;
  reason: string;
  reasonCategory?: string;
  justificationNotes?: string;
  cardType?: string;
  deviceId?: string;
}

export interface RfidRevokeRequest {
  reason: string;
}

export interface RfidBlockRequest {
  reason: string;
}

export interface RfidAssignmentDto {
  id?: string | null;
  assignmentId?: string | null;
  rfidCardId?: string | null;
  customerId?: string | null;
  centerId?: string | null;
  isActive: boolean;
  assignedAt?: string | null;
  assignedBy?: string | null;
  cardUid?: string | null;
  cardType?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  status?: string | null;
}

export interface CustomerRfidStatusDto {
  customerId: string;
  farmerCode?: string | null;
  fullName?: string | null;
  status?: string | null;
  customerStatus?: string | null;
  registrationStatus?: string | null;
  hasActiveCard: boolean;
  activeCard?: {
    cardId?: string | null;
    rfidCardId?: string | null;
    cardUid: string;
    cardType?: string;
    assignedAt?: string | null;
  } | null;
  assignmentHistory: Array<{
    id?: string | null;
    assignmentId?: string | null;
    cardId?: string | null;
    rfidCardId?: string | null;
    cardUid: string;
    cardType?: string;
    assignedAt?: string | null;
    assignedBy?: string | null;
    isActive: boolean;
    revokedAt?: string | null;
    revocationReason?: string | null;
  }>;
}

export interface EncryptedEnvelope {
  ciphertextBase64: string;
  ivBase64: string;
  authTagBase64: string;
  keyReference: string;
  algorithm: string;
}

export interface FaceEnrollmentRequest {
  modelVersionId: string;
  encryptedTemplate: {
    ciphertextBase64: string;
    ivBase64: string;
    authTagBase64: string;
    keyReference: string;
    algorithm: string;
  };
  qualityScore: number;
  livenessScore?: number | null;
  livenessClassification: string;
  deviceId: string;
  samplesCount: number;
  officerConsentConfirmation: boolean;
}

export interface FaceEnrollmentResponse {
  success: boolean;
  enrollmentId?: string | null;
  customerId?: string | null;
  modelVersionId?: string | null;
  qualityScore?: number | null;
  status?: string | null;
  enrolledAt?: string | null;
  errorMessage?: string | null;
}

export interface FaceStatusResult {
  success: boolean;
  customerId: string;
  hasEnrolledFace: boolean;
  enrollmentId?: string | null;
  modelVersion?: string | null;
  qualityScore?: number | null;
  status?: string | null;
  enrolledAt?: string | null;
  errorMessage?: string | null;
}

export enum LocalSyncStatus {
  LOCAL_ONLY = 'LOCAL_ONLY',
  PENDING_SYNC = 'PENDING_SYNC',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  RETRY_REQUIRED = 'RETRY_REQUIRED',
  CONFLICT = 'CONFLICT',
  REVOKED = 'REVOKED',
}

export interface LocalRegistrationDraft {
  localId: string;
  farmerCode?: string | null;
  fullName: string;
  mobileNumber: string;
  permittedCategories: string[];
  preferredMilkCategory: string;
  village: string;
  hamletArea?: string | null;
  talukaSubdistrict: string;
  district: string;
  state: string;
  postalCode: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  consentObtained: boolean;
  consentTimestamp: number;
  faceEnrolled: boolean;
  faceTemplateCiphertext?: string | null;
  rfidCardNumber?: string | null;
  syncStatus: LocalSyncStatus;
  canonicalServerId?: string | null;
  conflictReason?: string | null;
  retryCount: number;
  lastSyncError?: string | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  centerId?: string | null;
  category?: string;
  enrollmentStatus?: string;
  pendingSync?: boolean;
}

export interface RegistrationSyncEvent {
  eventId: string;
  draftId: string;
  entityType: string;
  action: string;
  idempotencyKey: string;
  payloadJson: string;
  status: LocalSyncStatus;
  retryCount: number;
  lastError?: string | null;
  createdAt: number;
  syncedAt?: number | null;
}
