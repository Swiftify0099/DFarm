import { DomainError, DomainValidationError, UnauthorizedError, CustomerNotFoundError, CustomerSuspendedError, CategoryNotAuthorizedError, SessionClosedError, RateCellNotFoundError, BiometricVerificationError, } from '../../domain/errors/index.js';
export function cleanErrorHandler(err, _req, res, next) {
    // Check if response already sent
    if (res.headersSent) {
        return next(err);
    }
    // Handle standard AppError or any error with an explicit statusCode
    if ('statusCode' in err && typeof err.statusCode === 'number') {
        res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code || 'ERROR',
                message: err.message,
                details: err.details,
            },
        });
        return;
    }
    if (err instanceof UnauthorizedError || err?.name === 'UnauthorizedError') {
        res.status(401).json({
            success: false,
            error: {
                code: err.code || 'UNAUTHORIZED',
                message: err.message,
            },
        });
        return;
    }
    if (err instanceof CustomerNotFoundError) {
        res.status(404).json({
            success: false,
            error: {
                code: err.code || 'CUSTOMER_NOT_FOUND',
                message: err.message,
            },
        });
        return;
    }
    if (err instanceof CustomerSuspendedError || err instanceof CategoryNotAuthorizedError) {
        res.status(403).json({
            success: false,
            error: {
                code: err.code || 'FORBIDDEN',
                message: err.message,
            },
        });
        return;
    }
    if (err instanceof SessionClosedError) {
        res.status(409).json({
            success: false,
            error: {
                code: err.code || 'SESSION_CLOSED',
                message: err.message,
            },
        });
        return;
    }
    if (err instanceof DomainValidationError || err instanceof BiometricVerificationError || err instanceof RateCellNotFoundError) {
        res.status(400).json({
            success: false,
            error: {
                code: err.code || 'VALIDATION_ERROR',
                message: err.message,
            },
        });
        return;
    }
    if (err instanceof DomainError) {
        res.status(400).json({
            success: false,
            error: {
                code: err.code || 'DOMAIN_ERROR',
                message: err.message,
            },
        });
        return;
    }
    // Pass along to downstream error handler (e.g. ZodError, PostgreSQL errorHandler)
    return next(err);
}
//# sourceMappingURL=error-handler.js.map