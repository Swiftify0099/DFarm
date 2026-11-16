import { Request, Response, NextFunction } from 'express';
import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { UnauthorizedError } from '../../domain/errors/index.js';

const tokenService = new HmacJwtTokenService();

export interface AuthenticatedUser {
  userId: string;
  organizationId?: string;
  centerId?: string;
  role: string;
  actorType: 'STAFF' | 'CUSTOMER';
  fullName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);

  if (!authHeader) {
    throw new UnauthorizedError('Authorization token required');
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const claims = tokenService.verifyToken(token);
  req.user = claims;
  next();
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const claims = tokenService.verifyToken(token);
    req.user = claims;
  } catch {
    // Ignore invalid token in optional auth
  }
  next();
}
