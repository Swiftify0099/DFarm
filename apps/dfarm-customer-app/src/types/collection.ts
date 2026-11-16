import { z } from 'zod';

export const MilkCollectionRecordSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string(),
  shift: z.enum(['MORNING', 'EVENING']),
  collectionDate: z.string(), // YYYY-MM-DD
  collectionTime: z.string(), // HH:mm
  animalType: z.enum(['COW', 'BUFFALO']),
  quantityLiters: z.number().positive(),
  fatPercentage: z.number().min(2.0).max(15.0),
  snfPercentage: z.number().min(5.0).max(12.0),
  lactometerReading: z.number().optional(),
  ratePerLiter: z.number().positive(),
  totalAmount: z.number().positive(),
  operatorName: z.string(),
  operatorId: z.string(),
  verifiedBiometrically: z.boolean().default(true),
});
export type MilkCollectionRecord = z.infer<typeof MilkCollectionRecordSchema>;

export const DailyCollectionSummarySchema = z.object({
  date: z.string(),
  totalLiters: z.number(),
  totalAmount: z.number(),
  records: z.array(MilkCollectionRecordSchema),
});
export type DailyCollectionSummary = z.infer<
  typeof DailyCollectionSummarySchema
>;

export const MonthlyMilkSummarySchema = z.object({
  monthYear: z.string(), // e.g. "November 2026"
  totalLiters: z.number(),
  cowLiters: z.number(),
  buffaloLiters: z.number(),
  avgFat: z.number(),
  avgSnf: z.number(),
  totalAmount: z.number(),
  transactionCount: z.number(),
});
export type MonthlyMilkSummary = z.infer<typeof MonthlyMilkSummarySchema>;
