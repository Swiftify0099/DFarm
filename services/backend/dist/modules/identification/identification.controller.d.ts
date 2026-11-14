import type { Request, Response, NextFunction } from 'express';
export declare class IdentificationController {
    static startSession(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static identifyByFace(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static identifyByRfid(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static verifyBySupervisor(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getSession(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=identification.controller.d.ts.map