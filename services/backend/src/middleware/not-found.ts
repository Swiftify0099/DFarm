import type { Request, Response } from 'express';
import { ApiResponse } from '../shared/response/api-response.js';

export function notFoundHandler(req: Request, res: Response): Response {
  return ApiResponse.error(
    res,
    'NOT_FOUND',
    `Route ${req.method} ${req.originalUrl} was not found on this server`,
    404
  );
}

