import { apiClient } from './client.js';

export interface PayoutRecord {
  id: string;
  organizationId: string;
  centerId: string;
  customerId: string;
  customerName?: string;
  farmerCode?: string;
  direction: 'DAIRY_PAYS_CUSTOMER';
  amount: number;
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SETTLED' | 'FAILED' | 'REVERSED';
  referenceNumber: string;
  bankAccountMask?: string | null;
  bankIfsc?: string | null;
  createdAt: string;
  settledAt?: string | null;
}

export interface PaymentBatch {
  id: string;
  batchNumber: string;
  status: 'DRAFT' | 'APPROVED' | 'SUBMITTED' | 'PARTIALLY_SETTLED' | 'SETTLED';
  totalBeneficiaries: number;
  totalAmount: number;
  successfulCount?: number;
  successfulAmount?: number;
  failedCount?: number;
  failedAmount?: number;
  paymentMethod: string;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  createdAt: string;
  items?: any[];
}

export interface CustomerAdvance {
  id: string;
  customerId: string;
  customerName?: string;
  farmerCode?: string;
  principalAmount: number;
  balanceAmount: number;
  recoveryPercentage: number;
  purpose: string;
  status: 'REQUESTED' | 'APPROVED' | 'DISBURSED' | 'RECOVERING' | 'RECOVERED' | 'REJECTED';
  disbursedAt?: string;
  createdAt: string;
}

export const paymentApi = {
  // Payouts
  createPayout: (data: { customerId: string; centerId: string; amount: number; paymentMethod: string; referenceNumber?: string; idempotencyKey: string }) =>
    apiClient.post<PayoutRecord>('/payments/payouts', data),

  approvePayout: (payoutId: string) =>
    apiClient.post<any>(`/payments/payouts/${payoutId}/approve`),

  submitPayout: (payoutId: string) =>
    apiClient.post<any>(`/payments/payouts/${payoutId}/submit`),

  confirmPayout: (payoutId: string, data: { bankTransactionReference: string }) =>
    apiClient.post<any>(`/payments/payouts/${payoutId}/confirm`, data),

  failPayout: (payoutId: string, reason: string) =>
    apiClient.post<any>(`/payments/payouts/${payoutId}/fail`, { failureReason: reason }),

  reversePayout: (payoutId: string, reason: string) =>
    apiClient.post<any>(`/payments/payouts/${payoutId}/reverse`, { reason }),

  getPayoutById: (payoutId: string) =>
    apiClient.get<PayoutRecord>(`/payments/${payoutId}`),

  getPayoutReceipt: (payoutId: string) =>
    apiClient.get<any>(`/payments/${payoutId}/receipt`),

  // Receipts
  createReceipt: (data: any) =>
    apiClient.post<any>('/payments/receipts', data),

  confirmReceipt: (receiptId: string, data: any) =>
    apiClient.post<any>(`/payments/receipts/${receiptId}/confirm`, data),

  getReceiptById: (receiptId: string) =>
    apiClient.get<any>(`/payments/receipts/${receiptId}`),

  // Bulk Batches
  createBatch: (data: { centerId?: string; billingCycleId?: string; billingPeriodStart?: string; billingPeriodEnd?: string; paymentMethod?: string; customerIds?: string[]; idempotencyKey: string }) =>
    apiClient.post<PaymentBatch>('/payments/batches', data),

  getBatchById: (batchId: string) =>
    apiClient.get<PaymentBatch>(`/payments/batches/${batchId}`),

  approveBatch: (batchId: string) =>
    apiClient.post<any>(`/payments/batches/${batchId}/approve`),

  submitBatch: (batchId: string) =>
    apiClient.post<any>(`/payments/batches/${batchId}/submit`),

  reconcileBatch: (batchId: string, results: any[]) =>
    apiClient.post<any>(`/payments/batches/${batchId}/reconcile`, { results }),

  // Bank Reconciliation
  importStatement: (data: { centerId?: string; statementDate: string; records: any[] }) =>
    apiClient.post<any>('/reconciliation/import', data),

  getReconciliationRecords: (params?: { centerId?: string; status?: string; startDate?: string; endDate?: string }) =>
    apiClient.get<any[]>('/reconciliation', params),

  resolveRecord: (recordId: string, data: { resolution: string; notes?: string }) =>
    apiClient.post<any>(`/reconciliation/${recordId}/resolve`, data),

  // Advances & Deductions
  createAdvance: (customerId: string, data: { principalAmount: number; recoveryPercentage: number; purpose: string; centerId: string }) =>
    apiClient.post<any>(`/ledger/${customerId}/advances`, data),

  approveAdvance: (advanceId: string, data: { approvedAmount: number }) =>
    apiClient.post<any>(`/ledger/advances/${advanceId}/approve`, data),

  rejectAdvance: (advanceId: string, reason: string) =>
    apiClient.post<any>(`/ledger/advances/${advanceId}/reject`, { reason }),

  recoverAdvance: (advanceId: string, amount: number) =>
    apiClient.post<any>(`/ledger/advances/${advanceId}/recover`, { amount }),

  createDeduction: (customerId: string, data: { amount: number; deductionCategory: string; reason: string; centerId: string }) =>
    apiClient.post<any>(`/ledger/${customerId}/deductions`, data),

  getAccounts: (params?: { centerId?: string; accountType?: string; minBalance?: number; limit?: number }) =>
    apiClient.get<any[]>('/ledger/accounts', params),

  reconcileAccount: (data: { customerId: string }) =>
    apiClient.post<any>('/ledger/reconcile', data),
};
