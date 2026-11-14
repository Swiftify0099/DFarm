import type { Request, Response, NextFunction } from 'express';
export declare class AuthController {
    static login(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static me(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static getCenters(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static sendOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    static verifyOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=auth.controller.d.ts.map