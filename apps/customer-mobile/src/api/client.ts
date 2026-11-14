/**
 * DFarm API Client
 * Secure network integration for customer mobile app.
 */
declare const process: any;

import { getAuthToken, clearSession } from '../storage/secure-token';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    timestamp?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'UNKNOWN_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// Determine default backend URL based on environment
let defaultBaseUrl = 'http://localhost:4000/api/v1';

// If running in React Native Android environment (like Emulator), default to 10.0.2.2
try {
  const { Platform } = require('react-native');
  if (Platform && Platform.OS === 'android') {
    defaultBaseUrl = 'http://10.0.2.2:4000/api/v1';
  }
} catch {
  // web or node test
}

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.['EXPO_PUBLIC_API_BASE_URL']) ||
  defaultBaseUrl;

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Session expired or invalid
      await clearSession();
      throw new ApiError('Session has expired. Please log in again.', 401, 'UNAUTHORIZED');
    }

    const contentType = response.headers.get('content-type');
    let json: any;

    if (contentType && contentType.includes('application/json')) {
      json = await response.json();
    } else {
      const text = await response.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = { data: text };
      }
    }

    if (!response.ok) {
      const errorMsg = json?.error?.message || json?.message || `Request failed with status ${response.status}`;
      const errorCode = json?.error?.code || json?.code || 'API_ERROR';
      throw new ApiError(errorMsg, response.status, errorCode, json?.error?.details);
    }

    // Unpack standardized ApiResponse wrapper if present
    if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
      return json.data as T;
    }

    return json as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message = (err as Error)?.message || 'Network request failed';
    throw new ApiError(message, 0, 'NETWORK_ERROR');
  }
}
