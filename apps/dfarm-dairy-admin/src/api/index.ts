// DFarm Dairy Admin Web — API Bridge
// Provides typed asynchronous API services with backend contracts and local in-memory fallback.

import { MockDairyBackend, CURRENT_DAIRY_ID } from './mock-server'
import { getStoredAuth, setStoredAuth, clearStoredAuth } from './client'
import type { DairyAdminUser } from '@/types'

export const api = {
  // Auth
  auth: {
    sendOtp: async (mobile: string) => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const res = await fetch(`${baseUrl}/auth/admin/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobile }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to dispatch Admin OTP via ExpertSkill')
      }
      return data
    },
    verifyOtp: async (mobile: string, otp: string) => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
      const res = await fetch(`${baseUrl}/auth/admin/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobile, otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Verification failed')
      }
      const user: DairyAdminUser = {
        id: data.user?.id || 'admin-user-01',
        mobileNumber: mobile,
        fullName: data.user?.name || data.user?.fullName || 'Dairy Administrator',
        dairyId: data.user?.dairyId || CURRENT_DAIRY_ID,
        dairyName: data.user?.dairyName || 'DFarm Cooperative Society',
        dairyCode: data.user?.dairyCode || 'SKDS-01',
        isPrimaryAdmin: true,
        role: (data.user?.role as any) || 'PRIMARY_DAIRY_ADMIN',
        sessionToken: data.token,
        lastLoginAt: new Date().toISOString(),
        permissions: ['ALL' as any],
      }
      setStoredAuth(user.sessionToken, user.dairyId, user)
      return user
    },
    getCurrentUser: (): DairyAdminUser | null => {
      const { user } = getStoredAuth()
      return user
    },
    logout: async () => {
      clearStoredAuth()
    },
  },

  // Dashboard
  dashboard: {
    getSummary: async () => {
      return MockDairyBackend.getDashboardSummary()
    },
  },

  // Customer Management & Approvals
  customers: {
    getPending: async () => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const { token, dairyId } = getStoredAuth()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        if (dairyId) headers['x-dairy-id'] = dairyId

        const queryStr = dairyId ? `?organizationId=${encodeURIComponent(dairyId)}` : ''
        const res = await fetch(`${baseUrl}/customers/pending${queryStr}`, { headers })
        if (res.ok) {
          const json = await res.json()
          const backendList = Array.isArray(json.data) ? json.data : []
          const mockList = await MockDairyBackend.getPendingRegistrations()
          const seenIds = new Set(backendList.map((c: any) => c.id))
          const merged = [...backendList]
          for (const m of mockList) {
            if (!seenIds.has(m.id)) {
              merged.push(m)
            }
          }
          return merged
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.getPendingRegistrations()
    },
    approve: async (requestId: string, operatorName: string) => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const { token, dairyId } = getStoredAuth()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        if (dairyId) headers['x-dairy-id'] = dairyId

        const res = await fetch(`${baseUrl}/customers/${encodeURIComponent(requestId)}/approve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ operatorName }),
        })
        if (res.ok) {
          const json = await res.json()
          const c = json.data || json
          MockDairyBackend.approveRegistration(requestId, operatorName).catch(() => {})
          return {
            id: c.id || requestId,
            dairyId: c.organizationId || dairyId || CURRENT_DAIRY_ID,
            customerCode: c.farmerCode || c.customerCode || 'C-101',
            fullName: c.fullName || 'Registered Farmer',
            mobileNumber: c.mobileNumber || '',
            fatherOrHusbandName: c.fatherOrHusbandName || 'Farmer',
            status: 'ACTIVE' as const,
            preferredCategory: (c.permittedCategories?.[0] || 'COW') as any,
            registrationDate: new Date().toISOString().split('T')[0],
            village: c.village || 'Local Area',
            bankDetails: c.bankDetails,
            faceEnrollmentStatus: 'ENROLLED' as const,
            rfidAssigned: false,
            creditBalance: 0,
            accumulatedMilkLiters: 0,
            hasPendingRegistration: false,
          }
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.approveRegistration(requestId, operatorName)
    },
    reject: async (requestId: string, reason: string, operatorName: string) => {
      if (!reason || reason.trim().length < 5) {
        throw new Error('A detailed rejection reason is required (minimum 5 characters).')
      }
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const { token, dairyId } = getStoredAuth()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        if (dairyId) headers['x-dairy-id'] = dairyId

        const res = await fetch(`${baseUrl}/customers/${encodeURIComponent(requestId)}/reject`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason, operatorName }),
        })
        if (res.ok) {
          MockDairyBackend.rejectRegistration(requestId, reason, operatorName).catch(() => {})
          return
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.rejectRegistration(requestId, reason, operatorName)
    },
    getAll: async (includeSoftDeleted = false) => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const { token, dairyId } = getStoredAuth()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        if (dairyId) headers['x-dairy-id'] = dairyId

        const queryStr = dairyId ? `?organizationId=${encodeURIComponent(dairyId)}` : ''
        const res = await fetch(`${baseUrl}/customers${queryStr}`, { headers })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.data)) {
            const backendCustomers = json.data.map((c: any) => ({
              id: c.id,
              dairyId: c.organizationId || dairyId || CURRENT_DAIRY_ID,
              customerCode: c.farmerCode || c.customerCode || 'C-101',
              fullName: c.fullName,
              mobileNumber: c.mobileNumber,
              fatherOrHusbandName: c.fatherOrHusbandName || '',
              status: c.status || 'ACTIVE',
              preferredCategory: (c.permittedCategories?.[0] || 'COW') as any,
              registrationDate: c.createdAt ? c.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
              village: c.village || '',
              bankDetails: c.bankDetails,
              faceEnrollmentStatus: c.faceEnrollmentStatus || 'ENROLLED',
              rfidAssigned: Boolean(c.rfidCardUid),
              rfidCardUid: c.rfidCardUid,
              creditBalance: 0,
              accumulatedMilkLiters: 0,
              hasPendingRegistration: c.registrationStatus === 'PENDING_APPROVAL',
            }))
            const mockCustomers = await MockDairyBackend.getCustomers(includeSoftDeleted)
            const seenIds = new Set(backendCustomers.map((c: any) => c.id))
            const merged = [...backendCustomers]
            for (const m of mockCustomers) {
              if (!seenIds.has(m.id)) {
                merged.push(m)
              }
            }
            return merged
          }
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.getCustomers(includeSoftDeleted)
    },
    getById: async (id: string) => {
      return MockDairyBackend.getCustomerById(id)
    },
    softDelete: async (id: string, reason: string, operatorName: string) => {
      return MockDairyBackend.softDeleteCustomer(id, reason, operatorName)
    },
    restore: async (id: string, operatorName: string) => {
      return MockDairyBackend.restoreCustomer(id, operatorName)
    },
  },

  // Biometric Face Enrollment (YuNet + SFace)
  faceEnrollment: {
    getAll: async () => {
      return MockDairyBackend.getFaceEnrollments()
    },
    requestReEnrollment: async (recordId: string, note: string, operatorName: string) => {
      return MockDairyBackend.requestFaceReEnrollment(recordId, note, operatorName)
    },
    revoke: async (recordId: string, reason: string, operatorName: string) => {
      return MockDairyBackend.revokeFaceEnrollment(recordId, reason, operatorName)
    },
  },

  // RFID
  rfid: {
    getAll: async () => {
      return MockDairyBackend.getRfidCards()
    },
    assign: async (cardUid: string, customerId: string, operatorName: string) => {
      return MockDairyBackend.assignRfidCard(cardUid, customerId, operatorName)
    },
    markLost: async (cardUid: string, reason: string, operatorName: string) => {
      return MockDairyBackend.markRfidCardLost(cardUid, reason, operatorName)
    },
  },

  // Collection Sessions & Records
  collections: {
    getSessions: async () => {
      return MockDairyBackend.getCollectionSessions()
    },
    closeSession: async (sessionId: string, operatorName: string) => {
      return MockDairyBackend.closeCollectionSession(sessionId, operatorName)
    },
    getTransactions: async (params?: { customerId?: string; date?: string }) => {
      return MockDairyBackend.getCollectionTransactions(params)
    },
    adjustTransaction: async (txnId: string, newWeight: number, reason: string, operatorName: string) => {
      return MockDairyBackend.adjustCollectionRecord(txnId, newWeight, reason, operatorName)
    },
  },

  // Quality
  quality: {
    getReadings: async () => {
      return MockDairyBackend.getQualityReadings()
    },
  },

  // Rate Charts
  rateCharts: {
    getAll: async () => {
      return MockDairyBackend.getRateCharts()
    },
    createDraftVersion: async (
      params: {
        title: string
        milkCategory: 'COW' | 'BUFFALO'
        baseRatePerLiter: number
        minFat: number
        maxFat: number
        fatStep: number
        minSnf: number
        maxSnf: number
        snfStep: number
        effectiveDate: string
        changeNotes: string
      },
      operatorName: string,
    ) => {
      return MockDairyBackend.createRateChartVersion(params, operatorName)
    },
    activateVersion: async (chartId: string, operatorName: string) => {
      return MockDairyBackend.activateRateChartVersion(chartId, operatorName)
    },
  },

  // Ledger
  ledger: {
    getEntries: async (customerId?: string) => {
      return MockDairyBackend.getCustomerLedger(customerId)
    },
    performAdjustment: async (
      params: {
        customerId: string
        type: 'CREDIT' | 'DEBIT'
        amount: number
        reason: string
        description: string
      },
      operatorName: string,
    ) => {
      return MockDairyBackend.performLedgerAdjustment(params, operatorName)
    },
  },

  // Billing
  billing: {
    getBills: async () => {
      return MockDairyBackend.getDairyBills()
    },
    generateBill: async (
      customerId: string,
      periodStart: string,
      periodEnd: string,
      cycleName: string,
      operatorName: string,
    ) => {
      return MockDairyBackend.generateFortnightlyBill(customerId, periodStart, periodEnd, cycleName, operatorName)
    },
  },

  // Feed & Inventory
  feed: {
    getProducts: async () => {
      return MockDairyBackend.getFeedProducts()
    },
    getMovements: async () => {
      return MockDairyBackend.getFeedMovements()
    },
    getSales: async () => {
      return MockDairyBackend.getCustomerFeedSales()
    },
    addStock: async (productId: string, quantity: number, reason: string, operatorName: string) => {
      return MockDairyBackend.addFeedStock(productId, quantity, reason, operatorName)
    },
    recordSale: async (
      params: {
        customerId: string
        productId: string
        quantity: number
        paymentMode: 'LEDGER_DEBIT' | 'CASH' | 'ONLINE'
        notes?: string
      },
      operatorName: string,
    ) => {
      return MockDairyBackend.recordFeedSale(params, operatorName)
    },
  },

  // Payments
  payments: {
    getAll: async () => {
      return MockDairyBackend.getPaymentRecords()
    },
    recordPayment: async (
      params: {
        customerId: string
        amount: number
        paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'
        transactionReference: string
        linkedBillId?: string
        notes?: string
      },
      operatorName: string,
    ) => {
      return MockDairyBackend.recordCustomerPayment(params, operatorName)
    },
  },

  // Devices & Sync
  devices: {
    getAll: async () => {
      return MockDairyBackend.getCollectionDevices()
    },
    sync: async (deviceId: string, operatorName: string) => {
      return MockDairyBackend.triggerDeviceSync(deviceId, operatorName)
    },
  },

  // Staff
  staff: {
    getAll: async () => {
      return MockDairyBackend.getStaffMembers()
    },
  },

  // Audit Logs
  audit: {
    getAll: async () => {
      return MockDairyBackend.getAuditLogs()
    },
  },

  // Notifications
  notifications: {
    getAll: async () => {
      return MockDairyBackend.getNotifications()
    },
    markRead: async (notifId: string) => {
      return MockDairyBackend.markNotificationRead(notifId)
    },
  },

  // Primary Dairy Admin Activation
  activation: {
    validateToken: async (token: string) => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const res = await fetch(`${baseUrl}/dairies/invitations/validate?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => null)
        if (res.ok && data && (data.code === 'VALID' || data.data || data.invitation)) {
          return data
        }
        if (res.status === 400 && data && (data.code === 'ALREADY_CONSUMED' || data.code === 'INVITATION_REVOKED' || data.code === 'EXPIRED')) {
          return data
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.validateActivationToken(token)
    },
    requestOtp: async (token: string) => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const res = await fetch(`${baseUrl}/dairies/invitations/otp/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.success) {
          return data
        }
      } catch {
        // Fallback to MockDairyBackend
      }
      return MockDairyBackend.requestActivationOtp(token)
    },
    activate: async (token: string, otp: string, confirmed: boolean = true) => {
      try {
        const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
        const res = await fetch(`${baseUrl}/dairies/invitations/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, otp, confirmed }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && (data?.success || data?.data)) {
          MockDairyBackend.activatePrimaryAdmin(token, otp, confirmed).catch(() => {})
          return data?.data || data
        }
        if (res.status === 400 && data?.error && !data.error.includes('Route') && !data.error.includes('not found')) {
          throw new Error(data.error)
        }
      } catch (err: any) {
        const msg = err?.message || ''
        const isNetworkOrFallback =
          !msg ||
          /failed to fetch|fetch failed|networkerror|load failed/i.test(msg) ||
          msg.includes('Route') ||
          msg.includes('not found') ||
          msg.includes('unavailable')
        if (!isNetworkOrFallback) {
          throw err
        }
      }
      return MockDairyBackend.activatePrimaryAdmin(token, otp, confirmed)
    },
  },
}
