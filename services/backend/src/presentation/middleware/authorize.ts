import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../domain/errors/index.js';

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      throw new UnauthorizedError(`Forbidden: Role '${req.user.role}' lacks permission`);
    }

    next();
  };
}

export function authorizeActor(actorType: 'STAFF' | 'CUSTOMER') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.actorType !== actorType) {
      throw new UnauthorizedError(`Forbidden: Actor type '${req.user.actorType}' is not allowed`);
    }

    next();
  };
}
