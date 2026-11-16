import { z } from 'zod';

export const CustomerLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  transactionDate: z.string(), // ISO string
  type: z.enum([
    'MILK_CREDIT',
    'FEED_DEBIT',
    'CASH_ADVANCE_DEBIT',
    'BANK_PAYOUT',
    'ADJUSTMENT',
  ]),
  description: z.string(),
  creditAmount: z.number().min(0),
  debitAmount: z.number().min(0),
  runningBalance: z.number(), // Server-authoritative
  referenceId: z.string().optional(),
});
export type CustomerLedgerEntry = z.infer<typeof CustomerLedgerEntrySchema>;

export const CustomerKhataSummarySchema = z.object({
  customerId: z.string().uuid(),
  currentBalance: z.number(), // Positive = Payable to farmer, Negative = Owed by farmer
  totalMilkEarnings: z.number(),
  totalDeductions: z.number(),
  lastUpdated: z.string(),
});
export type CustomerKhataSummary = z.infer<typeof CustomerKhataSummarySchema>;
