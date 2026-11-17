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
}) {
  const collectionListQuery = useQuery({
    queryKey: ['collection', 'list', filters],
    queryFn: async (): Promise<MilkCollectionRecord[]> => {
      const response = await apiClient.get<any>(
        '/collection/history',
        { params: filters }
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
