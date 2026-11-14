/**
 * Customer Dashboard API
 * Fetches server-authoritative customer metrics and financial standing.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerDashboardData {
  customer: {
    id: string;
    farmerCode: string;
    fullName: string;
    normalizedMobileNumber: string;
    primaryCenterId: string;
    status: string;
    bankName?: string | null;
    bankAccountMask?: string | null;
    bankIfscCode?: string | null;
  };
  financials: {
    currentBalance: number;
    currency: string;
    accountStatus: string;
    balanceStatus: 'DAIRY_OWES_CUSTOMER' | 'CUSTOMER_OWES_DAIRY' | 'SETTLED';
  };
  todayStats: {
    businessDate: string;
    todayCowMilkKg: number;
    todayCowAmount: number;
    todayBuffaloMilkKg: number;
    todayBuffaloAmount: number;
    totalWeightKg: number;
    totalAmount: number;
  };
  currentMonthStats: {
    totalMilkWeightKg: number;
    totalMilkAmount: number;
    collectionsCount: number;
  };
  recentCollection: {
    sessionId: string;
    milkCategory: 'COW' | 'BUFFALO';
    shiftType: 'MORNING' | 'EVENING';
    businessDate: string;
    netWeight: number;
    measurementUnit: string;
    fatPercentage: number;
    snfPercentage: number;
    appliedRatePerUnit: number;
    totalAmount: number;
    receiptNumber: string;
    completedAt: string;
  } | null;
  pendingBill: {
    id: string;
    billNumber: string;
    billStatus: string;
    netPayableAmount: number;
    isNegativeBalance: boolean;
    closingBalance: number;
    periodName: string;
    createdAt: string;
  } | null;
  recentPayment: {
    id: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: string;
    direction: string;
    referenceNumber?: string | null;
    date: string;
  } | null;
}

export const dashboardApi = {
  async getDashboard(customerId: string): Promise<{ data: CustomerDashboardData; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `dashboard_${customerId}`;

    try {
      const data = await request<CustomerDashboardData>(`/customers/${customerId}/dashboard`, {
        method: 'GET',
      });
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      // Fallback to local cache if offline
      const cached = await getCachedData<CustomerDashboardData>(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          syncedAt: cached.syncedAt,
        };
      }
      throw err;
    }
  },
};
