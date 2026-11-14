/**
 * Customer Ledger API
 * Authoritative financial ledger, double-entry credits, debits, advances, and statement.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerLedgerSummaryData {
  customerId: string;
  customerName: string;
  farmerCode: string;
  organizationId: string;
  centerId: string;
  centerName?: string;
  currency: string;
  openingBalance: number;
  totalMilkCredits: number;
  otherApprovedCredits: number;
  totalCredits: number;
  totalDebits: number;
  advances: number;
  deductions: number;
  settledPayouts: number;
  otherDebits: number;
  currentBalance: number;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export interface LedgerTransactionItem {
  id: string;
  organizationId: string;
  centerId: string;
  customerId: string;
  transactionType: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  referenceEntity: string;
  referenceId: string;
  description?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CustomerLedgerTransactionsResponse {
  customerId: string;
  total: number;
  limit: number;
  offset: number;
  transactions: LedgerTransactionItem[];
}

export const ledgerApi = {
  async getSummary(customerId: string): Promise<{ data: CustomerLedgerSummaryData; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `ledger_summary_${customerId}`;
    try {
      const data = await request<CustomerLedgerSummaryData>(`/customers/${customerId}/ledger/summary`, {
        method: 'GET',
      });
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerLedgerSummaryData>(cacheKey);
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

  async getTransactions(
    customerId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: CustomerLedgerTransactionsResponse; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `ledger_tx_${customerId}_${limit}_${offset}`;
    try {
      const data = await request<CustomerLedgerTransactionsResponse>(
        `/customers/${customerId}/ledger/transactions?limit=${limit}&offset=${offset}`,
        { method: 'GET' }
      );
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerLedgerTransactionsResponse>(cacheKey);
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
};
