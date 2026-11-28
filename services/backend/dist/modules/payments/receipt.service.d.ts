import type { AuthContext } from '../../middleware/authenticate.js';
export interface CreateReceiptParams {
    centerId: string;
    customerId: string;
    amount: number;
    currency?: string;
    paymentMethod: string;
    referenceNumber: string;
    sourceTransactionType?: string;
    sourceTransactionId?: string | null;
    idempotencyKey: string;
    notes?: string | null;
    targetOrganizationId?: string;
}
export declare class ReceiptService {
    createReceipt(params: CreateReceiptParams, auth: AuthContext, targetOrganizationId?: string | null): Promise<any>;
    confirmReceipt(receiptId: string, auth: AuthContext, referenceNumber?: string, targetOrganizationId?: string | null): Promise<any>;
    getReceiptById(receiptId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        id: any;
        receiptNumber: any;
        organizationId: any;
        organizationName: any;
        centerId: any;
        centerName: any;
        customerId: any;
        customerName: any;
        farmerCode: any;
        direction: any;
        amount: number;
        currency: any;
        paymentMethod: any;
        status: any;
        referenceNumber: any;
        settledAt: any;
        createdAt: any;
        formattedReceipt: import("@dfarm/shared-types").FormattedPaymentReceipt;
    }>;
}
export declare const receiptService: ReceiptService;
//# sourceMappingURL=receipt.service.d.ts.map