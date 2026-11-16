import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'dfarm_access_token',
  REFRESH_TOKEN: 'dfarm_refresh_token',
  CUSTOMER_ID: 'dfarm_customer_id',
  DAIRY_ID: 'dfarm_dairy_id',
  AUTH_STATUS: 'dfarm_auth_status',
  PHONE_NUMBER: 'dfarm_phone_number',
} as const;

export class SecureStorageService {
  async saveSession(params: {
    accessToken: string;
    refreshToken: string;
    customerId?: string;
    dairyId?: string;
    status: string;
  }): Promise<void> {
    try {
      await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, params.accessToken);
      await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, params.refreshToken);
      await SecureStore.setItemAsync(KEYS.AUTH_STATUS, params.status);

      if (params.customerId) {
        await SecureStore.setItemAsync(KEYS.CUSTOMER_ID, params.customerId);
      }
      if (params.dairyId) {
        await SecureStore.setItemAsync(KEYS.DAIRY_ID, params.dairyId);
      }
    } catch {
      // Secure store fallback for web/testing
    }
  }

  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
    } catch {
      return null;
    }
  }

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
    } catch {
      return null;
    }
  }

  async getDairyId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.DAIRY_ID);
    } catch {
      return null;
    }
  }

  async getCustomerId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.CUSTOMER_ID);
    } catch {
      return null;
    }
  }

  async getAuthStatus(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.AUTH_STATUS);
    } catch {
      return null;
    }
  }

  async savePhoneNumber(phone: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(KEYS.PHONE_NUMBER, phone);
    } catch {
      // fallback
    }
  }

  async getPhoneNumber(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.PHONE_NUMBER);
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
      await SecureStore.deleteItemAsync(KEYS.CUSTOMER_ID);
      await SecureStore.deleteItemAsync(KEYS.DAIRY_ID);
      await SecureStore.deleteItemAsync(KEYS.AUTH_STATUS);
      await SecureStore.deleteItemAsync(KEYS.PHONE_NUMBER);
    } catch {
      // fallback
    }
  }
}

export const secureStorage = new SecureStorageService();
