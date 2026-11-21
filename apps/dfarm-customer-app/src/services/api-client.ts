import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { secureStorage } from './secure-storage';

/**
 * Robust Android Emulator detection without external native dependencies.
 * Inspects Platform.constants (hardware, model, fingerprint, brand) across all React Native / Expo versions.
 */
export const isAndroidEmulator = (): boolean => {
  if (Platform.OS !== 'android') return false;
  if ((Constants as any).isDevice === false) return true;

  const constants: any = Platform.constants || {};
  const getProp = (k: string): string => {
    return String(
      constants[k] ||
      constants[k.toLowerCase()] ||
      constants[k.toUpperCase()] ||
      constants[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()] ||
      ''
    ).toLowerCase();
  };

  const fp = getProp('fingerprint');
  const model = getProp('model');
  const hw = getProp('hardware');
  const brand = getProp('brand');
  const prod = getProp('product');
  const mfr = getProp('manufacturer');
  const device = getProp('device');

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    '';

  return (
    fp.startsWith('generic') ||
    fp.includes('emulator') ||
    fp.includes('sdk_gphone') ||
    model.includes('google_sdk') ||
    model.includes('emulator') ||
    model.includes('sdk_gphone') ||
    model.includes('android sdk built for') ||
    hw.includes('goldfish') ||
    hw.includes('ranchu') ||
    brand.startsWith('generic') ||
    (brand.includes('google') && model.includes('sdk')) ||
    prod.includes('sdk') ||
    prod.includes('emulator') ||
    mfr.includes('genymotion') ||
    device.includes('generic') ||
    device.includes('emulator') ||
    hostUri.includes('10.0.2.2')
  );
};

const resolveDefaultBaseUrl = (): string => {
  const envUrl = (
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_WEB_API_URL ||
    process.env.VITE_API_BASE_URL ||
    ''
  ).trim();

  // 1. Web platform: use browser hostname or localhost
  if (Platform.OS === 'web') {
    if (envUrl && (envUrl.startsWith('https://') || (!envUrl.includes('10.') && !envUrl.includes('192.168.')))) {
      return envUrl;
    }
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `http://${hostname}:4000/api/v1`;
      }
    }
    return 'http://localhost:4000/api/v1';
  }

  // 2. Android Emulator: Route to host loopback via 10.0.2.2:4000
  // (or 127.0.0.1:4000 when adb reverse tcp:4000 tcp:4000 is active), UNLESS a production HTTPS URL is configured.
  if (Platform.OS === 'android' && isAndroidEmulator()) {
    if (envUrl && envUrl.startsWith('https://')) {
      return envUrl;
    }
    if (envUrl && (envUrl.includes('10.0.2.2') || envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return envUrl;
    }
    return 'http://10.0.2.2:4000/api/v1';
  }

  // 3. Physical device via Metro bundler in development:
  // Dynamically extract host machine IP from Metro bundler hostUri.
  // The device is actively communicating with Metro at this IP, so this host is 100% reachable
  // even when static .env LAN IPs become stale due to network/DHCP transitions.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const metroHost = hostUri ? hostUri.split(':')[0] : null;

  const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';

  if (isDev && metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') {
    return `http://${metroHost}:4000/api/v1`;
  }

  // 4. Explicit environment variable (for production releases, custom staging URLs, or standalone builds)
  if (envUrl.length > 0) {
    return envUrl;
  }

  // 5. Fallback to dynamic metroHost if available
  if (metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') {
    return `http://${metroHost}:4000/api/v1`;
  }

  // 6. Default fallback to loopback
  return 'http://localhost:4000/api/v1';
};

export const API_BASE_URL = resolveDefaultBaseUrl();
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[DFarm ApiClient] Resolved baseURL:', API_BASE_URL);
}

export interface ApiClientError extends Error {
  code?: string;
  statusCode?: number;
  isNetworkError?: boolean;
  endpoint?: string;
  baseURL?: string;
}

class ApiClientService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-App': 'DFarm-Customer-Android',
        'X-Client-Version': '1.0.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request Interceptor: Injects Auth Bearer and Dairy Tenant ID
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await secureStorage.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const dairyId = await secureStorage.getDairyId();
        if (dairyId) {
          config.headers['X-Dairy-Id'] = dairyId;
          config.headers['X-Dairy-Tenant-Id'] = dairyId;
          config.headers['X-Organization-Id'] = dairyId;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response Interceptor: Error categorization & token expiry
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const refreshToken = await secureStorage.getRefreshToken();

          if (refreshToken) {
            try {
              const res = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
                refreshToken,
              });

              const newAccessToken = res.data.accessToken;
              await secureStorage.saveSession({
                accessToken: newAccessToken,
                refreshToken: res.data.refreshToken || refreshToken,
                status: 'APPROVED',
              });

              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return this.client(originalRequest);
            } catch {
              await secureStorage.clearSession();
            }
          } else {
            await secureStorage.clearSession();
          }
        }

        // Categorize low-level network errors with actionable diagnostics
        const customError: ApiClientError = error;
        customError.baseURL = originalRequest?.baseURL || API_BASE_URL;
        customError.endpoint = originalRequest?.url;
        customError.statusCode = error.response?.status;

        if (!error.response) {
          customError.isNetworkError = true;
          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            customError.code = 'REQUEST_TIMEOUT';
            customError.message = `Connection timed out (${customError.baseURL}${customError.endpoint}). Verify server load and network connection.`;
          } else {
            customError.code = 'FACE_API_UNREACHABLE';
            customError.message = `Cannot reach DFarm backend at ${customError.baseURL}. Check network connectivity and server status.`;
          }
        } else if (error.response.status === 404) {
          customError.code = 'FACE_ROUTE_NOT_FOUND';
        } else if (error.response.status === 413) {
          customError.code = 'PAYLOAD_TOO_LARGE';
          customError.message = 'Camera capture payload exceeds maximum upload size (10MB). Image compression recommended.';
        } else if (error.response.status === 503) {
          customError.code = 'TENANT_DATABASE_UNAVAILABLE';
        }

        return Promise.reject(customError);
      }
    );
  }

  get instance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClientService().instance;
