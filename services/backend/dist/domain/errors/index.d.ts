export declare class DomainError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(message: string, code?: string, statusCode?: number);
}
export declare class DomainValidationError extends DomainError {
    constructor(message: string, code?: string);
}
export declare class UnauthorizedError extends DomainError {
    constructor(message?: string, code?: string);
}
export declare class BiometricVerificationError extends DomainError {
    constructor(message: string, code?: string);
}
export declare class CustomerNotFoundError extends DomainError {
    constructor(identifier: string);
}
export declare class CustomerSuspendedError extends DomainError {
    constructor(customerName: string);
}
export declare class CategoryNotAuthorizedError extends DomainError {
    constructor(category: string, customerName: string);
}
export declare class SessionClosedError extends DomainError {
    constructor(sessionCode: string);
}
export declare class RateCellNotFoundError extends DomainError {
    constructor(category: string, fat: number, snf: number, version: number | string);
}
export declare class DuplicateTransactionError extends DomainError {
    constructor(idempotencyKey: string);
}
export declare class InvalidCredentialsError extends DomainError {
    constructor(message?: string);
}
export declare class UnauthorizedAccessError extends DomainError {
    constructor(message?: string);
}
export declare class ForbiddenTenantError extends DomainError {
    constructor(message?: string);
}
export declare class ForbiddenError extends DomainError {
    constructor(message?: string, code?: string);
}
export declare class NotFoundError extends DomainError {
    constructor(message?: string, code?: string);
}
export declare class BadRequestError extends DomainError {
    constructor(message?: string, code?: string);
}
//# sourceMappingURL=index.d.ts.map