import { apiClient } from './client.js';
export const paymentApi = {
    // Payouts
    createPayout: (data) => apiClient.post('/payments/payouts', data),
    approvePayout: (payoutId) => apiClient.post(`/payments/payouts/${payoutId}/approve`),
    submitPayout: (payoutId) => apiClient.post(`/payments/payouts/${payoutId}/submit`),
    confirmPayout: (payoutId, data) => apiClient.post(`/payments/payouts/${payoutId}/confirm`, data),
    failPayout: (payoutId, reason) => apiClient.post(`/payments/payouts/${payoutId}/fail`, { failureReason: reason }),
    reversePayout: (payoutId, reason) => apiClient.post(`/payments/payouts/${payoutId}/reverse`, { reason }),
    getPayoutById: (payoutId) => apiClient.get(`/payments/${payoutId}`),
    getPayoutReceipt: (payoutId) => apiClient.get(`/payments/${payoutId}/receipt`),
    // Receipts
    createReceipt: (data) => apiClient.post('/payments/receipts', data),
    confirmReceipt: (receiptId, data) => apiClient.post(`/payments/receipts/${receiptId}/confirm`, data),
    getReceiptById: (receiptId) => apiClient.get(`/payments/receipts/${receiptId}`),
    // Bulk Batches
    createBatch: (data) => apiClient.post('/payments/batches', data),
    getBatchById: (batchId) => apiClient.get(`/payments/batches/${batchId}`),
    approveBatch: (batchId) => apiClient.post(`/payments/batches/${batchId}/approve`),
    submitBatch: (batchId) => apiClient.post(`/payments/batches/${batchId}/submit`),
    reconcileBatch: (batchId, results) => apiClient.post(`/payments/batches/${batchId}/reconcile`, { results }),
    // Bank Reconciliation
    importStatement: (data) => apiClient.post('/reconciliation/import', data),
    getReconciliationRecords: (params) => apiClient.get('/reconciliation', params),
    resolveRecord: (recordId, data) => apiClient.post(`/reconciliation/${recordId}/resolve`, data),
    // Advances & Deductions
    createAdvance: (customerId, data) => apiClient.post(`/ledger/${customerId}/advances`, data),
    approveAdvance: (advanceId, data) => apiClient.post(`/ledger/advances/${advanceId}/approve`, data),
    rejectAdvance: (advanceId, reason) => apiClient.post(`/ledger/advances/${advanceId}/reject`, { reason }),
    recoverAdvance: (advanceId, amount) => apiClient.post(`/ledger/advances/${advanceId}/recover`, { amount }),
    createDeduction: (customerId, data) => apiClient.post(`/ledger/${customerId}/deductions`, data),
    getAccounts: (params) => apiClient.get('/ledger/accounts', params),
    reconcileAccount: (data) => apiClient.post('/ledger/reconcile', data),
};
//# sourceMappingURL=paymentApi.js.map