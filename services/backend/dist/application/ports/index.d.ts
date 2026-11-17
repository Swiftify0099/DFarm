import { Customer, MilkCategory } from '../../domain/entities/Customer.js';
import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
import { MilkCollectionTransaction } from '../../domain/entities/MilkCollectionTransaction.js';
import { RateChart } from '../../domain/entities/RateChart.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';
export interface ICustomerRepository {
    findById(id: string): Promise<Customer | null>;
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
    updateFaceEnrollment(customerId: string, modelVersion: string, encryptedPayload: string): Promise<void>;
}
export interface IShiftSessionRepository {
    findActiveSession(centerId: string, deviceIdentifier: string): Promise<KioskShiftSession | null>;
    findByCode(sessionCode: string): Promise<KioskShiftSession | null>;
    save(session: KioskShiftSession): Promise<void>;
}
export interface ICollectionTransactionRepository {
    save(transaction: MilkCollectionTransaction): Promise<void>;
    findByIdempotencyKey(key: string): Promise<MilkCollectionTransaction | null>;
    listRecentBySession(sessionId: string, limit?: number): Promise<MilkCollectionTransaction[]>;
    listByCustomer(customerId: string, limit?: number, offset?: number): Promise<MilkCollectionTransaction[]>;
    getMonthlySummary(customerId: string, monthYear: string): Promise<{
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
    findByCustomer(customerId: string): Promise<CustomerLedgerAccount | null>;
    save(account: CustomerLedgerAccount, newEntry?: LedgerEntry): Promise<void>;
    listEntries(customerId: string, limit?: number, offset?: number): Promise<LedgerEntry[]>;
}
export interface ITokenService {
    signToken(payload: {
        userId: string;
        organizationId?: string;
        centerId?: string;
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
    }, expiresInSeconds?: number): string;
    verifyToken(token: string): {
        userId: string;
        organizationId?: string;
        centerId?: string;
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
    };
}
export interface IOtpService {
    sendOtp(mobileNumber: string, purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'): Promise<{
        success: boolean;
        message: string;
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
//# sourceMappingURL=index.d.ts.map