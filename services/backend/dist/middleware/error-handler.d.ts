import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
interface PostgrestErrorLike {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
}
export declare function errorHandler(err: Error | AppError | ZodError | PostgrestErrorLike, req: Request, res: Response, _next: NextFunction): Response;
export {};
//# sourceMappingURL=error-handler.d.ts.map