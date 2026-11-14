/**
 * Feed Purchase History API
 * Customer feed purchase invoices, cattle feed inventory items, and returns.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface FeedSaleItemData {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxAmount: number;
  totalAmount: number;
  product?: {
    id: string;
    code: string;
    name: string;
    packSize: number;
    packUnit: string;
  };
}

export interface FeedSaleData {
  id: string;
  organizationId: string;
  centerId: string;
  customerId: string;
  invoiceNumber: string;
  receiptNumber: string;
  saleDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMode: 'CREDIT' | 'CASH';
  status: string;
  createdAt: string;
  items?: FeedSaleItemData[];
}

export const feedApi = {
  async getCustomerFeedPurchases(
    customerId: string
  ): Promise<{ data: FeedSaleData[]; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `feed_sales_${customerId}`;

    try {
      // Backend automatically applies customer ownership isolation
      const data = await request<FeedSaleData[]>(`/feed/sales?customerId=${customerId}`, {
        method: 'GET',
      });
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<FeedSaleData[]>(cacheKey);
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

  async getFeedSaleDetails(saleId: string): Promise<FeedSaleData> {
    return request<FeedSaleData>(`/feed/sales/${saleId}`, {
      method: 'GET',
    });
  },
};
