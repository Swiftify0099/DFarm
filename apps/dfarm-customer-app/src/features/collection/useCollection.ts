import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  MilkCollectionRecord,
  MonthlyMilkSummary,
} from '../../types/collection';
import { normalizeMilkCollectionRecord } from '../../utils/normalizers';
import { useAuth } from '../auth/useAuth';

export { normalizeMilkCollectionRecord };

export function useCollection(filters?: {
  startDate?: string;
  endDate?: string;
  animalType?: 'ALL' | 'COW' | 'BUFFALO';
  page?: number;
  pageSize?: number;
}) {
  const { session } = useAuth();
  const boundedFilters = {
    page: 1,
    pageSize: 30,
    ...filters,
  };

  const collectionListQuery = useQuery({
    queryKey: ['collection', 'list', session?.dairyId, session?.customerId, boundedFilters],
    queryFn: async (): Promise<MilkCollectionRecord[]> => {
      const response = await apiClient.get<any>(
        '/collection/history',
        { params: boundedFilters }
      );
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.data?.items)
        ? response.data.data.items
        : [];
      const normalized: MilkCollectionRecord[] = list.map(normalizeMilkCollectionRecord);
      if (boundedFilters.animalType && boundedFilters.animalType !== 'ALL') {
        return normalized.filter((item: MilkCollectionRecord) => item.animalType === boundedFilters.animalType);
      }
      return normalized;
    },
    staleTime: 30000,
  });

  const monthlySummaryQuery = useQuery({
    queryKey: ['collection', 'monthly-summary', session?.dairyId, session?.customerId],
    queryFn: async (): Promise<MonthlyMilkSummary> => {
      const response = await apiClient.get<any>(
        '/collection/summary/monthly'
      );
      const raw = response.data?.data || response.data || {};
      return {
        monthYear: String(
          raw.monthYear || new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })
        ),
        totalLiters: Number(raw.totalLiters ?? 0),
        cowLiters: Number(raw.cowLiters ?? 0),
        buffaloLiters: Number(raw.buffaloLiters ?? 0),
        avgFat: Number(raw.avgFat ?? 0),
        avgSnf: Number(raw.avgSnf ?? 0),
        totalAmount: Number(raw.totalAmount ?? 0),
        transactionCount: Number(raw.transactionCount ?? 0),
      };
    },
    staleTime: 60000,
  });

  return {
    collections: collectionListQuery.data || [],
    isLoadingCollections: collectionListQuery.isLoading,
    refetchCollections: collectionListQuery.refetch,
    monthlySummary: monthlySummaryQuery.data,
    isLoadingSummary: monthlySummaryQuery.isLoading,
  };
}
