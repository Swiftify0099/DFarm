import type { Response } from 'express';
export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
    meta: {
        requestId?: string;
        timestamp: string;
        [key: string]: unknown;
    };
}
export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta: {
        requestId?: string;
        timestamp: string;
        [key: string]: unknown;
    };
}
export declare class ApiResponse {
    static success<T>(res: Response, data: T, statusCode?: number, meta?: Record<string, unknown>): Response;
    static created<T>(res: Response, data: T, meta?: Record<string, unknown>): Response;
    static error(res: Response, code: string, message: string, statusCode?: number, details?: unknown, meta?: Record<string, unknown>): Response;
}
//# sourceMappingURL=api-response.d.ts.map