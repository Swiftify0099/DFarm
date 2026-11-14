import { apiClient } from './client.js';

export const reportsApi = {
  getDailyCollection: (params?: { date?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/daily-collections', params),

  getMonthlyCollection: (params?: { month?: number; year?: number; centerId?: string }) =>
    apiClient.get<any[]>('/reports/monthly-collections', params),

  getFarmerWise: (params?: { startDate?: string; endDate?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/farmer-wise', params),

  getCowBuffalo: (params?: { startDate?: string; endDate?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/cow-buffalo', params),

  getFatSnf: (params?: { startDate?: string; endDate?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/fat-snf', params),

  getBillingSummary: (params?: { periodId?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/billing', params),

  getPayoutsSummary: (params?: { startDate?: string; endDate?: string; centerId?: string }) =>
    apiClient.get<any[]>('/reports/payouts', params),

  // Ledger & Financial Reports
  getLedgerRegister: (params?: { startDate?: string; endDate?: string; centerId?: string }) =>
    apiClient.get<any[]>('/ledger/reports/register', params),

  getBalancesReport: (params?: { centerId?: string }) =>
    apiClient.get<any[]>('/ledger/reports/balances', params),

  getCenterLiabilities: (params?: { centerId?: string }) =>
    apiClient.get<any[]>('/ledger/reports/center-liabilities', params),

  getOutstandingAdvances: (params?: { centerId?: string }) =>
    apiClient.get<any[]>('/ledger/reports/advances', params),

  // Feed Stock Reports
  getFeedStockReport: (params?: { centerId?: string; type?: string }) =>
    apiClient.get<any>('/inventory/reports', params),
};
