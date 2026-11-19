import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  CustomerLedgerEntry,
  CustomerKhataSummary,
} from '../../types/ledger';

export function useLedger(params?: { page?: number; pageSize?: number }) {
  const boundedParams = {
    page: 1,
    pageSize: 30,
    ...params,
  };

  const ledgerEntriesQuery = useQuery({
    queryKey: ['ledger', 'entries', boundedParams],
    queryFn: async (): Promise<CustomerLedgerEntry[]> => {
      const response = await apiClient.get<any>('/ledger/entries', {
        params: boundedParams,
      });
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      return list;
    },
    staleTime: 30000,
  });

  const khataSummaryQuery = useQuery({
    queryKey: ['ledger', 'summary'],
    queryFn: async (): Promise<CustomerKhataSummary> => {
      const response = await apiClient.get<any>('/ledger/summary');
      return response.data?.data || response.data;
    },
    staleTime: 30000,
  });

  return {
    entries: ledgerEntriesQuery.data || [],
    isLoadingEntries: ledgerEntriesQuery.isLoading,
    summary: khataSummaryQuery.data,
    isLoadingSummary: khataSummaryQuery.isLoading,
    refetch: () => {
      ledgerEntriesQuery.refetch();
      khataSummaryQuery.refetch();
    },
  };
}
