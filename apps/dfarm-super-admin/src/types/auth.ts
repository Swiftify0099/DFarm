export type PlatformPermission =
  | 'dairies:read'
  | 'dairies:create'
  | 'dairies:manage'
  | 'dairies:suspend'
  | 'dairies:reactivate'
  | 'admins:read'
  | 'admins:manage'
  | 'admins:transfer'
  | 'audit:read'
  | 'system:monitor'
  | 'alerts:manage'
  | 'reports:read'
  | 'support:access'
  | 'platform:admin'

export interface SuperAdminUser {
  id: string
  fullName: string
  mobile: string
  email: string
  roleTitle: string // Descriptive title, authorization is strictly permission-based
  permissions: PlatformPermission[]
  status: 'active' | 'suspended'
  createdAt: string
  lastLoginAt: string
}

export interface SuperAdminSession {
  token: string
  user: SuperAdminUser
  expiresAt: string // ISO string timestamp
}

export interface RequestOtpPayload {
  mobile: string
}

export interface RequestOtpResponse {
  success: boolean
  message: string
  requestId: string
  expiresInSeconds: number
  // In development/test mode, the server can provide a secure hint or test code indicator
  isDevTestMode?: boolean
  devOtpHint?: string
}

export interface VerifyOtpPayload {
  mobile: string
  otp: string
  requestId: string
}

export interface VerifyOtpResponse {
  session: SuperAdminSession
}
