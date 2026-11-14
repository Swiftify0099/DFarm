/**
 * Payments & Payout History API
 * Payout receipts, payment status, reference numbers, reversals, and debt history.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerPayoutItem {
  id: string;
  center_id: string;
  direction: 'DAIRY_PAYS_CUSTOMER' | 'CUSTOMER_PAYS_DAIRY';
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  reference_number?: string | null;
  bank_account_mask?: string | null;
  created_at: string;
  settled_at?: string | null;
  failure_reason?: string | null;
  batch_id?: string | null;
}

export interface CustomerPayoutsResponse {
  customerId: string;
  total: number;
  limit: number;
  offset: number;
  payouts: CustomerPayoutItem[];
}

export interface CustomerPaymentSummaryData {
  customerId: string;
  currency: string;
  totalSettledPayouts: number;
  totalPendingPayouts: number;
  totalFailedPayouts: number;
  totalReceiptsRepaid: number;
  payoutCount: number;
  currentBalance: number;
}

export const paymentsApi = {
  async getPayoutHistory(
    customerId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ data: CustomerPayoutsResponse; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `payouts_${customerId}_${limit}_${offset}`;

    try {
      const data = await request<CustomerPayoutsResponse>(
        `/payments/customers/${customerId}?limit=${limit}&offset=${offset}`,
        { method: 'GET' }
      );
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerPayoutsResponse>(cacheKey);
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

  async getPaymentSummary(
    customerId: string
  ): Promise<{ data: CustomerPaymentSummaryData; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `payment_summary_${customerId}`;

    try {
      const data = await request<CustomerPaymentSummaryData>(
        `/payments/customers/${customerId}/summary`,
        { method: 'GET' }
      );
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerPaymentSummaryData>(cacheKey);
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

  async getPayoutReceiptSlip(paymentId: string): Promise<string> {
    const res = await request<{ receiptText: string }>(
      `/payments/${paymentId}/receipt`,
      { method: 'GET' }
    );
    return res.receiptText;
  },
};
