/**
 * Customer Authentication API
 * Communicates with backend authentication endpoints.
 * Never fabricates OTP responses or fake customer UUIDs.
 */
import { request } from './client';

export interface SendOtpResponse {
  message: string;
  phone: string;
}

export interface VerifyOtpResponse {
  session: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user: {
      id: string;
      phone?: string;
      email?: string;
    };
  };
}

export interface MeResponse {
  authUserId: string;
  internalId: string;
  actorType: 'STAFF' | 'CUSTOMER';
  role: string;
  organizationId: string;
  authorizedCenterIds: string[];
  primaryCenterId?: string;
  customerProfile?: {
    customerId: string;
    farmerCode: string;
  };
  accountStatus: string;
}

export const authApi = {
  /**
   * Request OTP delivery to registered customer mobile phone.
   */
  async sendOtp(phone: string): Promise<SendOtpResponse> {
    return request<SendOtpResponse>('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Verify genuine OTP code delivered via Supabase SMS gateway.
   */
  async verifyOtp(phone: string, token: string): Promise<VerifyOtpResponse> {
    return request<VerifyOtpResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, token }),
    });
  },

  /**
   * Fetch current authenticated session profile and verify customer identity mapping.
   */
  async getMe(): Promise<MeResponse> {
    return request<MeResponse>('/auth/me', {
      method: 'GET',
    });
  },

  /**
   * Dev / Staff credential login for development testing
   */
  async loginStaff(username: string): Promise<{ token: string; user: any }> {
    return request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },
};
