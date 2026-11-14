import { z } from 'zod';
import { DeductionCategory } from '@dfarm/shared-types';
export const CustomerLedgerQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
    direction: z.enum(['CREDIT', 'DEBIT']).optional(),
    transactionType: z.string().optional(),
});
export const CustomerStatementQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
});
export const CreateAdvanceSchema = z.object({
    centerId: z.string().uuid().optional(),
    amount: z.coerce.number().positive('Advance amount must be strictly positive'),
    reason: z.string().min(3, 'Reason must be at least 3 characters'),
    recoveryType: z.enum(['MONTHLY_BILL_DEDUCTION', 'INSTALLMENTS', 'MANUAL']).default('MONTHLY_BILL_DEDUCTION'),
    advanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'advanceDate must be YYYY-MM-DD').optional(),
    idempotencyKey: z.string().min(5).max(128).optional(),
    autoApprove: z.boolean().default(true), // If true and authorized, posts immediately
});
export const ApproveAdvanceSchema = z.object({
    approvedAmount: z.coerce.number().positive().optional(),
});
export const RejectAdvanceSchema = z.object({
    reason: z.string().min(3, 'Rejection reason is mandatory (minimum 3 characters)'),
});
export const RecoverAdvanceSchema = z.object({
    amount: z.coerce.number().positive('Recovery amount must be strictly positive'),
    notes: z.string().optional(),
    idempotencyKey: z.string().min(5).max(128).optional(),
});
export const CreateDeductionSchema = z.object({
    centerId: z.string().uuid().optional(),
    category: z.nativeEnum(DeductionCategory),
    amount: z.coerce.number().positive('Deduction amount must be strictly positive'),
    description: z.string().min(3, 'Description must be at least 3 characters'),
    supportingReference: z.string().max(100).optional(),
    idempotencyKey: z.string().min(5).max(128).optional(),
});
export const CreateOpeningBalanceSchema = z.object({
    centerId: z.string().uuid().optional(),
    amount: z.coerce.number().positive('Opening balance amount must be strictly positive'),
    direction: z.enum(['CREDIT', 'DEBIT']),
    openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'openingDate must be YYYY-MM-DD').optional(),
    supportingReference: z.string().min(2).max(100),
    idempotencyKey: z.string().min(5).max(128).optional(),
});
export const CreateAdjustmentSchema = z.object({
    centerId: z.string().uuid().optional(),
    direction: z.enum(['CREDIT', 'DEBIT']),
    amount: z.coerce.number().positive('Adjustment amount must be strictly positive'),
    reason: z.string().min(5, 'Mandatory reason must be at least 5 characters'),
    originalTransactionId: z.string().uuid().optional(),
    idempotencyKey: z.string().min(5).max(128).optional(),
});
export const ReconcileQuerySchema = z.object({
    customerId: z.string().uuid().optional(),
    centerId: z.string().uuid().optional(),
});
export const LedgerAccountsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    centerId: z.string().uuid().optional(),
    search: z.string().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
    balanceFilter: z.enum(['ALL', 'PAYABLE', 'RECEIVABLE', 'ZERO']).default('ALL'),
});
export const ReportFilterSchema = z.object({
    centerId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(500).default(50),
});
//# sourceMappingURL=ledger.schemas.js.map