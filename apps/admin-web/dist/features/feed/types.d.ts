export type FeedTab = 'products' | 'stock' | 'pos' | 'purchases' | 'suppliers' | 'returns' | 'adjustments' | 'history' | 'reports';
export interface CartItem {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    baseUnit: string;
    packSize: number;
    availableStock: number;
    quantity: number;
    unitPrice: number;
    taxRatePercent: number;
    discountAmount: number;
    itemTotal: number;
}
//# sourceMappingURL=types.d.ts.map