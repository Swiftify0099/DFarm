import type { AuthContext } from '../../middleware/authenticate.js';
import type { CustomerProfile, PaginatedCustomersResult, CustomerAddress } from './customer.types.js';
import type { MilkCategory } from '@dfarm/shared-types';
export interface CreateCustomerDTO {
    fullName: string;
    mobileNumber: string;
    permittedCategories: MilkCategory[];
    centerId?: string;
    farmerCode?: string;
    address?: CustomerAddress;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankIfscCode?: string | null;
    bankAccountHolderName?: string | null;
}
export interface UpdateCustomerDTO {
    fullName?: string;
    permittedCategories?: MilkCategory[];
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankIfscCode?: string | null;
    bankAccountHolderName?: string | null;
    address?: Partial<CustomerAddress>;
}
export interface CustomerQueryDTO {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    centerId?: string;
    sortBy: 'full_name' | 'created_at' | 'farmer_code';
    sortOrder: 'asc' | 'desc';
}
export declare class CustomerService {
    /**
     * Register a new dairy farmer customer.
     */
    static createCustomer(dto: CreateCustomerDTO, context: AuthContext): Promise<CustomerProfile>;
    /**
     * Fetch customer profile by ID with strict scope enforcement.
     */
    static getCustomer(customerId: string, context: AuthContext): Promise<CustomerProfile>;
    /**
     * List customers with pagination, status filters, and search.
     */
    static listCustomers(query: CustomerQueryDTO, context: AuthContext): Promise<PaginatedCustomersResult>;
    /**
     * Update editable customer profile fields.
     */
    static updateCustomer(customerId: string, dto: UpdateCustomerDTO, context: AuthContext): Promise<CustomerProfile>;
    /**
     * Soft-delete customer.
     */
    static softDeleteCustomer(customerId: string, reason: string, context: AuthContext): Promise<CustomerProfile>;
    /**
     * Restore soft-deleted customer.
     */
    static restoreCustomer(customerId: string, reason: string, context: AuthContext): Promise<CustomerProfile>;
    /**
     * Customer Dashboard (P18 Mobile App Section 4)
     */
    static getDashboard(customerId: string, context: AuthContext): Promise<{
        customer: {
            id: string;
            farmerCode: string;
            fullName: string;
            normalizedMobileNumber: string;
            primaryCenterId: string;
            status: import("@dfarm/shared-types").CustomerStatus;
            bankName: string | null | undefined;
            bankAccountMask: string | null;
            bankIfscCode: string | null | undefined;
        };
        financials: {
            currentBalance: number;
            currency: any;
            accountStatus: any;
            balanceStatus: string;
        };
        todayStats: {
            businessDate: string;
            todayCowMilkKg: number;
            todayCowAmount: number;
            todayBuffaloMilkKg: number;
            todayBuffaloAmount: number;
            totalWeightKg: number;
            totalAmount: number;
        };
        currentMonthStats: {
            totalMilkWeightKg: number;
            totalMilkAmount: number;
            collectionsCount: number;
        };
        recentCollection: {
            sessionId: any;
            milkCategory: any;
            shiftType: any;
            businessDate: any;
            netWeight: number;
            measurementUnit: any;
            fatPercentage: number;
            snfPercentage: number;
            appliedRatePerUnit: number;
            totalAmount: number;
            receiptNumber: any;
            completedAt: any;
        } | null;
        pendingBill: {
            id: any;
            billNumber: any;
            billStatus: any;
            netPayableAmount: number;
            isNegativeBalance: any;
            closingBalance: number;
            periodName: any;
            createdAt: any;
        } | null;
        recentPayment: {
            id: any;
            amount: number;
            currency: any;
            paymentMethod: any;
            status: any;
            direction: any;
            referenceNumber: any;
            date: any;
        } | null;
    }>;
    /**
     * In-App Notifications (P18 Mobile App Section 12)
     */
    static getNotifications(customerId: string, context: AuthContext): Promise<{
        customerId: string;
        unreadCount: number;
        notifications: {
            id: any;
            organizationId: any;
            customerId: any;
            title: any;
            message: any;
            type: any;
            metadata: any;
            isRead: any;
            readAt: any;
            createdAt: any;
        }[];
    }>;
    static markNotificationRead(customerId: string, notificationId: string, context: AuthContext): Promise<{
        success: boolean;
        notificationId: string;
    }>;
    static markAllNotificationsRead(customerId: string, context: AuthContext): Promise<{
        success: boolean;
        customerId: string;
    }>;
    /**
     * Customer Self-Service Profile Update (P18 Mobile App Section 10)
     */
    static updateProfileSelfService(customerId: string, data: {
        email?: string;
        preferredLanguage?: string;
        notificationConsent?: boolean;
    }, context: AuthContext): Promise<{
        success: boolean;
        customerId: string;
        message: string;
        preferences: {
            preferredLanguage: string;
            notificationConsent: boolean;
        };
    }>;
}
//# sourceMappingURL=customer.service.d.ts.map