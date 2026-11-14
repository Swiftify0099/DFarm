import { apiClient } from './client.js';
export const reportsApi = {
    getDailyCollection: (params) => apiClient.get('/reports/daily-collections', params),
    getMonthlyCollection: (params) => apiClient.get('/reports/monthly-collections', params),
    getFarmerWise: (params) => apiClient.get('/reports/farmer-wise', params),
    getCowBuffalo: (params) => apiClient.get('/reports/cow-buffalo', params),
    getFatSnf: (params) => apiClient.get('/reports/fat-snf', params),
    getBillingSummary: (params) => apiClient.get('/reports/billing', params),
    getPayoutsSummary: (params) => apiClient.get('/reports/payouts', params),
    // Ledger & Financial Reports
    getLedgerRegister: (params) => apiClient.get('/ledger/reports/register', params),
    getBalancesReport: (params) => apiClient.get('/ledger/reports/balances', params),
    getCenterLiabilities: (params) => apiClient.get('/ledger/reports/center-liabilities', params),
    getOutstandingAdvances: (params) => apiClient.get('/ledger/reports/advances', params),
    // Feed Stock Reports
    getFeedStockReport: (params) => apiClient.get('/inventory/reports', params),
};
//# sourceMappingURL=reportsApi.js.map