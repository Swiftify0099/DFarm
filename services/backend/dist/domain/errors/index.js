// DFarm Domain Errors
export class DomainError extends Error {
    code;
    statusCode;
    constructor(message, code = 'DOMAIN_ERROR', statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = this.constructor.name;
    }
}
export class DomainValidationError extends DomainError {
    constructor(message, code = 'VALIDATION_ERROR') {
        super(message, code, 400);
    }
}
export class UnauthorizedError extends DomainError {
    constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
        super(message, code, 401);
    }
}
export class BiometricVerificationError extends DomainError {
    constructor(message, code = 'BIOMETRIC_VERIFICATION_FAILED') {
        super(message, code, 400);
    }
}
export class CustomerNotFoundError extends DomainError {
    constructor(identifier) {
        super(`Customer identity '${identifier}' was not found`, 'CUSTOMER_NOT_FOUND', 404);
    }
}
export class CustomerSuspendedError extends DomainError {
    constructor(customerName) {
        super(`Customer '${customerName}' is suspended. Milk delivery not permitted.`, 'CUSTOMER_SUSPENDED', 403);
    }
}
export class CategoryNotAuthorizedError extends DomainError {
    constructor(category, customerName) {
        super(`Customer '${customerName}' is not authorized to deliver ${category} milk`, 'CATEGORY_NOT_AUTHORIZED', 403);
    }
}
export class SessionClosedError extends DomainError {
    constructor(sessionCode) {
        super(`Shift session '${sessionCode}' is concluded. New transactions are rejected.`, 'SESSION_CLOSED', 409);
    }
}
export class SessionConflictError extends DomainError {
    constructor(message, code = 'ACTIVE_SESSION_ALREADY_EXISTS') {
        super(message, code, 409);
    }
}
export class RateCellNotFoundError extends DomainError {
    constructor(category, fat, snf, version) {
        super(`No approved rate cell found for ${category} milk at Fat ${fat}% and SNF ${snf}% in chart version ${version}`, 'RATE_CELL_NOT_FOUND', 404);
    }
}
export class DuplicateTransactionError extends DomainError {
    constructor(idempotencyKey) {
        super(`Transaction with idempotency key '${idempotencyKey}' has already been processed`, 'DUPLICATE_TRANSACTION', 409);
    }
}
export class InvalidCredentialsError extends DomainError {
    constructor(message = 'Invalid authentication credentials') {
        super(message, 'INVALID_CREDENTIALS', 401);
    }
}
export class UnauthorizedAccessError extends DomainError {
    constructor(message = 'Authentication required') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
export class ForbiddenTenantError extends DomainError {
    constructor(message = 'Cross-dairy tenant access is strictly prohibited') {
        super(message, 'CROSS_TENANT_ACCESS_DENIED', 403);
    }
}
export class ForbiddenError extends DomainError {
    constructor(message = 'Access forbidden', code = 'FORBIDDEN') {
        super(message, code, 403);
    }
}
export class NotFoundError extends DomainError {
    constructor(message = 'Resource not found', code = 'NOT_FOUND') {
        super(message, code, 404);
    }
}
export class BadRequestError extends DomainError {
    constructor(message = 'Bad request', code = 'BAD_REQUEST') {
        super(message, code, 400);
    }
}
//# sourceMappingURL=index.js.map