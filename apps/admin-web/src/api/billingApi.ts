import { apiClient } from './client.js';

export interface BillingPeriod {
  id: string;
  organizationId: string;
  centerId: string;
  centerName?: string;
  periodName: string;
  periodType: 'TEN_DAY' | 'MONTHLY' | 'CUSTOM';
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CALCULATING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'FINALIZED' | 'CLOSED';
  totalBills: number;
  totalGrossAmount: number;
  totalDeductions: number;
  totalNetAmount: number;
  totalQuantityLiters: number;
  createdAt: string;
}

export interface MonthlyBill {
  id: string;
  billingPeriodId: string;
  customerId: string;
  customerName?: string;
  farmerCode?: string;
  billNumber: string;
  totalQuantityLiters: number;
  averageFat: number;
  averageSnf: number;
  grossAmount: number;
  feedDeductions: number;
  advanceDeductions: number;
  otherDeductions: number;
  totalDeductions: number;
  netPayableAmount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'FINALIZED' | 'PAID';
  finalizedAt?: string | null;
  sha256Checksum?: string;
  createdAt: string;
}

export const billingApi = {
  listPeriods: (params?: { centerId?: string; status?: string; page?: number; limit?: number }) =>
    apiClient.get<any>('/billing/periods', params),

  createPeriod: (data: { centerId: string; periodName: string; periodType: string; startDate: string; endDate: string }) =>
    apiClient.post<BillingPeriod>('/billing/periods', data),

  getPeriod: (periodId: string) =>
    apiClient.get<any>(`/billing/periods/${periodId}`),

  generateBills: (periodId: string, options?: { forceRecalculate?: boolean; customerIds?: string[] }) =>
    apiClient.post<any>(`/billing/periods/${periodId}/generate`, options || {}),

  getPeriodProgress: (periodId: string) =>
    apiClient.get<any>(`/billing/periods/${periodId}/progress`),

  submitReview: (billId: string, notes?: string) =>
    apiClient.post<MonthlyBill>(`/billing/${billId}/submit-review`, { notes }),

  approveBill: (billId: string, notes?: string) =>
    apiClient.post<MonthlyBill>(`/billing/${billId}/approve`, { notes }),

  finalizeBill: (billId: string, notes?: string) =>
    apiClient.post<MonthlyBill>(`/billing/${billId}/finalize`, { notes }),

  adjustBill: (billId: string, data: { adjustmentType: string; amount: number; reason: string }) =>
    apiClient.post<MonthlyBill>(`/billing/${billId}/adjust`, data),

  downloadPdf: (billId: string, billNumber?: string) =>
    apiClient.download(`/billing/${billId}/pdf`, `${billNumber || billId}_statement.pdf`),
};
