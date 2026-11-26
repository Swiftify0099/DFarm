import { Customer, MilkCategory } from '../../domain/entities/Customer.js';
import { CustomerMembership } from '../../domain/entities/CustomerMembership.js';
import { GlobalCustomerIdentity } from '../../domain/entities/GlobalCustomerIdentity.js';
import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
import { RateChart } from '../../domain/entities/RateChart.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';

export interface ICustomerRepository {
  findById(id: string, organizationId?: string, includeDeleted?: boolean): Promise<Customer | null>;
  findByFarmerCode(farmerCode: string, organizationId: string): Promise<Customer | null>;
  findByRfid(cardUid: string, organizationId?: string): Promise<Customer | null>;
  findByPhone(phoneE164: string, organizationId?: string): Promise<Customer | null>;
  listCustomers(params: {
    organizationId: string;
    centerId?: string;
    search?: string;
    category?: MilkCategory;
    limit?: number;
    offset?: number;
    includeSoftDeleted?: boolean;
  }): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
  listPendingRegistrations(organizationId?: string): Promise<Customer[]>;
  updateFaceEnrollment(customerId: string, modelVersion: string, encryptedPayload: string, organizationId?: string): Promise<void>;
  assignRfidCard(customerId: string, cardUid: string, organizationId?: string): Promise<void>;
}

export interface ICustomerMembershipRepository {
  findGlobalIdentityByPhone(phoneE164: string): Promise<GlobalCustomerIdentity | null>;
  createGlobalIdentity(phoneE164: string): Promise<GlobalCustomerIdentity>;
  listMembershipsByGlobalId(globalCustomerId: string): Promise<CustomerMembership[]>;
  findMembership(globalCustomerId: string, organizationId: string): Promise<CustomerMembership | null>;
  saveMembership(membership: CustomerMembership): Promise<void>;
  updateMembershipStatus(organizationId: string, tenantCustomerId: string, status: string, farmerCode?: string, customerName?: string): Promise<void>;
  getMembershipCount(globalCustomerId: string): Promise<number>;
}

export interface IShiftSessionRepository {
  findActiveSession(centerId: string, deviceIdentifier: string, organizationId?: string): Promise<KioskShiftSession | null>;
  findByCode(sessionCode: string, organizationId?: string): Promise<KioskShiftSession | null>;
  findById(sessionId: string, organizationId?: string): Promise<KioskShiftSession | null>;
  save(session: KioskShiftSession): Promise<void>;
}

export interface AtomicMilkIntakeParams {
  transaction: MilkCollectionTransaction;
  session: KioskShiftSession;
  totalAmount: number;
  weightLiters: number;
  fatPercentage: number;
  snfPercentage: number;
  milkCategory: MilkCategory;
  customerId: string;
  organizationId: string;
  centerId: string;
  operatorId: string;
  operatorName: string;
  appliedRate: number;
}

export interface AtomicMilkIntakeResult {
  transaction: MilkCollectionTransaction;
  receiptNumber: string;
  customerBalanceAfter: number;
  isIdempotentReplay: boolean;
}

export interface ICollectionTransactionRepository {
  save(transaction: MilkCollectionTransaction): Promise<void>;
  saveAtomicIntake(params: AtomicMilkIntakeParams): Promise<AtomicMilkIntakeResult>;
  findByIdempotencyKey(key: string, organizationId: string): Promise<MilkCollectionTransaction | null>;
  listRecentBySession(sessionId: string, limit?: number): Promise<MilkCollectionTransaction[]>;
  listByCustomer(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<MilkCollectionTransaction[]>;
  getMonthlySummary(customerId: string, monthYear: string, organizationId?: string): Promise<{
    monthYear: string;
    totalLiters: number;
    cowLiters: number;
    buffaloLiters: number;
    avgFat: number;
    avgSnf: number;
    totalAmount: number;
    transactionCount: number;
  }>;
}

export interface IRateChartRepository {
  getActiveRateChart(centerId: string, organizationId: string, category: MilkCategory, businessDate: string): Promise<RateChart>;
}

export interface ILedgerRepository {
  findByCustomer(customerId: string, organizationId?: string): Promise<CustomerLedgerAccount | null>;
  save(account: CustomerLedgerAccount, newEntry?: LedgerEntry): Promise<void>;
  listEntries(customerId: string, limit?: number, offset?: number, organizationId?: string): Promise<LedgerEntry[]>;
}

export interface ITokenService {
  signToken(payload: {
    userId: string;
    organizationId?: string;
    centerId?: string;
    globalCustomerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
    fullName?: string;
    phoneNumber?: string;
    deviceId?: string;
    tokenType?: 'access' | 'refresh';
    jti?: string;
  }, expiresInSeconds?: number): string;
  verifyToken(token: string): {
    userId: string;
    organizationId?: string;
    centerId?: string;
    globalCustomerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
    fullName?: string;
    phoneNumber?: string;
    deviceId?: string;
    tokenType?: 'access' | 'refresh';
    jti?: string;
    exp?: number;
  };
}

export interface IOtpService {
  sendOtp(
    mobileNumber: string,
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN',
    ipAddress?: string
  ): Promise<{
    success: boolean;
    message: string;
    cooldownSeconds?: number;
    expiresAt?: string;
    previewOtp?: string;
  }>;
  verifyOtp(mobileNumber: string, otp: string, purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'): Promise<boolean>;
}

export interface IBiometricEncryptor {
  encrypt128DimEmbedding(embedding: number[], customerId: string, modelVersionId: string): {
    encryptedData: string;
    iv: string;
    authTag: string;
    keyReference: string;
  };
  decrypt128DimEmbedding(encryptedData: string, iv: string, authTag: string, customerId: string, modelVersionId: string): number[];
}
