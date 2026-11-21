import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { BillStatement } from '../../types/bills';
import { normalizeBillStatement } from '../../utils/normalizers';
import { useAuth } from '../auth/useAuth';

export { normalizeBillStatement };

export function useBills() {
  const { session } = useAuth();

  const billsQuery = useQuery({
    queryKey: ['bills', 'list', session?.dairyId, session?.customerId],
    queryFn: async (): Promise<BillStatement[]> => {
      const response = await apiClient.get<any>('/bills');
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.data?.bills)
        ? response.data.data.bills
        : [];
      const normalized: BillStatement[] = list.map(normalizeBillStatement);
      return normalized;
    },
    staleTime: 60000,
  });

  return {
    bills: billsQuery.data || [],
    isLoadingBills: billsQuery.isLoading,
    refetch: billsQuery.refetch,
  };
}
