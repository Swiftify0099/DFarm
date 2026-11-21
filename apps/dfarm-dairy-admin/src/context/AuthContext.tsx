// DFarm Dairy Admin Web — Authentication Context
// Manages Dairy Admin operator session, permissions, and tenant binding

import React, { createContext, useContext, useState, useEffect } from 'react'
import type { DairyAdminUser, Permission } from '@/types'
import { api } from '@/api'

interface AuthContextType {
  user: DairyAdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  sendOtp: (mobile: string) => Promise<{ success: boolean; message: string; previewOtp?: string }>
  loginWithOtp: (mobile: string, otp: string) => Promise<DairyAdminUser>
  logout: () => Promise<void>
  hasPermission: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<DairyAdminUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check local session
    const storedUser = api.auth.getCurrentUser()
    if (storedUser) {
      setUser(storedUser)
      // Background verification with backend to ensure tenant binding and session are fresh
      api.auth.getMe().then((liveUser) => {
        if (liveUser) {
          setUser(liveUser)
        }
      }).catch(() => {
        // Ignored, fallback to stored session or prompt re-login on 401
      })
    }
    setIsLoading(false)
  }, [])

  const sendOtp = async (mobile: string) => {
    return api.auth.sendOtp(mobile)
  }

  const loginWithOtp = async (mobile: string, otp: string) => {
    const authenticatedUser = await api.auth.verifyOtp(mobile, otp)
    setUser(authenticatedUser)
    return authenticatedUser
  }

  const logout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false
    if (user.role === 'PRIMARY_DAIRY_ADMIN' || (user.role as any) === 'SUPER_ADMIN') return true
    if (user.permissions?.includes('ALL' as any)) return true
    return user.permissions.includes(permission)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        sendOtp,
        loginWithOtp,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
