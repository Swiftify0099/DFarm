import { z } from 'zod';

export const BillStatementSchema = z.object({
  billId: z.string().uuid(),
  billNumber: z.string(),
  cycleStartDate: z.string(), // YYYY-MM-DD
  cycleEndDate: z.string(), // YYYY-MM-DD
  cycleLabel: z.string(), // e.g. "Cycle 31 (01 Nov - 10 Nov 2026)"
  totalLiters: z.number(),
  grossMilkAmount: z.number(),
  feedDeductions: z.number(),
  otherDeductions: z.number(),
  netPayableAmount: z.number(),
  status: z.enum(['PENDING', 'APPROVED', 'DISBURSED', 'CANCELLED']),
  disbursedDate: z.string().optional(),
  paymentMode: z.string().optional(), // "NEFT" | "Direct Bank Transfer" | "Cash"
  utrNumber: z.string().optional(),
  pdfUrl: z.string().optional(),
});
export type BillStatement = z.infer<typeof BillStatementSchema>;
