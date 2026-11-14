import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '../shared/errors/app-error.js';

export interface RequestValidationSchema {
  body?: any;
  query?: any;
  params?: any;
}

export function validateRequest(schema: RequestValidationSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.params) {
        const parsedParams = await schema.params.parseAsync(req.params);
        if (req.params && typeof req.params === 'object') {
          Object.assign(req.params, parsedParams);
        }
      }
      if (schema.query) {
        const parsedQuery = await schema.query.parseAsync(req.query);
        if (req.query && typeof req.query === 'object') {
          Object.assign(req.query, parsedQuery);
        }
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body ?? {});
      }
      next();
    } catch (err) {
      if (err instanceof ZodError || (err as any)?.name === 'ZodError') {
        const issues = ((err as any).errors || (err as any).issues || []) as any[];
        const formattedErrors = issues.map((e: any) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : 'root',
          message: e.message,
          rule: e.code,
        }));
        return next(new ValidationError('Request validation failed', formattedErrors));
      }
      next(err);
    }
  };
}
