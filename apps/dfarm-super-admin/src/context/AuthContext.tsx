import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SuperAdminUser, SuperAdminSession, PlatformPermission } from '@/types'
import { apiClient } from '@/api/client'

interface AuthContextType {
  user: SuperAdminUser | null
  session: SuperAdminSession | null
  isAuthenticated: boolean
  isLoading: boolean
  hasPermission: (permission: PlatformPermission) => boolean
  hasAnyPermission: (permissions: PlatformPermission[]) => boolean
  login: (mobile: string, otp: string, requestId: string) => Promise<SuperAdminSession>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SuperAdminSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true)
      const current = await apiClient.getActiveSession()
      setSession(current)
    } catch (e) {
      console.warn('Session verification error:', e)
      setSession(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Periodic expiration checker
  useEffect(() => {
    if (!session) return

    const interval = setInterval(() => {
      const expiresAtMs = new Date(session.expiresAt).getTime()
      if (Date.now() >= expiresAtMs) {
        setSession(null)
        apiClient.logout()
      }
    }, 15000)

    return () => clearInterval(interval)
  }, [session])

  const login = async (mobile: string, otp: string, requestId: string): Promise<SuperAdminSession> => {
    const newSession = await apiClient.verifyOtp({ mobile, otp, requestId })
    setSession(newSession)
    return newSession
  }

  const logout = async (): Promise<void> => {
    await apiClient.logout()
    setSession(null)
  }

  const hasPermission = (permission: PlatformPermission): boolean => {
    if (!session?.user) return false
    return session.user.permissions.includes(permission) || session.user.permissions.includes('platform:admin')
  }

  const hasAnyPermission = (permissions: PlatformPermission[]): boolean => {
    if (!session?.user) return false
    return permissions.some((p) => hasPermission(p))
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session,
        isAuthenticated: !!session,
        isLoading,
        hasPermission,
        hasAnyPermission,
        login,
        logout,
        refreshSession: checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
