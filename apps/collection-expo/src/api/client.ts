import { ISessionManager, SessionManager } from '../storage/SessionManager';
import {
  ApiResponse,
  CalculateRateRequest,
  CalculateRateResponseDto,
  CompleteSessionRequest,
  CompleteSessionResponseDto,
  CreateSessionRequest,
  CreateSessionResponseDto,
  CustomerDto,
  CustomerListResponse,
  IdentificationResponseDto,
  LoginResponse,
  ReceiptResponseDto,
  CollectionHistoryItemDto,
  ShiftSummaryDto,
  SyncPushRequest,
  SyncPushResponseDto,
  SyncAcknowledgeRequest,
  UserMeResponse,
} from '../types';

let customBaseUrl: string | null = null;

export function getDefaultBaseUrl(): string {
  if (customBaseUrl) return customBaseUrl;
  // Android emulator loopback vs web/localhost
  const proc = (globalThis as any).process;
  const isAndroid =
    (typeof proc !== 'undefined' && proc.env?.EXPO_PLATFORM === 'android') ||
    (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent));
  if (isAndroid) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://127.0.0.1:3000';
}

export function setApiBaseUrl(url: string) {
  customBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
}

export class CollectionApiClient {
  constructor(private sessionManager: ISessionManager) {}

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ status: number; data: T }> {
    const baseUrl = getDefaultBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = await this.sessionManager.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const centerId = await this.sessionManager.getActiveCenterId();
    if (centerId && !headers['X-Center-ID']) {
      headers['X-Center-ID'] = centerId;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await this.sessionManager.clearSession();
    }

    let responseData: any = null;
    const text = await response.text();
    if (text) {
      try {
        responseData = JSON.parse(text);
      } catch (_e) {
        responseData = { message: text };
      }
    }

    if (!response.ok && response.status >= 400) {
      const errMsg =
        responseData?.message ||
        responseData?.error?.message ||
        `HTTP ${response.status}: ${response.statusText}`;
      const error: any = new Error(errMsg);
      error.status = response.status;
      error.data = responseData;
      throw error;
    }

    return { status: response.status, data: responseData as T };
  }

  async get<T = any>(endpoint: string): Promise<{ status: number; data: T }> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, body?: any): Promise<{ status: number; data: T }> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await this.request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });
    return res.data;
  }

  async getMe(): Promise<UserMeResponse> {
    const res = await this.request<UserMeResponse>('/api/v1/auth/me', {
      method: 'GET',
    });
    return res.data;
  }

  async listCustomers(params: {
    page?: number;
    limit?: number;
    search?: string;
    centerId?: string;
    status?: string;
  }): Promise<ApiResponse<CustomerListResponse>> {
    const q = new URLSearchParams();
    if (params.page) q.append('page', params.page.toString());
    if (params.limit) q.append('limit', params.limit.toString());
    if (params.search) q.append('search', params.search);
    if (params.centerId) q.append('centerId', params.centerId);
    if (params.status) q.append('status', params.status);

    const res = await this.request<ApiResponse<CustomerListResponse>>(
      `/api/v1/customers?${q.toString()}`,
      { method: 'GET' }
    );
    return res.data;
  }

  async getCustomerById(customerId: string): Promise<ApiResponse<CustomerDto>> {
    const res = await this.request<ApiResponse<CustomerDto>>(
      `/api/v1/customers/${customerId}`,
      { method: 'GET' }
    );
    return res.data;
  }

  async identifyByRfid(body: {
    cardUid: string;
    centerId: string;
    deviceId?: string;
  }): Promise<ApiResponse<IdentificationResponseDto>> {
    const res = await this.request<ApiResponse<IdentificationResponseDto>>(
      '/api/v1/identification/rfid',
      {
        method: 'POST',
        body: JSON.stringify({
          cardUid: body.cardUid,
          centerId: body.centerId,
          deviceId: body.deviceId || 'COUNTER_TERMINAL',
        }),
      }
    );
    return res.data;
  }

  async verifyBySupervisor(body: {
    targetCustomerUuid: string;
    reasonCategory: string;
    justificationNotes: string;
    centerId: string;
    deviceId?: string;
    supervisorId?: string | null;
    supervisorPin?: string | null;
  }): Promise<ApiResponse<IdentificationResponseDto>> {
    const res = await this.request<ApiResponse<IdentificationResponseDto>>(
      '/api/v1/identification/supervisor-verify',
      {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          authenticatedVia: 'PIN',
          deviceId: body.deviceId || 'COUNTER_TERMINAL',
        }),
      }
    );
    return res.data;
  }

  async calculateRate(
    body: CalculateRateRequest
  ): Promise<ApiResponse<CalculateRateResponseDto>> {
    const res = await this.request<ApiResponse<CalculateRateResponseDto>>(
      '/api/v1/rates/calculate',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res.data;
  }

  async createSession(
    body: CreateSessionRequest
  ): Promise<ApiResponse<CreateSessionResponseDto>> {
    const res = await this.request<ApiResponse<CreateSessionResponseDto>>(
      '/api/v1/collections/sessions',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res.data;
  }

  async recordMeasurements(
    sessionId: string,
    body: {
      fatPercentage?: number;
      snfPercentage?: number;
      clr?: number | null;
      netWeight?: number;
      source?: string;
    }
  ): Promise<ApiResponse<any>> {
    const res = await this.request<ApiResponse<any>>(
      `/api/v1/collections/sessions/${sessionId}/measurements`,
      {
        method: 'POST',
        body: JSON.stringify({ ...body, source: body.source || 'MANUAL_ENTRY' }),
      }
    );
    return res.data;
  }

  async completeSession(
    sessionId: string,
    body: CompleteSessionRequest
  ): Promise<ApiResponse<CompleteSessionResponseDto>> {
    const res = await this.request<ApiResponse<CompleteSessionResponseDto>>(
      `/api/v1/collections/sessions/${sessionId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res.data;
  }

  async cancelSession(sessionId: string, reason: string): Promise<ApiResponse<any>> {
    const res = await this.request<ApiResponse<any>>(
      `/api/v1/collections/sessions/${sessionId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return res.data;
  }

  async getReceiptText(sessionId: string): Promise<ApiResponse<ReceiptResponseDto>> {
    const res = await this.request<ApiResponse<ReceiptResponseDto>>(
      `/api/v1/collections/sessions/${sessionId}/receipt`,
      {
        method: 'GET',
      }
    );
    return res.data;
  }

  async getHistory(params: {
    centerId?: string;
    date?: string;
    shift?: string;
    limit?: number;
  }): Promise<ApiResponse<CollectionHistoryItemDto[]>> {
    const q = new URLSearchParams();
    if (params.centerId) q.append('centerId', params.centerId);
    if (params.date) q.append('date', params.date);
    if (params.shift) q.append('shift', params.shift);
    if (params.limit) q.append('limit', params.limit.toString());

    const res = await this.request<ApiResponse<CollectionHistoryItemDto[]>>(
      `/api/v1/collections/history?${q.toString()}`,
      { method: 'GET' }
    );
    return res.data;
  }

  async getShiftSummary(params: {
    centerId?: string;
    shift?: string;
    date?: string;
  }): Promise<ApiResponse<ShiftSummaryDto>> {
    const q = new URLSearchParams();
    if (params.centerId) q.append('centerId', params.centerId);
    if (params.shift) q.append('shift', params.shift);
    if (params.date) q.append('date', params.date);

    const res = await this.request<ApiResponse<ShiftSummaryDto>>(
      `/api/v1/collections/shift-summary?${q.toString()}`,
      { method: 'GET' }
    );
    return res.data;
  }

  async pushSyncEvents(
    body: SyncPushRequest
  ): Promise<ApiResponse<SyncPushResponseDto>> {
    const res = await this.request<ApiResponse<SyncPushResponseDto>>(
      '/api/v1/sync/push',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return res.data;
  }

  async pullSyncChanges(params: {
    cursor?: number;
    tombstoneCursor?: number;
    centerId?: string;
  }): Promise<ApiResponse<any>> {
    const q = new URLSearchParams();
    q.append('cursor', (params.cursor || 0).toString());
    q.append('tombstoneCursor', (params.tombstoneCursor || 0).toString());
    if (params.centerId) q.append('centerId', params.centerId);

    const res = await this.request<ApiResponse<any>>(
      `/api/v1/sync/pull?${q.toString()}`,
      { method: 'GET' }
    );
    return res.data;
  }

  async acknowledgeSync(body: SyncAcknowledgeRequest): Promise<ApiResponse<any>> {
    const res = await this.request<ApiResponse<any>>('/api/v1/sync/acknowledge', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  }
}

export const collectionApiClient = new CollectionApiClient(new SessionManager());
