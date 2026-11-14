import type { Request, Response, NextFunction } from 'express';
export declare class HealthController {
    static live(_req: Request, res: Response): Response;
    static ready(_req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=health.controller.d.ts.map