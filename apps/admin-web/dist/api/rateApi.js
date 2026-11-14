import { apiClient } from './client.js';
export const rateApi = {
    listCharts: (params) => apiClient.get('/rates', params),
    createChart: (data) => apiClient.post('/rates', data),
    getChart: (rateChartId) => apiClient.get(`/rates/${rateChartId}`),
    listVersions: (rateChartId) => apiClient.get(`/rates/${rateChartId}/versions`),
    createVersion: (rateChartId, data) => apiClient.post(`/rates/${rateChartId}/versions`, data),
    getVersion: (rateChartId, versionId) => apiClient.get(`/rates/${rateChartId}/versions/${versionId}`),
    updateMatrixCells: (rateChartId, versionId, cells) => apiClient.put(`/rates/${rateChartId}/versions/${versionId}/matrix`, { cells }),
    previewCalculation: (rateChartId, versionId, data) => apiClient.post(`/rates/${rateChartId}/versions/${versionId}/preview`, data),
    submitVersion: (rateChartId, versionId) => apiClient.post(`/rates/${rateChartId}/versions/${versionId}/submit`),
    approveVersion: (rateChartId, versionId) => apiClient.post(`/rates/${rateChartId}/versions/${versionId}/approve`),
    publishVersion: (rateChartId, versionId) => apiClient.post(`/rates/${rateChartId}/versions/${versionId}/publish`),
    calculate: (data) => apiClient.post('/rates/calculate', data),
};
//# sourceMappingURL=rateApi.js.map