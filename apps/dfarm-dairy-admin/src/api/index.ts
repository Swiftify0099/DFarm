// DFarm Dairy Admin Web — API Bridge
// Provides typed asynchronous API services with backend contracts and local in-memory fallback.

import { getStoredAuth, setStoredAuth, clearStoredAuth, createHeaders, apiRequest, getApiBaseUrl } from './client'
import type {
  Customer,
  CustomerRegistrationRequest,
  DairyAdminUser,
  FaceEnrollmentRecord,
  RfidCardRecord,
  CollectionSession,
  MilkCollectionTransaction,
  MilkQualityReading,
  MilkRateChart,
  CustomerLedgerEntry,
  DairyBill,
  FeedProduct,
  FeedStockMovement,
  CustomerFeedSale,
  PaymentRecord,
  CollectionDevice,
  StaffMember,
  AuditLogEntry,
  DairyNotification,
} from '@/types'

export const api = {
  // Auth
  auth: {
    sendOtp: async (mobile: string) => {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/auth/admin/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobile }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorMsg = data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || 'Failed to dispatch Admin OTP via ExpertSkill'
        throw new Error(errorMsg)
      }
      return data
    },
    verifyOtp: async (mobile: string, otp: string) => {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/auth/admin/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobile, otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorMsg = data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || 'Verification failed'
        throw new Error(errorMsg)
      }
      if (!data.user?.dairyId) {
        throw new Error('This administrator account has no active authorized Dairy membership.')
      }
      const user: DairyAdminUser = {
        id: data.user.id || 'admin-user-01',
        mobileNumber: mobile,
        fullName: data.user.name || data.user.fullName || 'Dairy Administrator',
        dairyId: data.user.dairyId,
        dairyName: data.user.dairyName || 'Dairy Cooperative',
        dairyCode: data.user.dairyCode || 'DAIRY',
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
    getMe: async (): Promise<DairyAdminUser | null> => {
      try {
        const res = await apiRequest<{ success: boolean; user: any }>('/auth/admin/me')
        if (res?.user && res.user.dairyId) {
          const { user: storedUser } = getStoredAuth()
          const updatedUser: DairyAdminUser = {
            ...storedUser,
            id: res.user.id,
            mobileNumber: res.user.mobileNumber,
            fullName: res.user.fullName,
            dairyId: res.user.dairyId,
            dairyName: res.user.dairyName,
            dairyCode: res.user.dairyCode,
            role: res.user.role || 'PRIMARY_DAIRY_ADMIN',
            isPrimaryAdmin: true,
            sessionToken: storedUser?.sessionToken || '',
            lastLoginAt: storedUser?.lastLoginAt || new Date().toISOString(),
            permissions: ['ALL' as any],
          }
          setStoredAuth(updatedUser.sessionToken, updatedUser.dairyId, updatedUser)
          return updatedUser
        }
      } catch {
        // Not authenticated or network error
      }
      return null
    },
    logout: async () => {
      clearStoredAuth()
    },
  },

  // Dashboard
  dashboard: {
    getSummary: async () => {
      const { user } = getStoredAuth()
      try {
        const json = await apiRequest<{ success: boolean; data: any }>('/dashboard/summary')
        const m = json.data || json
        return {
          dairyProfile: {
            name: m.dairyProfile?.name || user?.dairyName || 'Dairy Cooperative',
            code: m.dairyProfile?.code || user?.dairyCode || 'DAIRY',
            subscription: m.dairyProfile?.subscription || 'ENTERPRISE',
          },
          todayCollection: {
            totalLiters: Number(m.todayCollection?.totalLiters ?? m.todayTotalMilkQtyKg) || 0,
            cowLiters: Number(m.todayCollection?.cowLiters ?? m.todayCowMilkQtyKg) || 0,
            buffaloLiters: Number(m.todayCollection?.buffaloLiters ?? m.todayBuffaloMilkQtyKg) || 0,
            transactionCount: Number(m.todayCollection?.transactionCount ?? m.todayTotalCollections) || 0,
            totalAmount: Number(m.todayCollection?.totalAmount ?? m.todayTotalMilkValue) || 0,
          },
          customers: {
            pendingApprovals: Number(m.customers?.pendingApprovals ?? m.pendingCustomerRegistrations) || 0,
            activeCustomers: Number(m.customers?.activeCustomers ?? m.activeCustomers) || 0,
            totalCustomers: Number(m.customers?.totalCustomers ?? m.totalCustomers) || 0,
          },
          systemStatus: {
            connectedDevicesCount: Number(m.systemStatus?.connectedDevicesCount ?? m.deviceStatus?.active) || 0,
            offlineDevicesCount: Number(m.systemStatus?.offlineDevicesCount ?? ((Number(m.deviceStatus?.blocked) || 0) + (Number(m.deviceStatus?.inactive) || 0))) || 0,
          },
          finance: {
            pendingCustomerBalances: Number(m.finance?.pendingCustomerBalances ?? m.totalCustomerPayables) || 0,
          },
          inventory: {
            totalProducts: Number(m.inventory?.totalProducts) || 0,
            lowStockItemCount: Number(m.inventory?.lowStockItemCount ?? m.feedStockAlerts) || 0,
          },
        }
      } catch {
        return {
          dairyProfile: {
            name: user?.dairyName || 'Dairy Cooperative',
            code: user?.dairyCode || 'DAIRY',
            subscription: 'ENTERPRISE',
          },
          todayCollection: {
            totalLiters: 0,
            cowLiters: 0,
            buffaloLiters: 0,
            transactionCount: 0,
            totalAmount: 0,
          },
          customers: {
            pendingApprovals: 0,
            activeCustomers: 0,
            totalCustomers: 0,
          },
          systemStatus: {
            connectedDevicesCount: 0,
            offlineDevicesCount: 0,
          },
          finance: {
            pendingCustomerBalances: 0,
          },
          inventory: {
            totalProducts: 0,
            lowStockItemCount: 0,
          },
        }
      }
    },
  },

  // Customer Management & Approvals
  customers: {
    getPending: async (): Promise<CustomerRegistrationRequest[]> => {
      try {
        const { dairyId } = getStoredAuth()
        const queryStr = dairyId ? `?organizationId=${encodeURIComponent(dairyId)}` : ''
        const json = await apiRequest<{ success: boolean; data: any[] }>(`/customers/pending${queryStr}`)
        if (Array.isArray(json.data)) {
          return json.data.map((c: any) => ({
            id: c.id,
            dairyId: c.organizationId || c.dairyId || dairyId || '',
            candidateName: c.fullName || c.candidateName || 'Applicant',
            mobileNumber: c.mobileNumber || '',
            submittedAt: c.submittedAt || c.createdAt || new Date().toISOString(),
            address: c.address || c.village || 'Local Area',
            village: c.village || 'Local Area',
            preferredCategory: (c.permittedCategories?.[0] || c.preferredCategory || 'COW') as any,
            bankDetails: c.bankDetails ? {
              accountNumber: c.bankDetails.accountNumber || '',
              bankName: c.bankDetails.bankName || '',
              ifscCode: c.bankDetails.ifscCode || '',
            } : undefined,
            faceCapture: {
              templateVersion: c.faceCapture?.templateVersion || 'sface_int8_2021dec',
              modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
              consentTimestamp: c.faceCapture?.consentTimestamp || c.submittedAt || c.createdAt || new Date().toISOString(),
              consentAgreed: true,
              enrollmentStatus: (c.faceEnrollmentStatus === 'ENROLLED' ? 'APPROVED' : (c.faceEnrollmentStatus || 'PENDING_APPROVAL')) as any,
              qualityScore: Number(c.faceScore || c.faceCapture?.qualityScore || 94.5),
              captureDevice: c.faceCapture?.captureDevice || 'Customer Mobile App (YuNet)',
            },
            status: (c.status === 'PENDING' || c.registrationStatus === 'PENDING_APPROVAL') ? 'PENDING' : (c.status || c.registrationStatus || 'PENDING'),
            rejectionReason: c.rejectionReason,
            reviewedBy: c.reviewedBy,
            reviewedAt: c.reviewedAt,
          }))
        }
      } catch {}
      return []
    },
    approve: async (requestId: string, operatorName: string): Promise<Customer> => {
      const res = await apiRequest<any>(`/customers/${encodeURIComponent(requestId)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
      const c = res.data || res
      const { dairyId } = getStoredAuth()
      return {
        id: c.id || requestId,
        dairyId: c.organizationId || dairyId || '',
        customerCode: c.farmerCode || c.customerCode || 'C-101',
        fullName: c.fullName || 'Registered Farmer',
        mobileNumber: c.mobileNumber || '',
        fatherOrHusbandName: c.fatherOrHusbandName || '',
        status: 'ACTIVE',
        preferredCategory: (c.permittedCategories?.[0] || 'COW') as any,
        registrationDate: new Date().toISOString().split('T')[0],
        village: c.village || '',
        bankDetails: c.bankDetails,
        biometric: {
          faceEnrollmentStatus: 'APPROVED',
          faceEnrolledAt: new Date().toISOString(),
          faceModelVersion: 'OpenCV SFace INT8',
        },
        rfidCard: c.rfidCardUid ? {
          cardUid: c.rfidCardUid,
          assignedAt: new Date().toISOString(),
          status: 'ACTIVE',
        } : undefined,
        summary: {
          totalLitersDelivered: 0,
          pendingBalance: 0,
          totalFeedPurchased: 0,
        },
        isSoftDeleted: false,
        auditCount: 1,
      }
    },
    reject: async (requestId: string, reason: string, operatorName: string) => {
      if (!reason || reason.trim().length < 5) {
        throw new Error('A detailed rejection reason is required (minimum 5 characters).')
      }
      await apiRequest(`/customers/${encodeURIComponent(requestId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, operatorName }),
      })
    },
    getAll: async (includeSoftDeleted = false): Promise<Customer[]> => {
      try {
        const { dairyId } = getStoredAuth()
        const queryStr = `?includeSoftDeleted=${includeSoftDeleted}${dairyId ? `&organizationId=${encodeURIComponent(dairyId)}` : ''}`
        const json = await apiRequest<{ success: boolean; data: any[] }>(`/customers${queryStr}`)
        if (Array.isArray(json.data)) {
          return json.data.map((c: any) => ({
            id: c.id,
            dairyId: c.organizationId || dairyId || '',
            customerCode: c.farmerCode || c.customerCode || 'C-101',
            fullName: c.fullName,
            mobileNumber: c.mobileNumber,
            fatherOrHusbandName: c.fatherOrHusbandName || '',
            status: c.status || 'ACTIVE',
            preferredCategory: (c.permittedCategories?.[0] || 'COW') as any,
            registrationDate: c.createdAt ? c.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
            village: c.village || '',
            bankDetails: c.bankDetails,
            biometric: {
              faceEnrollmentStatus: c.faceEnrollmentStatus === 'ENROLLED' ? 'APPROVED' : (c.faceEnrollmentStatus || 'NOT_ENROLLED'),
              faceEnrolledAt: c.faceEnrolledAt || c.createdAt,
              faceModelVersion: c.faceModelVersion || 'OpenCV SFace INT8',
              consentEvidenceHash: c.consentEvidenceHash,
            },
            rfidCard: c.rfidCardUid ? {
              cardUid: c.rfidCardUid,
              assignedAt: c.rfidAssignedAt || c.createdAt,
              status: 'ACTIVE',
            } : undefined,
            summary: {
              totalLitersDelivered: Number(c.accumulatedMilkLiters) || 0,
              pendingBalance: Number(c.creditBalance) || 0,
              totalFeedPurchased: Number(c.totalFeedPurchased) || 0,
              lastDeliveryDate: c.lastDeliveryDate,
            },
            isSoftDeleted: Boolean(c.isDeleted || c.isSoftDeleted),
            deletedAt: c.deletedAt,
            deletedReason: c.deletedReason,
            auditCount: Number(c.auditCount) || 1,
          }))
        }
      } catch {}
      return []
    },
    getById: async (id: string): Promise<Customer> => {
      const json = await apiRequest<{ success: boolean; data: any }>(`/customers/${encodeURIComponent(id)}`)
      const c = json.data || json
      const { dairyId } = getStoredAuth()
      return {
        id: c.id,
        dairyId: c.organizationId || dairyId || '',
        customerCode: c.farmerCode || c.customerCode || 'C-101',
        fullName: c.fullName,
        mobileNumber: c.mobileNumber,
        fatherOrHusbandName: c.fatherOrHusbandName || '',
        status: c.status || 'ACTIVE',
        preferredCategory: (c.permittedCategories?.[0] || 'COW') as any,
        registrationDate: c.createdAt ? c.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
        village: c.village || '',
        bankDetails: c.bankDetails,
        biometric: {
          faceEnrollmentStatus: c.faceEnrollmentStatus === 'ENROLLED' ? 'APPROVED' : (c.faceEnrollmentStatus || 'NOT_ENROLLED'),
          faceEnrolledAt: c.faceEnrolledAt || c.createdAt,
          faceModelVersion: c.faceModelVersion || 'OpenCV SFace INT8',
          consentEvidenceHash: c.consentEvidenceHash,
        },
        rfidCard: c.rfidCardUid ? {
          cardUid: c.rfidCardUid,
          assignedAt: c.rfidAssignedAt || c.createdAt,
          status: 'ACTIVE',
        } : undefined,
        summary: {
          totalLitersDelivered: Number(c.accumulatedMilkLiters) || 0,
          pendingBalance: Number(c.creditBalance) || 0,
          totalFeedPurchased: Number(c.totalFeedPurchased) || 0,
          lastDeliveryDate: c.lastDeliveryDate,
        },
        isSoftDeleted: Boolean(c.isDeleted || c.isSoftDeleted),
        deletedAt: c.deletedAt,
        deletedReason: c.deletedReason,
        auditCount: Number(c.auditCount) || 1,
      }
    },
    softDelete: async (id: string, reason: string, operatorName: string) => {
      await apiRequest(`/customers/${encodeURIComponent(id)}/soft-delete`, {
        method: 'POST',
        body: JSON.stringify({ reason, operatorName }),
      })
    },
    restore: async (id: string, operatorName: string) => {
      await apiRequest(`/customers/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
    },
    suspend: async (id: string, reason: string, operatorName: string) => {
      return apiRequest(`/customers/${encodeURIComponent(id)}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason, operatorName }),
      })
    },
    reactivate: async (id: string, operatorName: string) => {
      return apiRequest(`/customers/${encodeURIComponent(id)}/reactivate`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
    },
    updateProfile: async (id: string, updates: any) => {
      return apiRequest(`/customers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
  },

  // Biometric Face Enrollment (YuNet + SFace)
  faceEnrollment: {
    getAll: async (): Promise<FaceEnrollmentRecord[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: FaceEnrollmentRecord[] }>('/identity/face/enrollments')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    requestReEnrollment: async (recordId: string, note: string, operatorName: string) => {
      return apiRequest(`/identity/face/enrollments/${encodeURIComponent(recordId)}/re-enroll`, {
        method: 'POST',
        body: JSON.stringify({ note, operatorName }),
      })
    },
    revoke: async (recordId: string, reason: string, operatorName: string) => {
      return apiRequest(`/identity/face/enrollments/${encodeURIComponent(recordId)}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason, operatorName }),
      })
    },
  },

  // RFID
  rfid: {
    getAll: async (): Promise<RfidCardRecord[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: RfidCardRecord[] }>('/rfid')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    assign: async (cardUid: string, customerId: string, operatorName: string) => {
      return apiRequest('/rfid/assign', {
        method: 'POST',
        body: JSON.stringify({ cardUid, customerId, operatorName }),
      })
    },
    markLost: async (cardUid: string, reason: string, operatorName: string) => {
      return apiRequest('/rfid/mark-lost', {
        method: 'POST',
        body: JSON.stringify({ cardUid, reason, operatorName }),
      })
    },
    unassign: async (cardUid: string, customerId?: string) => {
      return apiRequest('/rfid/unassign', {
        method: 'POST',
        body: JSON.stringify({ cardUid, customerId }),
      })
    },
  },

  // Collection Sessions & Records
  collections: {
    getSessions: async (): Promise<CollectionSession[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: CollectionSession[] }>('/collections/sessions')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    closeSession: async (sessionId: string, operatorName: string): Promise<{ sessionId: string; totals: any }> => {
      const res = await apiRequest<any>(`/collections/sessions/${encodeURIComponent(sessionId)}/close`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
      return { sessionId, totals: res?.data?.totals || { totalLiters: 0, totalAmount: 0 } }
    },
    getTransactions: async (params?: { customerId?: string; date?: string }): Promise<MilkCollectionTransaction[]> => {
      try {
        const q = new URLSearchParams()
        if (params?.customerId) q.set('customerId', params.customerId)
        if (params?.date) q.set('date', params.date)
        const qStr = q.toString() ? `?${q.toString()}` : ''
        const res = await apiRequest<{ success: boolean; data: MilkCollectionTransaction[] }>(`/collections/transactions${qStr}`)
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    adjustTransaction: async (txnId: string, newWeight: number, reason: string, operatorName: string): Promise<{ transactionId: string }> => {
      await apiRequest(`/collections/transactions/${encodeURIComponent(txnId)}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ newWeight, reason, operatorName }),
      })
      return { transactionId: txnId }
    },
  },

  // Quality
  quality: {
    getReadings: async (): Promise<MilkQualityReading[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: MilkQualityReading[] }>('/collections/quality/readings')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
  },

  // Rate Charts
  rateCharts: {
    getAll: async (): Promise<MilkRateChart[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: MilkRateChart[] }>('/rate-charts')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
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
      return apiRequest('/rate-charts/draft', {
        method: 'POST',
        body: JSON.stringify({ ...params, operatorName }),
      })
    },
    activateVersion: async (chartId: string, operatorName: string) => {
      return apiRequest(`/rate-charts/${encodeURIComponent(chartId)}/activate`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
    },
    previewRate: async (params: { milkCategory: 'COW' | 'BUFFALO'; fat: number; snf: number; volume?: number }) => {
      return apiRequest('/rate-charts/preview', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
  },

  // Ledger
  ledger: {
    getEntries: async (customerId?: string): Promise<CustomerLedgerEntry[]> => {
      try {
        const qStr = customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''
        const res = await apiRequest<{ success: boolean; data: CustomerLedgerEntry[] }>(`/ledger/entries${qStr}`)
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
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
      return apiRequest('/ledger/adjustment', {
        method: 'POST',
        body: JSON.stringify({ ...params, operatorName }),
      })
    },
  },

  // Billing
  billing: {
    getBills: async (): Promise<DairyBill[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: DairyBill[] }>('/bills')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    generateBill: async (
      customerId: string,
      periodStart: string,
      periodEnd: string,
      cycleName: string,
      operatorName: string,
    ) => {
      return apiRequest('/bills/generate', {
        method: 'POST',
        body: JSON.stringify({ customerId, periodStart, periodEnd, cycleName, operatorName }),
      })
    },
  },

  // Feed & Inventory
  feed: {
    getProducts: async (): Promise<FeedProduct[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: FeedProduct[] }>('/feed/products')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    getMovements: async (): Promise<FeedStockMovement[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: FeedStockMovement[] }>('/feed/movements')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    getSales: async (): Promise<CustomerFeedSale[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: CustomerFeedSale[] }>('/feed/sales')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    addStock: async (productId: string, quantity: number, reason: string, operatorName: string): Promise<FeedProduct> => {
      const res = await apiRequest<any>('/feed/stock', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity, reason, operatorName }),
      })
      return res?.data || {
        id: productId,
        name: 'Cattle Feed',
        category: 'CATTLE_FEED',
        availableStock: quantity,
        unit: 'BAG',
        reorderThreshold: 10,
        unitPrice: 1200,
        lastRestockedAt: new Date().toISOString(),
      }
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
    ): Promise<CustomerFeedSale> => {
      const res = await apiRequest<any>('/feed/sales', {
        method: 'POST',
        body: JSON.stringify({ ...params, operatorName }),
      })
      return res?.data || {
        id: 'sale-' + Date.now(),
        saleNumber: 'FS-' + Date.now().toString().slice(-6),
        customerId: params.customerId,
        customerName: 'Farmer',
        customerCode: 'C-101',
        productId: params.productId,
        productName: 'Cattle Feed',
        quantity: params.quantity,
        unitPrice: 1200,
        totalAmount: params.quantity * 1200,
        paymentMode: params.paymentMode,
        recordedAt: new Date().toISOString(),
        recordedBy: operatorName,
      }
    },
  },

  // Payments
  payments: {
    getAll: async (): Promise<PaymentRecord[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: PaymentRecord[] }>('/payments')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
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
    ): Promise<PaymentRecord> => {
      const res = await apiRequest<any>('/payments', {
        method: 'POST',
        body: JSON.stringify({ ...params, operatorName }),
      })
      return res?.data || {
        id: 'pmt-' + Date.now(),
        receiptNumber: 'PAY-' + Date.now().toString().slice(-6),
        customerId: params.customerId,
        customerCode: 'C-101',
        customerName: 'Farmer',
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        transactionReference: params.transactionReference,
        recordedAt: new Date().toISOString(),
        recordedBy: operatorName,
      }
    },
  },

  // Devices & Sync
  devices: {
    getAll: async (): Promise<CollectionDevice[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: CollectionDevice[] }>('/devices')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    sync: async (deviceId: string, operatorName: string) => {
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/sync`, {
        method: 'POST',
        body: JSON.stringify({ operatorName }),
      })
    },
  },

  // Staff
  staff: {
    getAll: async (): Promise<StaffMember[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: StaffMember[] }>('/staff')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    getCenters: async (): Promise<{ id: string; code: string; name: string }[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: { id: string; code: string; name: string }[] }>('/staff/centers')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    create: async (data: {
      fullName: string
      mobileNumber: string
      role: string
      centerId?: string
      counterName?: string
      email?: string
    }): Promise<{ success: boolean; data?: StaffMember; message?: string; error?: string }> => {
      return apiRequest<{ success: boolean; data?: StaffMember; message?: string; error?: string }>('/staff', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
    updateStatus: async (id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<any> => {
      return apiRequest(`/staff/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    },
  },

  // Audit Logs
  audit: {
    getAll: async (): Promise<AuditLogEntry[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: AuditLogEntry[] }>('/audit')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
  },

  // Notifications
  notifications: {
    getAll: async (): Promise<DairyNotification[]> => {
      try {
        const res = await apiRequest<{ success: boolean; data: DairyNotification[] }>('/notifications')
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    markRead: async (notifId: string) => {
      return apiRequest(`/notifications/${encodeURIComponent(notifId)}/read`, {
        method: 'POST',
      })
    },
  },

  // Operational Reports & Exports
  reports: {
    getCollections: async (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiRequest<any>(`/reports/collections${q}`)
    },
    getFeed: async () => {
      return apiRequest<any>('/reports/feed')
    },
    getLedger: async () => {
      return apiRequest<any>('/reports/ledger')
    },
    getExportUrl: (type: string, format: string = 'csv') => {
      const baseUrl = getApiBaseUrl()
      return `${baseUrl}/reports/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`
    },
  },

  // Primary Dairy Admin Activation
  activation: {
    validateToken: async (token: string) => {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/dairies/invitations/validate?token=${encodeURIComponent(token)}`)
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        return data
      }
      if (res.status === 400 && data) {
        return data
      }
      throw new Error(data?.error || 'This activation link is invalid or unavailable.')
    },
    requestOtp: async (token: string) => {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/dairies/invitations/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        return data
      }
      throw new Error(data?.error || data?.message || 'Failed to dispatch activation OTP.')
    },
    activate: async (token: string, otp: string, confirmed: boolean = true) => {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/dairies/invitations/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, otp, confirmed }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && (data?.success || data?.data)) {
        return data?.data || data
      }
      throw new Error(data?.error || data?.message || 'Failed to activate Primary Dairy Admin account.')
    },
  },
}
