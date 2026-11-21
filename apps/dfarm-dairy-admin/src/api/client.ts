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

  // Tenant Isolation: Canonical tenant scoping header
  if (dairyId) {
    headers['X-Dairy-Id'] = dairyId
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders)
  }

  return headers
}

/**
 * Resolves the canonical API base URL with safe normalization.
 * Handles trailing slashes, ensures /api/v1 prefix, and protects against silent localhost fallbacks.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim()

  if (envUrl) {
    const sanitized = envUrl.replace(/\/+$/, '')
    return sanitized.endsWith('/api/v1') ? sanitized : `${sanitized}/api/v1`
  }

  // Local development fallback to default port 4000
  if (import.meta.env.DEV) {
    return 'http://localhost:4000/api/v1'
  }

  // In production, warn if VITE_API_BASE_URL was omitted during build
  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    console.warn(
      '[DFarm Dairy Admin] VITE_API_BASE_URL is not configured in production. ' +
      'API requests will fall back to relative path /api/v1.'
    )
  }
  return '/api/v1'
}

export const apiRequest = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const baseUrl = getApiBaseUrl()
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${cleanEndpoint}`
  const headers = createHeaders(options.headers)

  const res = await fetch(url, {
    ...options,
    headers,
  })

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}: ${res.statusText}`
    try {
      const data = await res.json()
      errMessage = data.error || data.message || errMessage
    } catch {
      // json parse failed
    }
    throw new ApiError(errMessage, 'API_ERROR', res.status)
  }

  const data = await res.json()
  return data
}
