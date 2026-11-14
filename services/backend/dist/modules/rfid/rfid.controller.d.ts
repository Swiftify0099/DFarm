import type { Request, Response, NextFunction } from 'express';
export declare class RfidController {
    static assign(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static replace(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static revoke(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static block(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=rfid.controller.d.ts.map