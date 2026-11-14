import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  saveAuthToken,
  getAuthToken,
  clearSession,
  saveSessionMeta,
  getSessionMeta,
  SessionMeta,
} from '../storage/secure-token';
import { clearAllLocalCache } from '../storage/cache';
import { authApi, MeResponse } from '../api/auth.api';

export interface CustomerAuthUser {
  customerId: string;
  farmerCode: string;
  fullName: string;
  mobileNumber: string;
  organizationId: string;
  primaryCenterId: string;
  status: string;
}

export interface AuthContextType {
  user: CustomerAuthUser | null;
  customer: CustomerAuthUser | null;
  currentCustomer: {
    id: string;
    farmerCode: string;
    fullName: string;
    normalizedMobileNumber: string;
  } | null;
  session: { customer_id: string } | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithOtpSession: (token: string) => Promise<void>;
  loginWithCustomerSession: (customer: any, accessToken: string, refreshToken?: string) => Promise<void>;
  loginWithStaffDevToken: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  customer: null,
  currentCustomer: null,
  session: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  loginWithOtpSession: async () => {},
  loginWithCustomerSession: async () => {},
  loginWithStaffDevToken: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  clearError: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomerAuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize session from secure storage on startup
  useEffect(() => {
    async function initSession() {
      try {
        const savedToken = await getAuthToken();
        const savedMeta = await getSessionMeta();

        if (savedToken && savedMeta) {
          setToken(savedToken);
          setUser({
            customerId: savedMeta.customerId,
            farmerCode: savedMeta.farmerCode,
            fullName: savedMeta.fullName,
            mobileNumber: savedMeta.mobileNumber,
            organizationId: savedMeta.organizationId,
            primaryCenterId: savedMeta.primaryCenterId,
            status: 'ACTIVE',
          });

          // Verify with backend me endpoint asynchronously
          authApi.getMe()
            .then(me => {
              if (me.customerProfile) {
                setUser(prev => prev ? {
                  ...prev,
                  customerId: me.customerProfile!.customerId,
                  farmerCode: me.customerProfile!.farmerCode,
                } : null);
              }
            })
            .catch(async () => {
              // Token expired on server
              await logout();
            });
        }
      } catch (err) {
        console.warn('Failed to restore session:', err);
      } finally {
        setIsLoading(false);
      }
    }

    initSession();
  }, []);

  const clearError = () => setError(null);

  /**
   * Handle successful Supabase OTP verification token.
   * Verifies identity with backend /auth/me and extracts verified Customer UUID.
   */
  const loginWithOtpSession = async (accessToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await saveAuthToken(accessToken);
      setToken(accessToken);

      // Verify identity against backend
      const me: MeResponse = await authApi.getMe();

      if (!me.customerProfile && me.actorType !== 'CUSTOMER') {
        throw new Error('This account is not registered as a DFarm dairy customer.');
      }

      const customerId = me.customerProfile?.customerId || me.internalId;
      const farmerCode = me.customerProfile?.farmerCode || 'FARMER';

      const customerUser: CustomerAuthUser = {
        customerId,
        farmerCode,
        fullName: me.role || 'Farmer Customer',
        mobileNumber: '',
        organizationId: me.organizationId,
        primaryCenterId: me.primaryCenterId || me.authorizedCenterIds[0] || '',
        status: me.accountStatus,
      };

      const meta: SessionMeta = {
        customerId,
        farmerCode,
        fullName: customerUser.fullName,
        mobileNumber: customerUser.mobileNumber,
        organizationId: customerUser.organizationId,
        primaryCenterId: customerUser.primaryCenterId,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      };

      await saveSessionMeta(meta);
      setUser(customerUser);
    } catch (err: any) {
      await clearSession();
      setToken(null);
      setUser(null);
      const msg = err.message || 'Customer authentication failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Directly sets trusted customer session returned from trusted onboarding/verification
   */
  const loginWithCustomerSession = async (
    customer: any,
    accessToken: string,
    refreshToken?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      await saveAuthToken(accessToken);
      setToken(accessToken);

      const customerUser: CustomerAuthUser = {
        customerId: customer.id || customer.customerId,
        farmerCode: customer.farmerCode || 'FARMER',
        fullName: customer.fullName || 'Farmer Partner',
        mobileNumber: customer.normalizedMobileNumber || customer.mobileNumber || '',
        organizationId: customer.organizationId || '',
        primaryCenterId: customer.primaryCenterId || '',
        status: customer.status || 'ACTIVE',
      };

      const meta: SessionMeta = {
        customerId: customerUser.customerId,
        farmerCode: customerUser.farmerCode,
        fullName: customerUser.fullName,
        mobileNumber: customerUser.mobileNumber,
        organizationId: customerUser.organizationId,
        primaryCenterId: customerUser.primaryCenterId,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };

      await saveSessionMeta(meta);
      setUser(customerUser);
    } catch (err: any) {
      await clearSession();
      setToken(null);
      setUser(null);
      setError(err.message || 'Failed to establish customer session');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Development credential login
   */
  const loginWithStaffDevToken = async (username: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authApi.loginStaff(username);
      await saveAuthToken(res.token);
      setToken(res.token);

      const me = await authApi.getMe();
      const customerId = me.customerProfile?.customerId || me.internalId;
      const farmerCode = me.customerProfile?.farmerCode || (res.user?.username || 'STAFF_DEV');

      const customerUser: CustomerAuthUser = {
        customerId,
        farmerCode,
        fullName: res.user?.fullName || 'DFarm User',
        mobileNumber: res.user?.phoneNumber || '',
        organizationId: me.organizationId,
        primaryCenterId: me.primaryCenterId || me.authorizedCenterIds[0] || '',
        status: me.accountStatus,
      };

      const meta: SessionMeta = {
        customerId,
        farmerCode,
        fullName: customerUser.fullName,
        mobileNumber: customerUser.mobileNumber,
        organizationId: customerUser.organizationId,
        primaryCenterId: customerUser.primaryCenterId,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };

      await saveSessionMeta(meta);
      setUser(customerUser);
    } catch (err: any) {
      await clearSession();
      setToken(null);
      setUser(null);
      const msg = err.message || 'Staff dev login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Complete logout: cleans up secure tokens, session metadata, and local cache.
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await clearSession();
      await clearAllLocalCache();
      setToken(null);
      setUser(null);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const me = await authApi.getMe();
      if (me.customerProfile) {
        setUser(prev => prev ? {
          ...prev,
          farmerCode: me.customerProfile!.farmerCode,
          customerId: me.customerProfile!.customerId,
        } : null);
      }
    } catch {
      // ignore
    }
  };

  const currentCustomer = user ? {
    id: user.customerId,
    farmerCode: user.farmerCode,
    fullName: user.fullName,
    normalizedMobileNumber: user.mobileNumber,
  } : null;

  const session = user ? {
    customer_id: user.customerId,
  } : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        customer: user,
        currentCustomer,
        session,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        error,
        loginWithOtpSession,
        loginWithCustomerSession,
        loginWithStaffDevToken,
        logout,
        refreshProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
