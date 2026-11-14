import { apiClient } from './client.js';
export const customerApi = {
    list: (params) => apiClient.get('/customers', params),
    getById: (customerId) => apiClient.get(`/customers/${customerId}`),
    create: (data) => apiClient.post('/customers', data),
    update: (customerId, data) => apiClient.patch(`/customers/${customerId}`, data),
    softDelete: (customerId, reason) => apiClient.delete(`/customers/${customerId}`, { reason }),
    restore: (customerId, reason) => apiClient.post(`/customers/${customerId}/restore`, { reason }),
    // Biometrics Face Status (never exposes raw embeddings)
    getFaceStatus: (customerId) => apiClient.get(`/customers/${customerId}/face-status`),
    revokeFace: (customerId, reason) => apiClient.post(`/customers/${customerId}/face-revoke`, { reason }),
    // RFID Card Status
    getRfidStatus: (customerId) => apiClient.get(`/customers/${customerId}/rfid-status`),
    assignRfid: (customerId, data) => apiClient.post(`/customers/${customerId}/rfid-assign`, data),
    replaceRfid: (customerId, data) => apiClient.post(`/customers/${customerId}/rfid-replace`, data),
    // Ledger & Financials
    getLedgerSummary: (customerId) => apiClient.get(`/customers/${customerId}/ledger/summary`),
    getLedgerTransactions: (customerId, params) => apiClient.get(`/customers/${customerId}/ledger/transactions`, params),
    getStatement: (customerId, params) => apiClient.get(`/customers/${customerId}/ledger/statement`, params),
    getBillingStatement: (customerId, periodId) => apiClient.get(`/billing/customers/${customerId}/statement`, { periodId }),
    getPayouts: (customerId) => apiClient.get(`/payments/customers/${customerId}`),
    getPaymentSummary: (customerId) => apiClient.get(`/payments/customers/${customerId}/summary`),
};
//# sourceMappingURL=customerApi.js.map