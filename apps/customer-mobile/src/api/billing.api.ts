/**
 * Monthly Billing & PDF Statement API
 * Authorized statements, cow/buffalo breakdowns, net payable and PDF downloads.
 */
import { request, API_BASE_URL } from './client';
import { getAuthToken } from '../storage/secure-token';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerStatementSummaryData {
  bill: {
    id: string;
    billingPeriodId: string;
    customerId: string;
    billNumber: string;
    billStatus: string;
    openingBalance: number;
    totalCowMilkWeight: number;
    totalCowMilkAmount: number;
    cowCollectionsCount: number;
    totalBuffaloMilkWeight: number;
    totalBuffaloMilkAmount: number;
    buffaloCollectionsCount: number;
    totalMilkCollectionsCount: number;
    totalMilkWeight: number;
    grossMilkAmount: number;
    otherCreditsAmount: number;
    totalCredits: number;
    feedPurchasesDebit: number;
    advancesDebit: number;
    deductionsDebit: number;
    otherDebitsAmount: number;
    totalDebits: number;
    settledPayoutsAmount: number;
    closingBalance: number;
    netPayableAmount: number;
    isNegativeBalance: boolean;
    pdfStoragePath?: string | null;
    pdfSha256Hash?: string | null;
    version: number;
    createdAt: string;
  };
  customer: {
    id: string;
    farmerCode: string;
    fullName: string;
    maskedMobileNumber: string;
  };
  period: {
    id: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType: string;
    status: string;
  };
  dairy: {
    organizationName: string;
    centerName: string;
    centerCode: string;
  };
  milkBreakdown: {
    cow: {
      totalQuantityKg: number;
      collectionsCount: number;
      totalAmount: number;
    };
    buffalo: {
      totalQuantityKg: number;
      collectionsCount: number;
      totalAmount: number;
    };
    totalQuantityKg: number;
    totalCollectionsCount: number;
    totalAmount: number;
  };
  items: any[];
  adjustments: any[];
}

export const billingApi = {
  async getCustomerStatement(
    customerId: string,
    periodId?: string
  ): Promise<{ data: CustomerStatementSummaryData; fromCache: boolean; syncedAt: string }> {
    const url = periodId
      ? `/billing/customers/${customerId}/statement?periodId=${periodId}`
      : `/billing/customers/${customerId}/statement`;
    const cacheKey = `bill_statement_${customerId}_${periodId || 'latest'}`;

    try {
      const data = await request<CustomerStatementSummaryData>(url, { method: 'GET' });
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerStatementSummaryData>(cacheKey);
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

  /**
   * Generates direct authorized URL for PDF download.
   */
  getPdfDownloadUrl(billId: string): string {
    return `${API_BASE_URL}/billing/${billId}/pdf`;
  },

  /**
   * Fetches the PDF buffer/base64 string securely using customer Bearer credentials.
   */
  async fetchPdfBlob(billId: string): Promise<{ blob: Blob; filename: string }> {
    const token = await getAuthToken();
    const url = `${API_BASE_URL}/billing/${billId}/pdf`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download PDF statement (HTTP ${res.status})`);
    }

    const disposition = res.headers.get('content-disposition');
    let filename = `Statement-${billId}.pdf`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = await res.blob();
    return { blob, filename };
  },
};
