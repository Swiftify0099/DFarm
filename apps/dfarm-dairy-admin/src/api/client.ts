// DFarm Dairy Admin Web — Typed API Client
// Handles tenant isolation headers, authentication bearer tokens, error mapping, and network handling.

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    timestamp: string
  }
}

export class ApiError extends Error {
  code: string
  status: number
  details?: any

  constructor(message: string, code = 'API_ERROR', status = 400, details?: any) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

const STORAGE_KEYS = {
  TOKEN: 'dfarm_admin_session_token',
  DAIRY_ID: 'dfarm_admin_tenant_id',
  USER: 'dfarm_admin_user_data',
}

export const getStoredAuth = () => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
    const dairyId = localStorage.getItem(STORAGE_KEYS.DAIRY_ID)
    const userStr = localStorage.getItem(STORAGE_KEYS.USER)
    const user = userStr ? JSON.parse(userStr) : null
    return { token, dairyId, user }
  } catch {
    return { token: null, dairyId: null, user: null }
  }
}

export const setStoredAuth = (token: string, dairyId: string, user: any) => {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token)
  localStorage.setItem(STORAGE_KEYS.DAIRY_ID, dairyId)
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

export const clearStoredAuth = () => {
  localStorage.removeItem(STORAGE_KEYS.TOKEN)
  localStorage.removeItem(STORAGE_KEYS.DAIRY_ID)
  localStorage.removeItem(STORAGE_KEYS.USER)
}

// Request interceptor adding Tenant Scoping and Authorization
export const createHeaders = (customHeaders?: HeadersInit): HeadersInit => {
  const { token, dairyId } = getStoredAuth()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Tenant Isolation: Explicit tenant scoping header
  if (dairyId) {
    headers['X-Dairy-Tenant-ID'] = dairyId
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders)
  }

  return headers
}
