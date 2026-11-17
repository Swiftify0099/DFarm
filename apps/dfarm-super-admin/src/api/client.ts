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

// Realistic network latency simulation
const simulateNetworkDelay = (ms = 120): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const apiClient = {
  // --- AUTH ---
  async requestOtp(payload: RequestOtpPayload): Promise<RequestOtpResponse> {
    const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
    const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
    const res = await fetch(`${baseUrl}/api/v1/auth/admin/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: payload.mobile }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to dispatch Super Admin OTP via ExpertSkill')
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
    const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
    const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
    const res = await fetch(`${baseUrl}/api/v1/auth/admin/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: payload.mobile, otp: payload.otp }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Invalid or expired OTP')
    }
    const session: SuperAdminSession = {
      token: data.token || 'jwt-session-token',
      user: {
        id: data.user?.id || 'admin-001',
        fullName: data.user?.fullName || data.user?.name || 'Pankaj Popat Yewale',
        mobile: payload.mobile,
        email: 'pankaj.yewale@dfarm.in',
        roleTitle: 'Chief Platform Administrator',
        permissions: [
          'dairies:read', 'dairies:create', 'dairies:manage', 'dairies:suspend',
          'dairies:reactivate', 'admins:read', 'admins:manage', 'admins:transfer',
          'audit:read', 'system:monitor', 'alerts:manage', 'reports:read',
          'support:access', 'platform:admin',
        ],
        status: 'active',
        createdAt: new Date().toISOString(),
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
    await simulateNetworkDelay(80)
    return mockBackend.getPlatformUsers()
  },

  // --- DASHBOARD & ANALYTICS ---
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    await simulateNetworkDelay(100)
    return mockBackend.getDashboardMetrics()
  },

  async getGlobalAnalytics(): Promise<GlobalAnalytics> {
    await simulateNetworkDelay(140)
    return mockBackend.getGlobalAnalytics()
  },

  // --- DAIRIES ---
  async getDairies(params?: DairyListQuery): Promise<DairyTenant[]> {
    await simulateNetworkDelay(120)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const res = await fetch(`${baseUrl}/api/v1/dairies`)
      if (res.ok) {
        const body = await res.json()
        if (body.success && Array.isArray(body.data)) {
          mockBackend.syncDairiesFromBackend(body.data)
        }
      }
    } catch {}
    return mockBackend.getDairies(params)
  },

  async getDairyById(id: string): Promise<DairyTenant> {
    await simulateNetworkDelay(90)
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
    await simulateNetworkDelay(150)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const res = await fetch(`${baseUrl}/api/v1/dairies/${encodeURIComponent(dairyId)}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        if (errData.error) throw new Error(errData.error)
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('network')) {
        throw err
      }
    }
    return mockBackend.updateDairyLocation(dairyId, locationData, actor)
  },

  async createDairy(payload: CreateDairyPayload, actor: SuperAdminUser): Promise<{ dairy: DairyTenant; admin: DairyAdminAccount; inviteLink: string }> {
    await simulateNetworkDelay(250)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const res = await fetch(`${baseUrl}/api/v1/dairies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.success && body.data) {
          const mockResult = await mockBackend.createDairy(payload, actor)
          mockResult.inviteLink = body.data.activationLink || mockResult.inviteLink
          if (body.data.id || body.data.dairy?.id) {
            const realId = body.data.id || body.data.dairy?.id
            mockResult.dairy.id = realId
          }
          if (body.data.code) {
            mockResult.dairy.code = body.data.code
            mockResult.admin.dairyCode = body.data.code
          }
          if (body.data.admin?.id) {
            mockResult.admin.id = body.data.admin.id
            mockResult.admin.dairyId = mockResult.dairy.id
            mockResult.dairy.primaryAdminId = body.data.admin.id
          }

          // Sync created dairy into mock storage with real backend id
          mockBackend.syncDairiesFromBackend([
            {
              id: mockResult.dairy.id,
              code: mockResult.dairy.code,
              name: mockResult.dairy.name,
              status: mockResult.dairy.status,
              primaryAdminId: mockResult.admin.id,
              primaryAdminName: mockResult.admin.fullName,
              primaryAdminMobile: mockResult.admin.mobile,
              location: mockResult.dairy.location,
              contact: mockResult.dairy.contact,
            },
          ])

          return mockResult
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        if (errData.error) {
          throw new Error(errData.error)
        }
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('network')) {
        throw err
      }
    }
    return mockBackend.createDairy(payload, actor)
  },

  async suspendDairy(payload: SuspendDairyPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    await simulateNetworkDelay(220)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      await fetch(`${baseUrl}/api/v1/dairies/${encodeURIComponent(payload.dairyId)}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: payload.reason, actorId: actor.id }),
      })
    } catch {}
    return mockBackend.suspendDairy(payload, actor)
  },

  async reactivateDairy(payload: ReactivateDairyPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    await simulateNetworkDelay(220)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      await fetch(`${baseUrl}/api/v1/dairies/${encodeURIComponent(payload.dairyId)}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: payload.reason, actorId: actor.id }),
      })
    } catch {}
    return mockBackend.reactivateDairy(payload, actor)
  },

  async updateDairyConfig(payload: UpdateDairyConfigPayload, actor: SuperAdminUser): Promise<DairyTenant> {
    await simulateNetworkDelay(160)
    return mockBackend.updateDairyConfig(payload, actor)
  },

  // --- DAIRY ADMINS ---
  async getAdmins(params?: AdminListQuery): Promise<DairyAdminAccount[]> {
    await simulateNetworkDelay(120)
    return mockBackend.getAdmins(params)
  },

  async resendInvitation(payload: ResendInvitationPayload, actor: SuperAdminUser): Promise<DairyAdminAccount> {
    await simulateNetworkDelay(180)
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      await fetch(`${baseUrl}/api/v1/dairies/invitations/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: payload.adminId }),
      })
    } catch {
      // Backend offline; handled by mockBackend
    }
    return mockBackend.resendInvitation(payload, actor)
  },

  // --- ACTIVATION FLOW ---
  async getActivationLink(dairyId: string, adminId?: string) {
    return mockBackend.getActivationLink(dairyId, adminId)
  },

  async validateActivationToken(token?: string, dairyCode?: string) {
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const query = new URLSearchParams()
      if (token) query.set('token', token)
      if (dairyCode) query.set('dairyCode', dairyCode)
      const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/validate?${query.toString()}`)
      const body = await res.json().catch(() => null)
      if (res.ok && body && (body.code === 'VALID' || body.data)) {
        return body
      }
      if (res.status === 400 && body && (body.code === 'ALREADY_CONSUMED' || body.code === 'INVITATION_REVOKED' || body.code === 'INVITATION_EXPIRED')) {
        return body
      }
    } catch {
      // Backend unavailable or network failure -> fallback to local mockBackend
    }
    return mockBackend.validateActivationToken(token, dairyCode)
  },

  async requestActivationOtp(token?: string, dairyCode?: string) {
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dairyCode }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.success) {
        return body
      }
    } catch {
      // Backend unavailable or network failure -> fallback to local mockBackend
    }
    return mockBackend.requestActivationOtp(token, dairyCode)
  },

  async activatePrimaryAdmin(token?: string, otp?: string, dairyCode?: string) {
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const res = await fetch(`${baseUrl}/api/v1/dairies/invitations/activate`, {
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
      if (res.status === 400 && body?.error && !body.error.includes('Route') && !body.error.includes('not found')) {
        throw new Error(body.error)
      }
    } catch (err: any) {
      const msg = err?.message || ''
      const isNetworkOrFallback =
        !msg ||
        /failed to fetch|fetch failed|networkerror|load failed/i.test(msg) ||
        msg.includes('Route') ||
        msg.includes('not found') ||
        msg.includes('is not a function') ||
        msg.includes('unavailable')
      if (!isNetworkOrFallback) {
        throw err
      }
    }
    return mockBackend.activatePrimaryAdmin(token, otp, dairyCode)
  },

  async transferPrimaryAdmin(payload: TransferAdminPayload, actor: SuperAdminUser): Promise<{ dairy: DairyTenant; newAdmin: DairyAdminAccount }> {
    await simulateNetworkDelay(300)
    return mockBackend.transferPrimaryAdmin(payload, actor)
  },

  // --- MONITORING ---
  async getPlatformHealth(): Promise<PlatformHealthSummary> {
    await simulateNetworkDelay(110)
    return mockBackend.getPlatformHealth()
  },

  // --- ALERTS ---
  async getAlerts(params?: { severity?: string; status?: string }): Promise<PlatformAlert[]> {
    await simulateNetworkDelay(90)
    return mockBackend.getAlerts(params)
  },

  async acknowledgeAlert(payload: AcknowledgeAlertPayload, actor: SuperAdminUser): Promise<PlatformAlert> {
    await simulateNetworkDelay(140)
    return mockBackend.acknowledgeAlert(payload, actor)
  },

  async resolveAlert(payload: ResolveAlertPayload, actor: SuperAdminUser): Promise<PlatformAlert> {
    await simulateNetworkDelay(160)
    return mockBackend.resolveAlert(payload, actor)
  },

  // --- AUDIT ---
  async getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    await simulateNetworkDelay(130)
    return mockBackend.getAuditLogs(filter)
  },

  // --- SUPPORT ACCESS ---
  async getActiveSupportSession(): Promise<SupportSession | null> {
    await simulateNetworkDelay(60)
    return mockBackend.getActiveSupportSession()
  },

  async getAllSupportSessions(): Promise<SupportSession[]> {
    await simulateNetworkDelay(90)
    return mockBackend.getAllSupportSessions()
  },

  async requestSupportSession(payload: RequestSupportSessionPayload, actor: SuperAdminUser): Promise<SupportSession> {
    await simulateNetworkDelay(240)
    return mockBackend.requestSupportSession(payload, actor)
  },

  async revokeSupportSession(payload: RevokeSupportSessionPayload, actor: SuperAdminUser): Promise<SupportSession> {
    await simulateNetworkDelay(180)
    return mockBackend.revokeSupportSession(payload, actor)
  },

  // --- REPORTS ---
  async generateReport(filter: ReportFilter, actor: SuperAdminUser): Promise<PlatformReportResult> {
    await simulateNetworkDelay(200)
    return mockBackend.generateReport(filter, actor)
  },

  // --- PURGE ADMIN & RELATED RECORDS ---
  async purgeAdminAndRelatedRecords(targetPhoneOrMobile: string): Promise<{
    purgedAdmins: string[]
    purgedDairies: string[]
    purgedInvitations: string[]
  }> {
    await simulateNetworkDelay(150)
    // Try backend API purge if online
    try {
      const rawBaseUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000'
      const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '')
      const clean = targetPhoneOrMobile.replace(/\D/g, '').slice(-10)
      await fetch(`${baseUrl}/api/v1/dairies/admin/by-phone/${clean}`, {
        method: 'DELETE',
      }).catch(() => {})
    } catch {
      // Backend offline; proceed with client storage purge
    }
    return mockBackend.purgeAdminAndRelatedRecords(targetPhoneOrMobile)
  },
}
