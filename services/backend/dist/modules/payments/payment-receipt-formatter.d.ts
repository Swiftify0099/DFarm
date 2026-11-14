import type { FormattedPaymentReceipt } from '@dfarm/shared-types';
export interface ReceiptData {
    organizationName: string;
    centerName: string;
    customerName: string;
    farmerCode: string;
    paymentId: string;
    receiptNumber: string;
    direction: 'DAIRY_PAYS_CUSTOMER' | 'CUSTOMER_PAYS_DAIRY';
    amount: number;
    currency: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    status: string;
    timestamp: string | Date;
    authorizedActor: string;
    bankAccountMask?: string | null;
    previousBalance?: number | null;
    balanceAfter?: number | null;
    notes?: string | null;
}
export declare function formatPaymentReceipt(data: ReceiptData): FormattedPaymentReceipt;
//# sourceMappingURL=payment-receipt-formatter.d.ts.map