import { FeedCategory, FeedProduct, FeedSupplier, CenterProductInventory, FeedPurchase, FeedSale, StockMovement } from '@dfarm/shared-types';
export declare class FeedRepository {
    static createCategory(orgId: string, data: {
        code: string;
        name: string;
        description?: string | null;
    }): Promise<FeedCategory>;
    static getCategories(orgId: string): Promise<FeedCategory[]>;
    static createProduct(orgId: string, data: {
        categoryId: string;
        code: string;
        name: string;
        description?: string | null;
        baseUnit: string;
        packSize: number;
        packUnit: string;
        defaultPurchasePrice: number;
        sellingPrice: number;
        taxRatePercent: number;
        hsnCode?: string | null;
        status?: string;
        minimumStockLevel?: number;
    }): Promise<FeedProduct>;
    static updateProduct(orgId: string, productId: string, data: Partial<{
        categoryId: string;
        name: string;
        description: string | null;
        baseUnit: string;
        packSize: number;
        packUnit: string;
        defaultPurchasePrice: number;
        sellingPrice: number;
        taxRatePercent: number;
        hsnCode: string | null;
        status: string;
        minimumStockLevel: number;
    }>): Promise<FeedProduct>;
    static getProductById(orgId: string, productId: string): Promise<FeedProduct>;
    static getProducts(orgId: string, filters?: {
        categoryId?: string;
        status?: string;
        search?: string;
    }): Promise<FeedProduct[]>;
    static createSupplier(orgId: string, data: {
        supplierCode: string;
        name: string;
        contactPerson?: string | null;
        phoneNumber: string;
        email?: string | null;
        address?: string | null;
        gstNumber?: string | null;
        panNumber?: string | null;
        status?: string;
    }): Promise<FeedSupplier>;
    static getSuppliers(orgId: string): Promise<FeedSupplier[]>;
    static createPurchase(orgId: string, userId: string, data: {
        centerId: string;
        supplierId: string;
        purchaseOrderNumber?: string | null;
        supplierInvoiceNumber: string;
        purchaseDate: string;
        items: Array<{
            productId: string;
            quantity: number;
            unit: string;
            unitCost: number;
            taxRatePercent?: number;
            batchNumber?: string | null;
            expiryDate?: string | null;
        }>;
        notes?: string | null;
        idempotencyKey: string;
    }): Promise<FeedPurchase>;
    static getPurchaseById(orgId: string, purchaseId: string): Promise<FeedPurchase>;
    static receivePurchase(purchaseId: string, receivedBy: string, idempotencyKey: string): Promise<any>;
    static getCenterInventory(orgId: string, centerId?: string, productId?: string): Promise<CenterProductInventory[]>;
    static getStockMovements(orgId: string, filters?: {
        centerId?: string;
        productId?: string;
        movementType?: string;
        limit?: number;
        offset?: number;
    }): Promise<StockMovement[]>;
    static transferStock(orgId: string, sourceCenterId: string, destinationCenterId: string, productId: string, quantity: number, unit: string, initiatedBy: string, approvedBy: string, idempotencyKey: string, notes?: string | null): Promise<any>;
    static adjustStock(orgId: string, centerId: string, productId: string, adjustmentType: string, quantity: number, direction: string, reason: string, approvedBy: string, idempotencyKey: string): Promise<any>;
    static createSale(orgId: string, centerId: string, customerId: string, operatorId: string, paymentMode: string, items: any[], discountAmount: number, discountApprovedBy: string | null, idempotencyKey: string, clientSaleUuid?: string | null): Promise<any>;
    static getSaleById(orgId: string, saleId: string): Promise<FeedSale>;
    static getSales(orgId: string, filters?: {
        centerId?: string;
        customerId?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<FeedSale[]>;
    static processReturn(orgId: string, saleId: string, saleItemId: string, returnQuantity: number, stockCondition: string, reason: string, approvedBy: string, idempotencyKey: string): Promise<any>;
    static getLowStockReport(orgId: string, centerId?: string): Promise<any[]>;
    static getStockValuationReport(orgId: string, centerId?: string): Promise<any>;
    static getDailySalesPurchasesReport(orgId: string, startDate: string, endDate: string, centerId?: string): Promise<any>;
}
//# sourceMappingURL=feed.repository.d.ts.map