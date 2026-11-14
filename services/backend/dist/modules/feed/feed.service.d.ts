import { AuthContext } from '../../middleware/authenticate.js';
export declare class FeedService {
    static createCategory(data: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedCategory>;
    static getCategories(auth: AuthContext): Promise<import("@dfarm/shared-types").FeedCategory[]>;
    static createProduct(data: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedProduct>;
    static updateProduct(productId: string, data: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedProduct>;
    static getProductById(productId: string, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedProduct>;
    static getProducts(filters: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedProduct[]>;
    static createSupplier(data: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedSupplier>;
    static getSuppliers(auth: AuthContext): Promise<import("@dfarm/shared-types").FeedSupplier[]>;
    static createPurchase(data: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedPurchase>;
    static receivePurchase(purchaseId: string, data: any, auth: AuthContext): Promise<any>;
    static getInventory(centerId: string | undefined, productId: string | undefined, auth: AuthContext): Promise<import("@dfarm/shared-types").CenterProductInventory[]>;
    static getMovements(filters: any, auth: AuthContext): Promise<import("@dfarm/shared-types").StockMovement[]>;
    static transferStock(data: any, auth: AuthContext): Promise<any>;
    static adjustStock(data: any, auth: AuthContext): Promise<any>;
    static createSale(data: any, auth: AuthContext): Promise<any>;
    static getSales(filters: any, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedSale[]>;
    static getSaleById(saleId: string, auth: AuthContext): Promise<import("@dfarm/shared-types").FeedSale>;
    static processReturn(saleId: string, data: any, auth: AuthContext): Promise<any>;
    static getReports(query: any, auth: AuthContext): Promise<any>;
}
//# sourceMappingURL=feed.service.d.ts.map