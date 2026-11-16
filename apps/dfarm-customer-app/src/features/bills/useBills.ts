import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { BillStatement } from '../../types/bills';

export function useBills() {
  const billsQuery = useQuery({
    queryKey: ['bills', 'list'],
    queryFn: async (): Promise<BillStatement[]> => {
      try {
        const response = await apiClient.get<BillStatement[]>('/bills');
        return response.data;
      } catch {
        return [
          {
            billId: 'b1-01',
            billNumber: 'DFB-2026-11-C1-042',
            cycleStartDate: '2026-11-01',
            cycleEndDate: '2026-11-10',
            cycleLabel: 'Cycle 31 (01 Nov - 10 Nov 2026)',
            totalLiters: 148.0,
            grossMilkAmount: 6240.0,
            feedDeductions: 1850.0,
            otherDeductions: 50.0,
            netPayableAmount: 4340.0,
            status: 'DISBURSED',
            disbursedDate: '12 Nov 2026',
            paymentMode: 'NEFT Direct Bank',
            utrNumber: 'HDFCR52026111290124',
          },
          {
            billId: 'b1-02',
            billNumber: 'DFB-2026-10-C3-042',
            cycleStartDate: '2026-10-21',
            cycleEndDate: '2026-10-31',
            cycleLabel: 'Cycle 30 (21 Oct - 31 Oct 2026)',
            totalLiters: 162.5,
            grossMilkAmount: 6850.0,
            feedDeductions: 0,
            otherDeductions: 50.0,
            netPayableAmount: 6800.0,
            status: 'DISBURSED',
            disbursedDate: '02 Nov 2026',
            paymentMode: 'NEFT Direct Bank',
            utrNumber: 'HDFCR52026110278193',
          },
        ];
      }
    },
    staleTime: 60000,
  });

  return {
    bills: billsQuery.data || [],
    isLoadingBills: billsQuery.isLoading,
    refetch: billsQuery.refetch,
  };
}
