import type { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            id?: string;
            requestId?: string;
            startTime?: number;
        }
    }
}
export declare function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare const requestContext: typeof requestContextMiddleware;
//# sourceMappingURL=request-context.d.ts.map