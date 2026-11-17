import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { BillStatement } from '../../types/bills';

export function useBills() {
  const billsQuery = useQuery({
    queryKey: ['bills', 'list'],
    queryFn: async (): Promise<BillStatement[]> => {
      const response = await apiClient.get<any>('/bills');
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      return list;
    },
    staleTime: 60000,
  });

  return {
    bills: billsQuery.data || [],
    isLoadingBills: billsQuery.isLoading,
    refetch: billsQuery.refetch,
  };
}
