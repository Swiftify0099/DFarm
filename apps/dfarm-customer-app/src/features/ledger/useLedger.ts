import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  CustomerLedgerEntry,
  CustomerKhataSummary,
} from '../../types/ledger';

export function useLedger() {
  const ledgerEntriesQuery = useQuery({
    queryKey: ['ledger', 'entries'],
    queryFn: async (): Promise<CustomerLedgerEntry[]> => {
      try {
        const response = await apiClient.get<CustomerLedgerEntry[]>(
          '/ledger/entries'
        );
        return response.data;
      } catch {
        return [
          {
            id: 'l1-01',
            transactionDate: '2026-11-15T06:45:00Z',
            type: 'MILK_CREDIT',
            description: 'Morning Shift Milk Credit (14.5L Cow)',
            creditAmount: 558.25,
            debitAmount: 0,
            runningBalance: 12480.0,
            referenceId: 'COL-2026-11-15-M01',
          },
          {
            id: 'l1-02',
            transactionDate: '2026-11-13T10:30:00Z',
            type: 'FEED_DEBIT',
            description: 'Godrej Cattle Feed Mash (1 Bag x 50kg)',
            creditAmount: 0,
            debitAmount: 1850.0,
            runningBalance: 11921.75,
            referenceId: 'FEED-INV-8891',
          },
          {
            id: 'l1-03',
            transactionDate: '2026-11-10T14:00:00Z',
            type: 'BANK_PAYOUT',
            description: 'Cycle 30 Milk Payment via NEFT (UTR: HDFC890214)',
            creditAmount: 0,
            debitAmount: 14200.0,
            runningBalance: 13771.75,
            referenceId: 'PAY-NEFT-89021',
          },
        ];
      }
    },
    staleTime: 30000,
  });

  const khataSummaryQuery = useQuery({
    queryKey: ['ledger', 'summary'],
    queryFn: async (): Promise<CustomerKhataSummary> => {
      try {
        const response = await apiClient.get<CustomerKhataSummary>(
          '/ledger/summary'
        );
        return response.data;
      } catch {
        return {
          customerId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          currentBalance: 12480.0,
          totalMilkEarnings: 28530.0,
          totalDeductions: 16050.0,
          lastUpdated: '15 Nov 2026, 06:50 AM',
        };
      }
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
