export class AppError extends Error {
    statusCode;
    code;
    isOperational;
    details;
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required', code = 'UNAUTHORIZED', details) {
        super(message, 401, code, details);
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'Access denied', code = 'FORBIDDEN', details) {
        super(message, 403, code, details);
    }
}
export class NotFoundError extends AppError {
    constructor(message = 'Resource not found', code = 'NOT_FOUND', details) {
        super(message, 404, code, details);
    }
}
export class ValidationError extends AppError {
    constructor(message = 'Invalid request parameters', details) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}
export class BadRequestError extends AppError {
    constructor(message = 'Bad request', code = 'BAD_REQUEST', details) {
        super(message, 400, code, details);
    }
}
export class ConflictError extends AppError {
    constructor(message = 'Resource already exists or conflicting state', code = 'CONFLICT', details) {
        super(message, 409, code, details);
    }
}
export class InternalServerError extends AppError {
    constructor(message = 'An unexpected server error occurred', details) {
        super(message, 500, 'INTERNAL_SERVER_ERROR', details);
    }
}
//# sourceMappingURL=app-error.js.map