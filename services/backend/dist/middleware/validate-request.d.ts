import type { Request, Response, NextFunction } from 'express';
export interface RequestValidationSchema {
    body?: any;
    query?: any;
    params?: any;
}
export declare function validateRequest(schema: RequestValidationSchema): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=validate-request.d.ts.map