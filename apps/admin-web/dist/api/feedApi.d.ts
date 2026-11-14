import { FeedCategory, FeedProduct, FeedSupplier, CenterProductInventory, FeedPurchase, FeedSale, StockMovement } from '@dfarm/shared-types';
export declare const feedApi: {
    getCategories: () => Promise<FeedCategory[]>;
    createCategory: (data: {
        code: string;
        name: string;
        description?: string | null;
    }) => Promise<FeedCategory>;
    getProducts: (params?: {
        categoryId?: string;
        status?: string;
        search?: string;
    }) => Promise<FeedProduct[]>;
    createProduct: (data: any) => Promise<FeedProduct>;
    updateProduct: (productId: string, data: any) => Promise<FeedProduct>;
    getSuppliers: () => Promise<FeedSupplier[]>;
    createSupplier: (data: any) => Promise<FeedSupplier>;
    createPurchase: (data: any) => Promise<FeedPurchase>;
    receivePurchase: (purchaseId: string, data: {
        idempotencyKey: string;
        notes?: string;
    }) => Promise<any>;
    getInventory: (params?: {
        centerId?: string;
        productId?: string;
    }) => Promise<CenterProductInventory[]>;
    getMovements: (params?: {
        centerId?: string;
        productId?: string;
        movementType?: string;
        limit?: number;
    }) => Promise<StockMovement[]>;
    transferStock: (data: any) => Promise<any>;
    adjustStock: (data: any) => Promise<any>;
    getReports: (params?: {
        type?: string;
        centerId?: string;
        startDate?: string;
        endDate?: string;
    }) => Promise<any>;
    createSale: (data: any) => Promise<any>;
    getSales: (params?: {
        centerId?: string;
        customerId?: string;
        status?: string;
        limit?: number;
    }) => Promise<FeedSale[]>;
    getSaleById: (saleId: string) => Promise<FeedSale>;
    processReturn: (saleId: string, data: any) => Promise<any>;
};
//# sourceMappingURL=feedApi.d.ts.map