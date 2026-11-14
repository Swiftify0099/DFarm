import type { Request, Response, NextFunction } from 'express';
export declare class FeedController {
    static getCategories(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createCategory(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getProducts(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createProduct(req: Request, res: Response, next: NextFunction): Promise<void>;
    static updateProduct(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getSuppliers(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createSupplier(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createPurchase(req: Request, res: Response, next: NextFunction): Promise<void>;
    static receivePurchase(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createSale(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getSales(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getSaleById(req: Request, res: Response, next: NextFunction): Promise<void>;
    static processReturn(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=feed.controller.d.ts.map