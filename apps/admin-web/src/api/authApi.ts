import { apiClient } from './client.js';

export interface StaffUser {
  id: string;
  organizationId: string;
  role: string;
  primaryCenterId?: string | null;
  fullName: string;
  username: string;
  email?: string | null;
  phoneNumber?: string;
}

export interface LoginResponse {
  token: string;
  user: StaffUser;
}

export interface MeResponse {
  authUserId: string;
  internalId: string;
  actorType: 'STAFF' | 'CUSTOMER';
  role: string;
  organizationId: string;
  authorizedCenterIds: string[];
  primaryCenterId?: string;
  accountStatus: string;
}

export const authApi = {
  login: (username: string) =>
    apiClient.post<LoginResponse>('/auth/login', { username }),

  getMe: () =>
    apiClient.get<MeResponse>('/auth/me'),

  getCenters: () =>
    apiClient.get<Array<{ id: string; code: string; name: string }>>('/auth/centers'),

  sendOtp: (phone: string) =>
    apiClient.post<{ message: string; phone: string }>('/auth/otp/send', { phone }),

  verifyOtp: (phone: string, token: string) =>
    apiClient.post<any>('/auth/otp/verify', { phone, token }),
};
