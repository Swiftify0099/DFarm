import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  MilkCollectionRecord,
  MonthlyMilkSummary,
} from '../../types/collection';

export function useCollection(filters?: {
  startDate?: string;
  endDate?: string;
  animalType?: 'ALL' | 'COW' | 'BUFFALO';
  page?: number;
  pageSize?: number;
}) {
  const boundedFilters = {
    page: 1,
    pageSize: 30,
    ...filters,
  };

  const collectionListQuery = useQuery({
    queryKey: ['collection', 'list', boundedFilters],
    queryFn: async (): Promise<MilkCollectionRecord[]> => {
      const response = await apiClient.get<any>(
        '/collection/history',
        { params: boundedFilters }
      );
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      return list;
    },
    staleTime: 30000,
  });

  const monthlySummaryQuery = useQuery({
    queryKey: ['collection', 'monthly-summary'],
    queryFn: async (): Promise<MonthlyMilkSummary> => {
      const response = await apiClient.get<any>(
        '/collection/summary/monthly'
      );
      return response.data?.data || response.data;
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
