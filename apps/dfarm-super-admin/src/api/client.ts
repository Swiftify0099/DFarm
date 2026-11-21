import { mockBackend } from '@/services/mockBackend'
import type {
  DairyTenant,
  CreateDairyPayload,
  SuspendDairyPayload,
  ReactivateDairyPayload,
  UpdateDairyConfigPayload,
  DairyAdminAccount,
  TransferAdminPayload,
  ResendInvitationPayload,
  SuperAdminSession,
  RequestOtpPayload,
  RequestOtpResponse,
  VerifyOtpPayload,
  PlatformAlert,
  AcknowledgeAlertPayload,
  ResolveAlertPayload,
  AuditLogEntry,
  AuditLogFilter,
  PlatformHealthSummary,
  SupportSession,
  RequestSupportSessionPayload,
  RevokeSupportSessionPayload,
  PlatformReportResult,
  ReportFilter,
  SuperAdminUser,
} from '@/types'
import type { DashboardMetrics, GlobalAnalytics, DairyListQuery, AdminListQuery } from './contracts'

/**
 * Resolves the canonical API base URL with safe normalization.
 * Handles trailing slashes, ensures /api/v1 prefix, and protects against silent localhost fallbacks.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = (
    (import.meta as any).env?.VITE_API_BASE_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    ''
  ).trim()

  if (envUrl) {
    const sanitized = envUrl.replace(/\/+$/, '')
    return sanitized.endsWith('/api/v1') ? sanitized : `${sanitized}/api/v1`
  }

  // Local development fallback to default port 4000
  if (import.meta.env.DEV) {
    return 'http://localhost:4000/api/v1'
  }

  // In production, fallback to production backend instead of relative URL on frontend host
  return 'https://dfarm-backend.onrender.com/api/v1'
}

const getApiRoot = getApiBaseUrl

// Authenticated headers helper
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  try {
    const stored = localStorage.getItem('dfarm_super_admin_session')
    if (stored) {
      const session = JSON.parse(stored)
      if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`
      }
    }
  } catch {}
  return headers
}

// Resilient fast fetch with environment-aware timeouts (fast abort in tests, generous in production)
const globalProc = (globalThis as any).process
const isTestEnv = typeof globalProc !== 'undefined' && (globalProc?.env?.NODE_ENV === 'test' || Boolean(globalProc?.env?.VITEST))
const safeFetch = async (url: string, options: RequestInit = {}, timeoutMs = isTestEnv ? 400 : 8000): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

export const apiClient = {
  // ============================================================================
  // 1. Authentication & Session
  // ============================================================================
  async requestOtp(payload: RequestOtpPayload): Promise<RequestOtpResponse> {
    const apiRoot = getApiRoot()
    const res = await fetch(`${apiRoot}/auth/admin/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: payload.mobile }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to dispatch Super Admin OTP via Dove / ExpertSkill')
    }
    return {
      success: true,
      message: data.message || `OTP dispatched to +91 ${payload.mobile}`,
      requestId: 'real-' + Date.now(),
      expiresInSeconds: 300,
      devOtpHint: data.previewOtp,
    }
  },

  async verifyOtp(payload: VerifyOtpPayload): Promise<SuperAdminSession> {
    const apiRoot = getApiRoot()
    const res = await fetch(`${apiRoot}/auth/admin/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: payload.mobile, otp: payload.otp }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Invalid or expired OTP')
    }

    const session: SuperAdminSession = {
      token: data.token || 'jwt-session-token',
      user: {
        id: data.user?.id || 'admin-001',
        fullName: data.user?.fullName || data.user?.name || 'Pankaj Popat Yewale',
        mobile: payload.mobile,
        email: data.user?.email || 'pankaj.yewale@dfarm.in',
        roleTitle: 'Chief Platform Administrator',
        permissions: [
          'dairies:read', 'dairies:create', 'dairies:manage', 'dairies:suspend',
          'dairies:reactivate', 'admins:read', 'admins:manage', 'admins:transfer',
          'audit:read', 'system:monitor', 'alerts:manage', 'reports:read',
          'support:access', 'platform:admin',
        ],
        status: 'active',
        createdAt: data.user?.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }

    try {
      localStorage.setItem('dfarm_super_admin_session', JSON.stringify(session))
    } catch {}
    return session
  },

  async getActiveSession(): Promise<SuperAdminSession | null> {
    try {
      const stored = localStorage.getItem('dfarm_super_admin_session')
      if (stored) {
        const session = JSON.parse(stored) as SuperAdminSession
        if (new Date(session.expiresAt) > new Date()) {
          return session
        }
      }
    } catch {}
    return mockBackend.getActiveSession()
  },

  async logout(): Promise<void> {
    try {
      localStorage.removeItem('dfarm_super_admin_session')
    } catch {}
    mockBackend.logout()
  },

  async getPlatformUsers(): Promise<SuperAdminUser[]> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/users`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getPlatformUsers()
  },

  // ============================================================================
  // 2. Dashboard KPI Metrics & Analytics
  // ============================================================================
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/dashboard/metrics`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getDashboardMetrics()
  },

  async getGlobalAnalytics(): Promise<GlobalAnalytics> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/dashboard/analytics`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getGlobalAnalytics()
  },

  // ============================================================================
  // 3. Dairy Tenants Management & Provisioning
  // ============================================================================
  async getDairies(params?: DairyListQuery): Promise<DairyTenant[]> {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (params?.search) query.set('search', params.search)
      if (params?.status) query.set('status', params.status)
      if (params?.state) query.set('state', params.state)

      const url = `${apiRoot}/dairies${query.toString() ? '?' + query.toString() : ''}`
      const res = await safeFetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          mockBackend.syncDairiesFromBackend(body.data)
          return body.data
        }
      }
    } catch {}
    return mockBackend.getDairies(params)
  },

  async getDairyById(id: string): Promise<DairyTenant> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(id)}`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    const dairy = mockBackend.getDairyById(id)
    if (!dairy) throw new Error(`Dairy tenant with ID "${id}" was not found.`)
    return dairy
  },

  async updateDairyLocation(
    dairyId: string,
    locationData: {
      latitude: number
      longitude: number
      formattedAddress?: string
      addressLine1?: string
      district?: string
      state?: string
      pincode?: string
      villageLocality?: string
    },
    actor?: SuperAdminUser
  ): Promise<DairyTenant> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(dairyId)}/location`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(locationData),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        if (errData.error) throw new Error(errData.error)
      } else {
        const body = await res.json()
        if (body.success && body.dairy) {
          return body.dairy
        }
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('network')) {
        throw err
      }
    }
    return mockBackend.updateDairyLocation(dairyId, locationData, actor)
  },

  async createDairy(
    payload: CreateDairyPayload & { bankDetails?: { bankName: string; accountNumber: string; ifscCode: string; accountHolderName: string } },
    actor: SuperAdminUser
  ): Promise<{ dairy: DairyTenant; admin: DairyAdminAccount; inviteLink: string }> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          const mockResult = await mockBackend.createDairy(payload, actor)
          mockResult.inviteLink = body.data.activationLink || body.data.inviteLink || mockResult.inviteLink
          if (body.data.id || body.data.dairy?.id) {
            mockResult.dairy.id = body.data.id || body.data.dairy?.id
          }
          if (body.data.dairy?.code || body.data.code) {
            mockResult.dairy.code = body.data.dairy?.code || body.data.code
            mockResult.admin.dairyCode = body.data.dairy?.code || body.data.code
          }
          if (body.data.admin?.id) {
            mockResult.admin.id = body.data.admin.id
            mockResult.admin.dairyId = mockResult.dairy.id
            mockResult.dairy.primaryAdminId = body.data.admin.id
          }

          mockBackend.syncDairiesFromBackend([mockResult.dairy])
          return mockResult
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        if (errData.error) {
          const err: any = new Error(errData.error)
          if (errData.data) {
            err.data = errData.data
            err.existingDairyId = errData.data.existingDairyId
            err.existingDairyCode = errData.data.existingDairyCode
          }
          throw err
        }
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('network')) {
        throw err
      }
    }
    return mockBackend.createDairy(payload, actor)
  },

  async retryTenantProvisioning(dairyId: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(dairyId)}/retry-provisioning`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Failed to retry tenant database provisioning.')
      }
      return body
    } catch (err: any) {
      throw err
    }
  },

  async suspendDairy(payload: SuspendDairyPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(payload.dairyId)}/suspend`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: payload.reason, actorId: actor.id }),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          const updated = mockBackend.suspendDairy(payload, actor)
          return updated
        }
      }
    } catch {}
    return mockBackend.suspendDairy(payload, actor)
  },

  async reactivateDairy(payload: ReactivateDairyPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(payload.dairyId)}/reactivate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: payload.reason, actorId: actor.id }),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          const updated = mockBackend.reactivateDairy(payload, actor)
          return updated
        }
      }
    } catch {}
    return mockBackend.reactivateDairy(payload, actor)
  },

  async updateDairyConfig(payload: UpdateDairyConfigPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    return mockBackend.updateDairyConfig(payload, actor)
  },

  async deprovisionDairy(
    payload: { dairyId: string; confirmDairyCode: string; reason: string },
    actor: SuperAdminUser
  ): Promise<{ success: boolean; message: string }> {
    const apiRoot = getApiRoot()
    const res = await fetch(`${apiRoot}/dairies/${encodeURIComponent(payload.dairyId)}/deprovision`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirmDairyCode: payload.confirmDairyCode,
        reason: payload.reason,
        actorId: actor.id,
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `Failed to deprovision dairy (${res.status})`)
    }
    return await res.json()
  },

  // ============================================================================
  // 4. Primary Dairy Admin Accounts
  // ============================================================================
  async getAdmins(params?: AdminListQuery): Promise<DairyAdminAccount[]> {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (params?.search) query.set('search', params.search)
      if (params?.dairyId) query.set('dairyId', params.dairyId)
      if (params?.status) query.set('status', params.status)

      const url = `${apiRoot}/super-admin/admins${query.toString() ? '?' + query.toString() : ''}`
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getAdmins(params)
  },

  async resendInvitation(payload: ResendInvitationPayload, actor: SuperAdminUser): Promise<DairyAdminAccount> {
    try {
      const apiRoot = getApiRoot()
      await fetch(`${apiRoot}/dairies/invitations/resend`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ adminId: payload.adminId }),
      })
    } catch {}
    return mockBackend.resendInvitation(payload, actor)
  },

  async transferPrimaryAdmin(payload: TransferAdminPayload, actor: SuperAdminUser): Promise<{ dairy: DairyTenant; newAdmin: DairyAdminAccount }> {
    return mockBackend.transferPrimaryAdmin(payload, actor)
  },

  // ============================================================================
  // 5. Activation Workflow
  // ============================================================================
  async getActivationLink(dairyId: string, adminId?: string) {
    return mockBackend.getActivationLink(dairyId, adminId)
  },

  async validateActivationToken(token?: string, dairyCode?: string) {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (token) query.set('token', token)
      if (dairyCode) query.set('dairyCode', dairyCode)
      const res = await safeFetch(`${apiRoot}/dairies/invitations/validate?${query.toString()}`)
      const body = await res.json().catch(() => null)
      if (res.ok && body && (body.code === 'VALID' || body.data)) {
        return body
      }
      if (res.status === 400 && body && (body.code === 'ALREADY_CONSUMED' || body.code === 'INVITATION_REVOKED' || body.code === 'INVITATION_EXPIRED')) {
        return body
      }
    } catch {}
    return mockBackend.validateActivationToken(token, dairyCode)
  },

  async requestActivationOtp(token?: string, dairyCode?: string) {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/dairies/invitations/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dairyCode }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.success) {
        return body
      }
    } catch {}
    return mockBackend.requestActivationOtp(token, dairyCode)
  },

  async activatePrimaryAdmin(token?: string, otp?: string, dairyCode?: string) {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/dairies/invitations/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, otp, dairyCode }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && (body?.success || body?.data)) {
        await mockBackend.activatePrimaryAdmin(token, otp, dairyCode).catch(() => {})
        return {
          success: true,
          ...(body?.data || {}),
          dairyCode: body?.data?.dairyCode || dairyCode,
        }
      }
    } catch {}
    return mockBackend.activatePrimaryAdmin(token, otp, dairyCode)
  },

  // ============================================================================
  // 6. Monitoring & Health
  // ============================================================================
  async getPlatformHealth(): Promise<PlatformHealthSummary> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/health`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getPlatformHealth()
  },

  // ============================================================================
  // 7. Platform Alerts
  // ============================================================================
  async getAlerts(params?: { severity?: string; status?: string }): Promise<PlatformAlert[]> {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (params?.severity) query.set('severity', params.severity)
      if (params?.status) query.set('status', params.status)

      const url = `${apiRoot}/super-admin/alerts${query.toString() ? '?' + query.toString() : ''}`
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getAlerts(params)
  },

  async acknowledgeAlert(payload: AcknowledgeAlertPayload, actor: SuperAdminUser): Promise<PlatformAlert> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/alerts/${payload.alertId}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success) {
          return mockBackend.acknowledgeAlert(payload, actor)
        }
      }
    } catch {}
    return mockBackend.acknowledgeAlert(payload, actor)
  },

  async resolveAlert(payload: ResolveAlertPayload, actor: SuperAdminUser): Promise<PlatformAlert> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/alerts/${payload.alertId}/resolve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success) {
          return mockBackend.resolveAlert(payload, actor)
        }
      }
    } catch {}
    return mockBackend.resolveAlert(payload, actor)
  },

  // ============================================================================
  // 8. Immutable Audit Trail Ledger
  // ============================================================================
  async getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (filter?.action) query.set('action', filter.action)
      if (filter?.targetType) query.set('entityType', filter.targetType)
      if (filter?.dairyId) query.set('dairyId', filter.dairyId)

      const url = `${apiRoot}/super-admin/audit${query.toString() ? '?' + query.toString() : ''}`
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getAuditLogs(filter)
  },

  // ============================================================================
  // 9. Controlled Diagnostic Support Access
  // ============================================================================
  async getActiveSupportSession(): Promise<SupportSession | null> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/support/active`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getActiveSupportSession()
  },

  async getAllSupportSessions(): Promise<SupportSession[]> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/support/sessions`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.getAllSupportSessions()
  },

  async requestSupportSession(payload: RequestSupportSessionPayload, actor: SuperAdminUser): Promise<SupportSession> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/support/sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.requestSupportSession(payload, actor)
  },

  async revokeSupportSession(payload: RevokeSupportSessionPayload, actor: SuperAdminUser): Promise<SupportSession> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/support/sessions/${payload.sessionId}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: payload.reason }),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.revokeSupportSession(payload, actor)
  },

  // ============================================================================
  // 10. Platform Aggregate Reports
  // ============================================================================
  async generateReport(filter: ReportFilter, actor: SuperAdminUser): Promise<PlatformReportResult> {
    try {
      const apiRoot = getApiRoot()
      const res = await fetch(`${apiRoot}/super-admin/reports/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(filter),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          return body.data
        }
      }
    } catch {}
    return mockBackend.generateReport(filter, actor)
  },

  // ============================================================================
  // 11. Central Hardware Inventory
  // ============================================================================
  async getHardware(params?: { status?: string; category?: string; dairyId?: string }): Promise<any[]> {
    try {
      const apiRoot = getApiRoot()
      const query = new URLSearchParams()
      if (params?.status) query.set('status', params.status)
      if (params?.category) query.set('category', params.category)
      if (params?.dairyId) query.set('dairyId', params.dairyId)

      const res = await safeFetch(`${apiRoot}/super-admin/hardware${query.toString() ? '?' + query.toString() : ''}`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getHardware(params)
  },

  async registerHardware(payload: {
    serialNumber: string
    deviceCategory: string
    manufacturer: string
    model: string
    warrantyUntil?: string
    notes?: string
  }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/hardware`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.registerHardware(payload)
  },

  async assignHardware(deviceId: string, dairyId: string, notes?: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/hardware/${encodeURIComponent(deviceId)}/assign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ dairyId, notes }),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.assignHardware(deviceId, dairyId, notes)
  },

  async unassignHardware(deviceId: string, notes?: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/hardware/${encodeURIComponent(deviceId)}/unassign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes }),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.unassignHardware(deviceId, notes)
  },

  async updateHardwareStatus(deviceId: string, status: string, notes?: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/hardware/${encodeURIComponent(deviceId)}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, notes }),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.updateHardwareStatus(deviceId, status, notes)
  },

  // ============================================================================
  // 12. Central AMC Plans & Subscriptions (Razorpay Verified)
  // ============================================================================
  async getAmcPlans(): Promise<any[]> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/amc/plans`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getAmcPlans()
  },

  async createAmcPlan(payload: { name: string; durationMonths: number; priceInr: number; description?: string }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/amc/plans`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createAmcPlan(payload)
  },

  async getAmcSubscriptions(dairyId?: string): Promise<any[]> {
    try {
      const apiRoot = getApiRoot()
      const query = dairyId ? `?dairyId=${encodeURIComponent(dairyId)}` : ''
      const res = await safeFetch(`${apiRoot}/super-admin/amc/subscriptions${query}`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getAmcSubscriptions(dairyId)
  },

  async createAmcSubscription(payload: { dairyId: string; planId: string; startDate?: string }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/amc/subscriptions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createAmcSubscription(payload)
  },

  async verifyAmcPayment(subscriptionId: string, razorpayPaymentId: string, razorpaySignature?: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/amc/subscriptions/${encodeURIComponent(subscriptionId)}/verify-payment`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ razorpayPaymentId, razorpaySignature }),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.verifyAmcPayment(subscriptionId, razorpayPaymentId, razorpaySignature)
  },

  // ============================================================================
  // 13. Purge Admin & Related Records
  // ============================================================================
  async purgeAdminAndRelatedRecords(targetPhoneOrMobile: string): Promise<{
    purgedAdmins: string[]
    purgedDairies: string[]
    purgedInvitations: string[]
  }> {
    try {
      const apiRoot = getApiRoot()
      const clean = targetPhoneOrMobile.replace(/\D/g, '').slice(-10)
      await fetch(`${apiRoot}/dairies/purge/phone/${clean}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }).catch(() => {})
    } catch {}
    return mockBackend.purgeAdminAndRelatedRecords(targetPhoneOrMobile)
  },

  // ============================================================================
  // 14. Global Rate Policy Management
  // ============================================================================
  async getGlobalRatePolicies(): Promise<any[]> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/rate`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getGlobalRatePolicies()
  },

  async createGlobalRatePolicy(payload: {
    policyCode: string
    name: string
    description?: string
    policyType?: string
  }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/rate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createGlobalRatePolicy(payload)
  },

  async createGlobalRatePolicyVersion(
    policyId: string,
    payload: {
      effectiveFrom: string
      effectiveTo?: string
      parameters: any
      changeSummary?: string
    }
  ): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/rate/${encodeURIComponent(policyId)}/versions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createGlobalRatePolicyVersion(policyId, payload)
  },

  async publishGlobalRatePolicyVersion(policyId: string, versionId: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/rate/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/publish`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.publishGlobalRatePolicyVersion(policyId, versionId)
  },

  // ============================================================================
  // 15. Global FAT/SNF Adjustment Policy Management
  // ============================================================================
  async getGlobalFatSnfPolicies(): Promise<any[]> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/fat-snf`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getGlobalFatSnfPolicies()
  },

  async createGlobalFatSnfPolicy(payload: {
    policyCode: string
    name: string
    description?: string
  }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/fat-snf`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createGlobalFatSnfPolicy(payload)
  },

  async createGlobalFatSnfPolicyVersion(
    policyId: string,
    payload: {
      effectiveFrom: string
      effectiveTo?: string
      milkCategory?: string
      fatAdjustmentRules?: any[]
      snfAdjustmentRules?: any[]
      roundingPolicy?: string
      changeSummary?: string
    }
  ): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/fat-snf/${encodeURIComponent(policyId)}/versions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createGlobalFatSnfPolicyVersion(policyId, payload)
  },

  async publishGlobalFatSnfPolicyVersion(policyId: string, versionId: string): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/policies/fat-snf/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/publish`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.publishGlobalFatSnfPolicyVersion(policyId, versionId)
  },

  // ============================================================================
  // 16. Platform Operator Creation
  // ============================================================================
  async createPlatformUser(payload: {
    fullName: string
    email: string
    mobile: string
    role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR'
  }): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.createPlatformUser ? mockBackend.createPlatformUser(payload) : payload
  },

  // ============================================================================
  // 17. Platform Settings
  // ============================================================================
  async getPlatformSettings(): Promise<any> {
    try {
      const apiRoot = getApiRoot()
      const res = await safeFetch(`${apiRoot}/super-admin/settings`, {
        headers: getAuthHeaders(),
      })
      const body = await res.json()
      if (res.ok && body.data) return body.data
    } catch {}
    return mockBackend.getPlatformSettings()
  },

  // ============================================================================
  // 18. Super Admin Tenant Database Control
  // ============================================================================
  async getTenantDatabaseOverview(dairyId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/overview`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch database overview')
    return body.data
  },

  async getTenantTables(dairyId: string): Promise<any[]> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch tenant tables')
    return body.data || []
  },

  async getTableSchema(dairyId: string, tableName: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/schema`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch table schema')
    return body.data
  },

  async getTableRecords(
    dairyId: string,
    tableName: string,
    params: {
      page?: number
      limit?: number
      search?: string
      sortBy?: string
      sortOrder?: string
      filterField?: string
      filterValue?: string
    } = {}
  ): Promise<any> {
    const apiRoot = getApiRoot()
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.limit) query.set('limit', String(params.limit))
    if (params.search) query.set('search', params.search)
    if (params.sortBy) query.set('sortBy', params.sortBy)
    if (params.sortOrder) query.set('sortOrder', params.sortOrder)
    if (params.filterField) query.set('filterField', params.filterField)
    if (params.filterValue) query.set('filterValue', params.filterValue)

    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/records?${query.toString()}`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch table records')
    return body
  },

  async getRecordById(dairyId: string, tableName: string, recordId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/records/${encodeURIComponent(recordId)}`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch record detail')
    return body.data
  },

  async insertRecord(dairyId: string, tableName: string, data: any, reason?: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/records`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ data, reason: reason || 'Super Admin Controlled CRUD' }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to insert record')
    return body.data
  },

  async updateRecord(dairyId: string, tableName: string, recordId: string, updates: any, reason?: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/records/${encodeURIComponent(recordId)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ updates, reason: reason || 'Super Admin Controlled Update' }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to update record')
    return body.data
  },

  async deleteRecord(dairyId: string, tableName: string, recordId: string, reason?: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/tables/${encodeURIComponent(tableName)}/records/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason: reason || 'Super Admin Controlled Deletion' }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to delete record')
    return body
  },

  async verifyConnection(dairyId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/actions/verify-connection`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to verify connection')
    return body.data
  },

  async validateSchema(dairyId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/actions/validate-schema`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to validate schema')
    return body.data
  },

  async getMigrationHistory(dairyId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/migrations`, {
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to fetch migration history')
    return body.data
  },

  async reconcileMapping(dairyId: string): Promise<any> {
    const apiRoot = getApiRoot()
    const res = await safeFetch(`${apiRoot}/super-admin/tenants/${encodeURIComponent(dairyId)}/database/actions/reconcile-mapping`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to reconcile mapping')
    return body.data
  },
}
