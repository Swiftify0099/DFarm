import { apiClient } from './client.js';
export const billingApi = {
    listPeriods: (params) => apiClient.get('/billing/periods', params),
    createPeriod: (data) => apiClient.post('/billing/periods', data),
    getPeriod: (periodId) => apiClient.get(`/billing/periods/${periodId}`),
    generateBills: (periodId, options) => apiClient.post(`/billing/periods/${periodId}/generate`, options || {}),
    getPeriodProgress: (periodId) => apiClient.get(`/billing/periods/${periodId}/progress`),
    submitReview: (billId, notes) => apiClient.post(`/billing/${billId}/submit-review`, { notes }),
    approveBill: (billId, notes) => apiClient.post(`/billing/${billId}/approve`, { notes }),
    finalizeBill: (billId, notes) => apiClient.post(`/billing/${billId}/finalize`, { notes }),
    adjustBill: (billId, data) => apiClient.post(`/billing/${billId}/adjust`, data),
    downloadPdf: (billId, billNumber) => apiClient.download(`/billing/${billId}/pdf`, `${billNumber || billId}_statement.pdf`),
};
//# sourceMappingURL=billingApi.js.map