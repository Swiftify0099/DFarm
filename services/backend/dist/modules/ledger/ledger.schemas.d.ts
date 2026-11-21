import { z } from 'zod';
import { DeductionCategory } from '@dfarm/shared-types';
export declare const CustomerLedgerQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    direction: z.ZodOptional<z.ZodEnum<{
        CREDIT: "CREDIT";
        DEBIT: "DEBIT";
    }>>;
    transactionType: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CustomerStatementQuerySchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CreateAdvanceSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    amount: z.ZodCoercedNumber<unknown>;
    reason: z.ZodString;
    recoveryType: z.ZodDefault<z.ZodEnum<{
        MANUAL: "MANUAL";
        MONTHLY_BILL_DEDUCTION: "MONTHLY_BILL_DEDUCTION";
        INSTALLMENTS: "INSTALLMENTS";
    }>>;
    advanceDate: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
    autoApprove: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ApproveAdvanceSchema: z.ZodObject<{
    approvedAmount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const RejectAdvanceSchema: z.ZodObject<{
    reason: z.ZodString;
}, z.core.$strip>;
export declare const RecoverAdvanceSchema: z.ZodObject<{
    amount: z.ZodCoercedNumber<unknown>;
    notes: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CreateDeductionSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    category: z.ZodEnum<typeof DeductionCategory>;
    amount: z.ZodCoercedNumber<unknown>;
    description: z.ZodString;
    supportingReference: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CreateOpeningBalanceSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    amount: z.ZodCoercedNumber<unknown>;
    direction: z.ZodEnum<{
        CREDIT: "CREDIT";
        DEBIT: "DEBIT";
    }>;
    openingDate: z.ZodOptional<z.ZodString>;
    supportingReference: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CreateAdjustmentSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    direction: z.ZodEnum<{
        CREDIT: "CREDIT";
        DEBIT: "DEBIT";
    }>;
    amount: z.ZodCoercedNumber<unknown>;
    reason: z.ZodString;
    originalTransactionId: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ReconcileQuerySchema: z.ZodObject<{
    customerId: z.ZodOptional<z.ZodString>;
    centerId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const LedgerAccountsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    centerId: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        SUSPENDED: "SUSPENDED";
        CLOSED: "CLOSED";
    }>>;
    balanceFilter: z.ZodDefault<z.ZodEnum<{
        ALL: "ALL";
        PAYABLE: "PAYABLE";
        RECEIVABLE: "RECEIVABLE";
        ZERO: "ZERO";
    }>>;
}, z.core.$strip>;
export declare const ReportFilterSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
//# sourceMappingURL=ledger.schemas.d.ts.map