import React, { createContext, useContext, useState, useEffect } from 'react';
import { OfficerProfile } from '../types/models';
import { sessionManager } from './SessionManager';
import { authApi } from '../api/authApi';
import { apiClient } from '../api/apiClient';

interface AuthContextType {
  officer: OfficerProfile | null;
  activeCenterId: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<OfficerProfile>;
  logout: () => Promise<void>;
  selectCenter: (centerId: string) => Promise<void>;
  verifySession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [officer, setOfficer] = useState<OfficerProfile | null>(null);
  const [activeCenterId, setActiveCenterIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const bootstrap = async () => {
      await sessionManager.init();
      const storedOfficer = sessionManager.getOfficer();
      const storedCenterId = sessionManager.getActiveCenterId();

      if (storedOfficer && sessionManager.isLoggedIn()) {
        setOfficer(storedOfficer);
        setActiveCenterIdState(storedCenterId);
        // Verify in background
        authApi.getMe().then((verified) => {
          if (verified) {
            setOfficer(verified);
          }
        }).catch(() => {
          // Keep offline session
        });
      }
      setIsLoading(false);
    };

    apiClient.setOnUnauthorizedListener(() => {
      setOfficer(null);
      setActiveCenterIdState(null);
    });

    bootstrap();
  }, []);

  const login = async (email: string, password: string): Promise<OfficerProfile> => {
    setIsLoading(true);
    try {
      const { token, officer: loggedOfficer } = await authApi.login(email, password);
      await sessionManager.saveSession(token, loggedOfficer);
      setOfficer(loggedOfficer);
      const activeCenter =
        loggedOfficer.centerId || loggedOfficer.assignedCenters?.[0]?.centerId || null;
      setActiveCenterIdState(activeCenter);
      return loggedOfficer;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    await sessionManager.clearSession();
    setOfficer(null);
    setActiveCenterIdState(null);
  };

  const selectCenter = async (centerId: string): Promise<void> => {
    await sessionManager.setActiveCenterId(centerId);
    setActiveCenterIdState(centerId);
    if (officer) {
      const updated = { ...officer, centerId };
      setOfficer(updated);
    }
  };

  const verifySession = async (): Promise<boolean> => {
    if (!sessionManager.isLoggedIn()) {
      return false;
    }
    try {
      const verified = await authApi.getMe();
      if (verified) {
        setOfficer(verified);
        return true;
      }
      await logout();
      return false;
    } catch {
      // In offline scenario, trust stored session if present
      return !!sessionManager.getOfficer();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        officer,
        activeCenterId,
        isLoading,
        isLoggedIn: !!officer && sessionManager.isLoggedIn(),
        login,
        logout,
        selectCenter,
        verifySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
