import type { Request, Response, NextFunction } from 'express';
export declare class InventoryController {
    static getInventory(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getMovements(req: Request, res: Response, next: NextFunction): Promise<void>;
    static transferStock(req: Request, res: Response, next: NextFunction): Promise<void>;
    static adjustStock(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getReports(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=inventory.controller.d.ts.map