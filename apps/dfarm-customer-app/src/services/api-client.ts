import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { secureStorage } from './secure-storage';

const resolveDefaultBaseUrl = (): string => {
  if (Platform.OS === 'web') {
    return (
      process.env.EXPO_PUBLIC_WEB_API_URL ||
      process.env.VITE_API_BASE_URL ||
      'http://localhost:4000/api/v1'
    );
  }

  // 1. Detect dynamic host IP from Metro bundler (Expo Go / Development Client)
  // When running via Metro on Wi-Fi, this automatically reflects the machine's current IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const metroHost = hostUri ? hostUri.split(':')[0] : null;

  if (metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') {
    return `http://${metroHost}:4000/api/v1`;
  }

  // 2. Android emulator check: always use loopback gateway if running on an emulator without metroHost
  if (Platform.OS === 'android') {
    const isEmulator = (Constants as any).isDevice === false;
    if (isEmulator && (!metroHost || metroHost === 'localhost' || metroHost === '127.0.0.1')) {
      return 'http://10.0.2.2:4000/api/v1';
    }
  }

  // 3. Check if a non-localhost, non-emulator IP is specified in env
  const envUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL;
  if (
    envUrl &&
    !envUrl.includes('localhost') &&
    !envUrl.includes('127.0.0.1') &&
    !envUrl.includes('10.0.2.2')
  ) {
    return envUrl;
  }

  // 4. Android physical device fallback on LAN Wi-Fi
  if (Platform.OS === 'android') {
    return 'http://10.114.224.223:4000/api/v1';
  }

  return 'http://localhost:4000/api/v1';
};

export const API_BASE_URL = resolveDefaultBaseUrl();

class ApiClientService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 15000,
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
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response Interceptor: Error handling & token expiry
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

        return Promise.reject(error);
      }
    );
  }

  get instance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClientService().instance;
