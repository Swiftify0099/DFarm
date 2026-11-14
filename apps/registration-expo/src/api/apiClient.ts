/**
 * DFarm Registration App - Centralized HTTP API Client
 * Parity with Retrofit / OkHttp ApiClient.kt & AuthInterceptor.kt
 */

import { ApiResponse } from '../types/models';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: string;

  constructor(code: string, message: string, statusCode: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class DuplicateMobileError extends ApiError {
  constructor(message: string) {
    super('DUPLICATE_MOBILE_NUMBER', message, 409);
    this.name = 'DuplicateMobileError';
  }
}

export class ApiClient {
  private customBaseUrl: string | null = null;
  private onUnauthorizedCallback?: () => void;
  private explicitToken: string | null = null;
  private explicitCenterId: string | null = null;
  private customFetch?: typeof fetch;

  private getDefaultBaseUrl(): string {
    const envUrl = process.env['EXPO_PUBLIC_API_URL'];
    if (envUrl) {
      return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
    }

    const platformOS =
      (globalThis as any).Platform?.OS ||
      (typeof process !== 'undefined' ? process.env['EXPO_OS'] : 'default');

    if (platformOS === 'android') {
      return 'http://10.0.2.2:4000/';
    }

    return 'http://127.0.0.1:4000/';
  }

  setBaseUrl(url: string): void {
    this.customBaseUrl = url.endsWith('/') ? url : `${url}/`;
  }

  getBaseUrl(): string {
    return this.customBaseUrl || this.getDefaultBaseUrl();
  }

  setToken(token: string | null): void {
    this.explicitToken = token;
  }

  setCenterId(centerId: string | null): void {
    this.explicitCenterId = centerId;
  }

  setCustomFetch(customFetch: typeof fetch): void {
    this.customFetch = customFetch;
  }

  setOnUnauthorizedListener(callback: () => void): void {
    this.onUnauthorizedCallback = callback;
  }

  async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: any;
      params?: Record<string, string | number | boolean | null | undefined>;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', body, params, headers = {}, timeoutMs = 15000 } = options;

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = new URL(cleanEndpoint, this.getBaseUrl());

    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== null && val !== undefined && val !== '') {
          url.searchParams.append(key, String(val));
        }
      });
    }

    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    };

    let token = this.explicitToken;
    let activeCenterId = this.explicitCenterId;

    if (!token || !activeCenterId) {
      try {
        // Lazy load sessionManager to prevent circular dependencies & test runner failures
        const { sessionManager } = require('../auth/SessionManager');
        if (!token) token = sessionManager.getToken();
        if (!activeCenterId) activeCenterId = sessionManager.getActiveCenterId();
      } catch {
        // Fallback in tests
      }
    }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    if (activeCenterId && !reqHeaders['X-Center-ID']) {
      reqHeaders['X-Center-ID'] = activeCenterId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchFn = this.customFetch || fetch;
      const response = await fetchFn(url.toString(), {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        try {
          const { sessionManager } = require('../auth/SessionManager');
          await sessionManager.clearSession();
        } catch {}
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        throw new ApiError(
          'UNAUTHORIZED',
          'Session expired. Please log in again.',
          401
        );
      }

      const responseJson = await response.json();

      if (!response.ok) {
        const errorMsg =
          responseJson?.error?.message ||
          responseJson?.message ||
          `HTTP Error ${response.status}`;

        if (
          response.status === 409 ||
          responseJson?.error?.code === 'DUPLICATE_MOBILE_NUMBER' ||
          errorMsg.toLowerCase().includes('already registered')
        ) {
          throw new DuplicateMobileError(errorMsg);
        }

        throw new ApiError(
          responseJson?.error?.code || 'API_ERROR',
          errorMsg,
          response.status,
          responseJson?.error?.details
        );
      }

      return responseJson;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new ApiError(
          'TIMEOUT',
          'Request timed out. Please check your network connection.',
          408
        );
      }

      if (err instanceof ApiError) {
        throw err;
      }

      throw new ApiError(
        'NETWORK_ERROR',
        err.message || 'Unable to connect to server. Running in offline mode.',
        0
      );
    }
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | null | undefined>,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', params, headers });
  }

  async post<T>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body, headers });
  }

  async patch<T>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers });
  }

  async delete<T>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', body, headers });
  }
}

export const apiClient = new ApiClient();
