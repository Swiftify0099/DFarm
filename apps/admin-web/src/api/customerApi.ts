import { apiClient } from './client.js';

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

export const customerApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; centerId?: string; isDeleted?: boolean }) =>
    apiClient.get<CustomerListResponse>('/customers', params),

  getById: (customerId: string) =>
    apiClient.get<Customer>(`/customers/${customerId}`),

  create: (data: any) =>
    apiClient.post<Customer>('/customers', data),

  update: (customerId: string, data: any) =>
    apiClient.patch<Customer>(`/customers/${customerId}`, data),

  softDelete: (customerId: string, reason: string) =>
    apiClient.delete<any>(`/customers/${customerId}`, { reason }),

  restore: (customerId: string, reason: string) =>
    apiClient.post<any>(`/customers/${customerId}/restore`, { reason }),

  // Biometrics Face Status (never exposes raw embeddings)
  getFaceStatus: (customerId: string) =>
    apiClient.get<CustomerFaceStatus>(`/customers/${customerId}/face-status`),

  revokeFace: (customerId: string, reason: string) =>
    apiClient.post<any>(`/customers/${customerId}/face-revoke`, { reason }),

  // RFID Card Status
  getRfidStatus: (customerId: string) =>
    apiClient.get<CustomerRfidStatus>(`/customers/${customerId}/rfid-status`),

  assignRfid: (customerId: string, data: { cardUid: string; technology?: string }) =>
    apiClient.post<any>(`/customers/${customerId}/rfid-assign`, data),

  replaceRfid: (customerId: string, data: { newCardUid: string; replacementReason: string }) =>
    apiClient.post<any>(`/customers/${customerId}/rfid-replace`, data),

  // Ledger & Financials
  getLedgerSummary: (customerId: string) =>
    apiClient.get<CustomerLedgerSummary>(`/customers/${customerId}/ledger/summary`),

  getLedgerTransactions: (customerId: string, params?: { limit?: number; offset?: number; startDate?: string; endDate?: string }) =>
    apiClient.get<any>(`/customers/${customerId}/ledger/transactions`, params),

  getStatement: (customerId: string, params?: { startDate?: string; endDate?: string }) =>
    apiClient.get<any>(`/customers/${customerId}/ledger/statement`, params),

  getBillingStatement: (customerId: string, periodId?: string) =>
    apiClient.get<any>(`/billing/customers/${customerId}/statement`, { periodId }),

  getPayouts: (customerId: string) =>
    apiClient.get<any>(`/payments/customers/${customerId}`),

  getPaymentSummary: (customerId: string) =>
    apiClient.get<any>(`/payments/customers/${customerId}/summary`),
};
