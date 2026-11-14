export interface Customer {
    id: string;
    organizationId: string;
    primaryCenterId: string;
    farmerCode: string;
    fullName: string;
    normalizedMobileNumber: string;
    mobileNumber?: string;
    status: string;
    kycStatus?: string;
    preferredLanguage?: string;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    centerName?: string;
    milkCategories?: string[];
    address?: {
        village?: string;
        taluka?: string;
        district?: string;
        pincode?: string;
    };
}
export interface CustomerListResponse {
    items: Customer[];
    customers?: Customer[];
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
}
export interface CustomerFaceStatus {
    customerId: string;
    isEnrolled: boolean;
    modelCode?: string;
    versionNumber?: string;
    enrolledAt?: string;
    activeEnrollmentId?: string;
    qualityPassed?: boolean;
}
export interface CustomerRfidStatus {
    customerId: string;
    isAssigned: boolean;
    cardUidMask?: string;
    status?: string;
    technology?: string;
    assignedAt?: string;
    cardId?: string;
}
export interface CustomerLedgerSummary {
    customerId: string;
    payableBalance: number;
    advanceOutstanding: number;
    totalMilkDeliveredKg: number;
    totalEarnings: number;
    totalDeductions: number;
    totalPayouts: number;
}
export interface CustomerLedgerEntry {
    id: string;
    transactionId: string;
    entryType: 'DEBIT' | 'CREDIT';
    accountType: string;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId?: string;
    referenceType?: string;
    createdAt: string;
}
export declare const customerApi: {
    list: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        centerId?: string;
        isDeleted?: boolean;
    }) => Promise<CustomerListResponse>;
    getById: (customerId: string) => Promise<Customer>;
    create: (data: any) => Promise<Customer>;
    update: (customerId: string, data: any) => Promise<Customer>;
    softDelete: (customerId: string, reason: string) => Promise<any>;
    restore: (customerId: string, reason: string) => Promise<any>;
    getFaceStatus: (customerId: string) => Promise<CustomerFaceStatus>;
    revokeFace: (customerId: string, reason: string) => Promise<any>;
    getRfidStatus: (customerId: string) => Promise<CustomerRfidStatus>;
    assignRfid: (customerId: string, data: {
        cardUid: string;
        technology?: string;
    }) => Promise<any>;
    replaceRfid: (customerId: string, data: {
        newCardUid: string;
        replacementReason: string;
    }) => Promise<any>;
    getLedgerSummary: (customerId: string) => Promise<CustomerLedgerSummary>;
    getLedgerTransactions: (customerId: string, params?: {
        limit?: number;
        offset?: number;
        startDate?: string;
        endDate?: string;
    }) => Promise<any>;
    getStatement: (customerId: string, params?: {
        startDate?: string;
        endDate?: string;
    }) => Promise<any>;
    getBillingStatement: (customerId: string, periodId?: string) => Promise<any>;
    getPayouts: (customerId: string) => Promise<any>;
    getPaymentSummary: (customerId: string) => Promise<any>;
};
//# sourceMappingURL=customerApi.d.ts.map