import React, { createContext, useContext, useState, useEffect } from 'react'
import type { OperatorSession } from '@/types'
import { authApi, getStoredOperatorAuth, setStoredOperatorAuth, clearStoredOperatorAuth } from '@/api/client'
import { MockCollectionBackend } from '@/api/mock-backend'

interface AuthContextType {
  operator: OperatorSession | null
  isAuthenticated: boolean
  isLoading: boolean
  dairyId: string | null
  requestOtp: (mobileNumber: string) => Promise<{ success: boolean; previewOtp: string }>
  loginWithOtp: (mobileNumber: string, otp: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [operator, setOperator] = useState<OperatorSession | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // Restore session from client storage
    const { token, dairyId, operator: storedOperator } = getStoredOperatorAuth()
    if (token && dairyId && storedOperator) {
      setOperator(storedOperator)
    }
    setIsLoading(false)
  }, [])

  const requestOtp = async (mobileNumber: string) => {
    try {
      const res = await authApi.requestOtp(mobileNumber)
      return { success: res.success, previewOtp: res.previewOtp || '123456' }
    } catch {
      const res = await MockCollectionBackend.sendOtp(mobileNumber)
      return { success: res.success, previewOtp: res.previewOtp }
    }
  }

  const loginWithOtp = async (mobileNumber: string, otp: string) => {
    setIsLoading(true)
    try {
      try {
        const session = await authApi.verifyOtp(mobileNumber, otp)
        setOperator(session)
      } catch {
        const session = await MockCollectionBackend.verifyOtp(mobileNumber, otp)
        setOperator(session)
        setStoredOperatorAuth(session.sessionToken, session.dairyId, session)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setOperator(null)
    clearStoredOperatorAuth()
  }

  return (
    <AuthContext.Provider
      value={{
        operator,
        isAuthenticated: !!operator,
        isLoading,
        dairyId: operator?.dairyId || null,
        requestOtp,
        loginWithOtp,
        logout,
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
