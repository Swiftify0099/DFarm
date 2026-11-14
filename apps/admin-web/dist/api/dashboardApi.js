import { apiClient } from './client.js';
export const dashboardApi = {
    getMetrics: (params) => apiClient.get('/dashboard/metrics', params),
};
//# sourceMappingURL=dashboardApi.js.map