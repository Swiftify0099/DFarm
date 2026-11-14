import { ZodError } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
import { ApiResponse } from '../shared/response/api-response.js';
import { logger } from '../shared/logger/index.js';
export function errorHandler(err, req, res, _next) {
    // 1. Zod Validation Errors
    if (err instanceof ZodError || err?.name === 'ZodError') {
        const issues = err.issues || [];
        const formattedErrors = issues.map((e) => ({
            field: e.path?.join('.') || '',
            message: e.message,
            rule: e.code || 'INVALID',
        }));
        logger.warn({ reqId: req.id, url: req.originalUrl, errors: formattedErrors }, 'Validation error');
        return ApiResponse.error(res, 'VALIDATION_ERROR', 'Request validation failed', 400, formattedErrors);
    }
    // 2. Custom Application Operational Errors
    if (err instanceof AppError) {
        if (err.statusCode >= 500) {
            logger.error({ reqId: req.id, url: req.originalUrl, err }, err.message);
        }
        else {
            logger.warn({ reqId: req.id, url: req.originalUrl, code: err.code }, err.message);
        }
        return ApiResponse.error(res, err.code, err.message, err.statusCode, err.details);
    }
    // 3. PostgreSQL / PostgREST Error Codes
    const pgErr = err;
    if (pgErr.code) {
        // Unique constraint violation (e.g. mobile duplicate)
        if (pgErr.code === '23505') {
            logger.warn({ reqId: req.id, code: pgErr.code, message: pgErr.message }, 'Database unique constraint violation');
            const msg = pgErr.message || '';
            const isMobile = msg.toLowerCase().includes('mobile') || msg.includes('normalized_mobile_number') || msg.includes('uq_customer_mobile_per_org');
            const errCode = isMobile ? 'DUPLICATE_MOBILE_NUMBER' : 'DUPLICATE_RECORD';
            const errMsg = isMobile
                ? 'Customer with this mobile number already exists in this organization'
                : 'A record with these unique details already exists in the system';
            return ApiResponse.error(res, errCode, errMsg, 409);
        }
        // Foreign key violation
        if (pgErr.code === '23503') {
            logger.warn({ reqId: req.id, code: pgErr.code, message: pgErr.message }, 'Database foreign key violation');
            return ApiResponse.error(res, 'FOREIGN_KEY_VIOLATION', 'Referenced entity or relationship does not exist', 400);
        }
        // Custom RPC P0002 (Not found)
        if (pgErr.code === 'P0002') {
            logger.warn({ reqId: req.id, code: pgErr.code, message: pgErr.message }, 'Entity not found in database RPC');
            return ApiResponse.error(res, 'NOT_FOUND', pgErr.message || 'Requested resource was not found', 404);
        }
        // Permission / Authorization violation
        if (pgErr.code === '42501') {
            logger.warn({ reqId: req.id, code: pgErr.code, message: pgErr.message }, 'Database authorization violation');
            return ApiResponse.error(res, 'FORBIDDEN', pgErr.message || 'Permission denied', 403);
        }
        // Check constraint, business rule, or data exception
        if (pgErr.code === '23514' ||
            pgErr.code === '22023' ||
            pgErr.code === '22000' ||
            pgErr.code === '22003' ||
            pgErr.code === 'P0001') {
            logger.warn({ reqId: req.id, code: pgErr.code, message: pgErr.message }, 'Database check constraint or business rule violation');
            return ApiResponse.error(res, 'INVALID_DATA_CONSTRAINT', pgErr.message || 'Data violates business validation constraints', 400);
        }
    }
    // 4. Unhandled / Unexpected Server Errors (never leak internal trace or secrets)
    logger.error({ reqId: req.id, url: req.originalUrl, err }, 'Unhandled server exception');
    return ApiResponse.error(res, 'INTERNAL_SERVER_ERROR', 'An unexpected server error occurred. Please contact system support.', 500);
}
//# sourceMappingURL=error-handler.js.map