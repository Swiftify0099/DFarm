import { apiClient } from './client.js';
export const collectionApi = {
    getShiftSummary: (params) => apiClient.get('/collections/shift-summary', params),
    getHistory: (params) => apiClient.get('/collections/history', params),
    adjustCollection: (sessionId, payload) => apiClient.post(`/collections/sessions/${sessionId}/adjust`, payload),
    getReceiptSlip: (sessionId) => apiClient.get(`/collections/sessions/${sessionId}/receipt`),
};
//# sourceMappingURL=collectionApi.js.map