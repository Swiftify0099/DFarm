import type { Request, Response, NextFunction } from 'express';
export declare class CustomerController {
    static create(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static list(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static update(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static softDelete(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static restore(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getDashboard(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static markAllNotificationsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static updateProfileSelfService(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=customer.controller.d.ts.map