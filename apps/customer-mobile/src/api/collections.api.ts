/**
 * Milk Collections API
 * Retrieves daily intake records, morning/evening shifts, cow/buffalo deliveries, and thermal slips.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerCollectionItem {
  sessionId: string;
  collectionId?: string;
  customerId: string;
  farmerCode: string;
  customerName: string;
  milkCategory: 'COW' | 'BUFFALO';
  shiftType: 'MORNING' | 'EVENING';
  businessDate: string;
  sessionState: string;
  netWeight: number;
  measurementUnit: string; // e.g. 'KG'
  fatPercentage: number;
  snfPercentage: number;
  appliedRatePerUnit: number;
  totalAmount: number;
  receiptNumber: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CollectionsListResponse {
  customerId: string;
  total: number;
  limit: number;
  offset: number;
  collections: CustomerCollectionItem[];
}

export interface CollectionFilters {
  startDate?: string;
  endDate?: string;
  category?: 'COW' | 'BUFFALO';
  shift?: 'MORNING' | 'EVENING';
  limit?: number;
  offset?: number;
}

export const collectionsApi = {
  async getCustomerCollections(
    customerId: string,
    filters: CollectionFilters = {}
  ): Promise<{ data: CollectionsListResponse; fromCache: boolean; syncedAt: string }> {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.category) params.append('category', filters.category);
    if (filters.shift) params.append('shift', filters.shift);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const cacheKey = `collections_${customerId}_${params.toString()}`;

    try {
      const data = await request<CollectionsListResponse>(
        `/collections/customer/${customerId}?${params.toString()}`,
        { method: 'GET' }
      );
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CollectionsListResponse>(cacheKey);
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

  async getSessionReceipt(sessionId: string): Promise<string> {
    const res = await request<{ receiptText: string }>(
      `/collections/sessions/${sessionId}/receipt`,
      { method: 'GET' }
    );
    return res.receiptText;
  },
};
