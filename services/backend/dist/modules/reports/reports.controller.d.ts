import type { Request, Response, NextFunction } from 'express';
export declare class ReportsController {
    static getDailyCollection(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getMonthlyCollection(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getFarmerWise(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getCowBuffalo(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getFatSnf(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getBilling(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getPayouts(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=reports.controller.d.ts.map