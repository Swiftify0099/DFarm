import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  CustomerLedgerEntry,
  CustomerKhataSummary,
} from '../../types/ledger';
import { normalizeLedgerEntry } from '../../utils/normalizers';
import { useAuth } from '../auth/useAuth';

export { normalizeLedgerEntry };

export function useLedger(params?: { page?: number; pageSize?: number }) {
  const { session } = useAuth();
  const boundedParams = {
    page: 1,
    pageSize: 30,
    ...params,
  };

  const ledgerEntriesQuery = useQuery({
    queryKey: ['ledger', 'entries', session?.dairyId, session?.customerId, boundedParams],
    queryFn: async (): Promise<CustomerLedgerEntry[]> => {
      const response = await apiClient.get<any>('/ledger/entries', {
        params: boundedParams,
      });
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.data?.items)
        ? response.data.data.items
        : [];
      const normalized: CustomerLedgerEntry[] = list.map(normalizeLedgerEntry);
      return normalized;
    },
    staleTime: 30000,
  });

  const khataSummaryQuery = useQuery({
    queryKey: ['ledger', 'summary', session?.dairyId, session?.customerId],
    queryFn: async (): Promise<CustomerKhataSummary> => {
      const response = await apiClient.get<any>('/ledger/summary');
      const raw = response.data?.data || response.data || {};
      return {
        customerId: String(raw.customerId || ''),
        currentBalance: Number(raw.currentBalance ?? raw.balance ?? 0),
        totalMilkEarnings: Number(raw.totalMilkEarnings ?? raw.totalEarnings ?? 0),
        totalDeductions: Number(raw.totalDeductions ?? 0),
        lastUpdated: String(raw.lastUpdated || new Date().toISOString()),
      };
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
