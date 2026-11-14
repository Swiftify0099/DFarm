import type { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export class ApiResponse {
  public static success<T>(
    res: Response,
    data: T,
    statusCode = 200,
    meta: Record<string, unknown> = {}
  ): Response {
    const requestId = (res.req as unknown as { id?: string })?.id;
    const body: ApiSuccessResponse<T> = {
      success: true,
      data,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
    return res.status(statusCode).json(body);
  }

  public static created<T>(
    res: Response,
    data: T,
    meta: Record<string, unknown> = {}
  ): Response {
    return ApiResponse.success(res, data, 201, meta);
  }


  public static error(
    res: Response,
    code: string,
    message: string,
    statusCode = 400,
    details?: unknown,
    meta: Record<string, unknown> = {}
  ): Response {
    const requestId = (res.req as unknown as { id?: string })?.id;
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
    return res.status(statusCode).json(body);
  }
}

