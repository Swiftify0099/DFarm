import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
      startTime?: number;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = (req.headers['x-request-id'] as string) || (req.headers['x-correlation-id'] as string);
  const requestId = typeof existingId === 'string' && existingId.length > 0 
    ? existingId 
    : crypto.randomUUID();

  req.id = requestId;
  req.requestId = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', requestId);

  next();
}

export const requestContext = requestContextMiddleware;
