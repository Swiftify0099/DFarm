import { Request, Response, NextFunction } from 'express';
import {
  DomainError,
  DomainValidationError,
  UnauthorizedError,
  CustomerNotFoundError,
  CustomerSuspendedError,
  CategoryNotAuthorizedError,
  SessionClosedError,
  RateCellNotFoundError,
  BiometricVerificationError,
} from '../../domain/errors/index.js';

export function cleanErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Handle standard AppError or any error with an explicit statusCode
  if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
    res.status((err as any).statusCode).json({
      success: false,
      error: {
        code: (err as any).code || 'ERROR',
        message: err.message,
        details: (err as any).details,
      },
    });
    return;
  }

  if (err instanceof UnauthorizedError || (err as any)?.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: {
        code: (err as any).code || 'UNAUTHORIZED',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof CustomerNotFoundError) {
    res.status(404).json({
      success: false,
      error: {
        code: (err as any).code || 'CUSTOMER_NOT_FOUND',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof CustomerSuspendedError || err instanceof CategoryNotAuthorizedError) {
    res.status(403).json({
      success: false,
      error: {
        code: (err as any).code || 'FORBIDDEN',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof SessionClosedError) {
    res.status(409).json({
      success: false,
      error: {
        code: (err as any).code || 'SESSION_CLOSED',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof DomainValidationError || err instanceof BiometricVerificationError || err instanceof RateCellNotFoundError) {
    res.status(400).json({
      success: false,
      error: {
        code: (err as any).code || 'VALIDATION_ERROR',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof DomainError) {
    res.status(400).json({
      success: false,
      error: {
        code: (err as any).code || 'DOMAIN_ERROR',
        message: err.message,
      },
    });
    return;
  }

  // Pass along to downstream error handler (e.g. ZodError, PostgreSQL errorHandler)
  return next(err);
}
