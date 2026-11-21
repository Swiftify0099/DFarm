import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'dfarm_access_token',
  REFRESH_TOKEN: 'dfarm_refresh_token',
  CUSTOMER_ID: 'dfarm_customer_id',
  GLOBAL_CUSTOMER_ID: 'dfarm_global_customer_id',
  DAIRY_ID: 'dfarm_dairy_id',
  DAIRY_NAME: 'dfarm_dairy_name',
  AUTH_STATUS: 'dfarm_auth_status',
  PHONE_NUMBER: 'dfarm_phone_number',
} as const;

const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

async function safeSetItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    if (isWeb) {
      window.localStorage.setItem(key, value);
    }
  }
}

async function safeGetItem(key: string): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val !== null && val !== undefined) return val;
  } catch {
    // continue to web fallback
  }
  if (isWeb) {
    return window.localStorage.getItem(key);
  }
  return null;
}

async function safeDeleteItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // continue
  }
  if (isWeb) {
    window.localStorage.removeItem(key);
  }
}

export class SecureStorageService {
  async saveSession(params: {
    accessToken: string;
    refreshToken: string;
    customerId?: string;
    globalCustomerId?: string;
    dairyId?: string;
    dairyName?: string;
    status: string;
  }): Promise<void> {
    await safeSetItem(KEYS.ACCESS_TOKEN, params.accessToken);
    await safeSetItem(KEYS.REFRESH_TOKEN, params.refreshToken);
    await safeSetItem(KEYS.AUTH_STATUS, params.status);

    if (params.customerId) {
      await safeSetItem(KEYS.CUSTOMER_ID, params.customerId);
    }
    if (params.globalCustomerId) {
      await safeSetItem(KEYS.GLOBAL_CUSTOMER_ID, params.globalCustomerId);
    }
    if (params.dairyId) {
      await safeSetItem(KEYS.DAIRY_ID, params.dairyId);
    }
    if (params.dairyName) {
      await safeSetItem(KEYS.DAIRY_NAME, params.dairyName);
    }
  }

  async getAccessToken(): Promise<string | null> {
    return await safeGetItem(KEYS.ACCESS_TOKEN);
  }

  async getRefreshToken(): Promise<string | null> {
    return await safeGetItem(KEYS.REFRESH_TOKEN);
  }

  async getDairyId(): Promise<string | null> {
    return await safeGetItem(KEYS.DAIRY_ID);
  }

  async getDairyName(): Promise<string | null> {
    return await safeGetItem(KEYS.DAIRY_NAME);
  }

  async getCustomerId(): Promise<string | null> {
    return await safeGetItem(KEYS.CUSTOMER_ID);
  }

  async getGlobalCustomerId(): Promise<string | null> {
    return await safeGetItem(KEYS.GLOBAL_CUSTOMER_ID);
  }

  async saveGlobalCustomerId(id: string): Promise<void> {
    await safeSetItem(KEYS.GLOBAL_CUSTOMER_ID, id);
  }

  async getAuthStatus(): Promise<string | null> {
    return await safeGetItem(KEYS.AUTH_STATUS);
  }

  async savePhoneNumber(phone: string): Promise<void> {
    await safeSetItem(KEYS.PHONE_NUMBER, phone);
  }

  async getPhoneNumber(): Promise<string | null> {
    return await safeGetItem(KEYS.PHONE_NUMBER);
  }

  async clearSession(): Promise<void> {
    await safeDeleteItem(KEYS.ACCESS_TOKEN);
    await safeDeleteItem(KEYS.REFRESH_TOKEN);
    await safeDeleteItem(KEYS.CUSTOMER_ID);
    await safeDeleteItem(KEYS.GLOBAL_CUSTOMER_ID);
    await safeDeleteItem(KEYS.DAIRY_ID);
    await safeDeleteItem(KEYS.DAIRY_NAME);
    await safeDeleteItem(KEYS.AUTH_STATUS);
    await safeDeleteItem(KEYS.PHONE_NUMBER);
  }
}

export const secureStorage = new SecureStorageService();
