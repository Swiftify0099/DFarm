// DFarm Collection App — Real API Client & Tenant Headers
// Strictly scopes all network operations to authenticated dairy tenant

import type {
  OperatorSession,
  ActiveCollectionSession,
  CustomerIdentity,
  CollectionTransaction,
  MilkCategory,
  ShiftType,
} from '@/types'
import { localDB } from '@/services/local-storage'

const STORAGE_KEYS = {
  TOKEN: 'dfarm_collection_token',
  DAIRY_ID: 'dfarm_collection_dairy_id',
  OPERATOR: 'dfarm_collection_operator',
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export const getStoredOperatorAuth = (): {
  token: string | null
  dairyId: string | null
  operator: OperatorSession | null
  isAuthenticated: boolean
  dairyCode: string | null
  operatorRole: string | null
} => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
    const dairyId = localStorage.getItem(STORAGE_KEYS.DAIRY_ID)
    const operatorStr = localStorage.getItem(STORAGE_KEYS.OPERATOR)
    const operator = operatorStr ? JSON.parse(operatorStr) : null
    return {
      token,
      dairyId,
      operator,
      isAuthenticated: !!token && (!!operator || !!dairyId),
      dairyCode: operator?.dairyCode || null,
      operatorRole: operator?.role || operator?.operatorRole || null,
    }
  } catch {
    return {
      token: null,
      dairyId: null,
      operator: null,
      isAuthenticated: false,
      dairyCode: null,
      operatorRole: null,
    }
  }
}

export const setStoredOperatorAuth = (
  tokenOrObj: string | any,
  dairyIdParam?: string,
  operatorParam?: any
) => {
  if (typeof tokenOrObj === 'object' && tokenOrObj !== null) {
    const obj = tokenOrObj
    localStorage.setItem(STORAGE_KEYS.TOKEN, obj.token || '')
    localStorage.setItem(STORAGE_KEYS.DAIRY_ID, obj.dairyId || '')
    const op = obj.operator || {
      id: obj.operatorId || 'op-01',
      fullName: obj.operatorName || 'Operator',
      role: obj.operatorRole || 'OPERATOR',
      dairyId: obj.dairyId,
      dairyName: obj.dairyName,
      dairyCode: obj.dairyCode,
      centerId: obj.centerId,
      centerCode: obj.centerCode,
    }
    localStorage.setItem(STORAGE_KEYS.OPERATOR, JSON.stringify(op))
  } else {
    localStorage.setItem(STORAGE_KEYS.TOKEN, tokenOrObj || '')
    if (dairyIdParam) localStorage.setItem(STORAGE_KEYS.DAIRY_ID, dairyIdParam)
    if (operatorParam) localStorage.setItem(STORAGE_KEYS.OPERATOR, JSON.stringify(operatorParam))
  }
}

export const clearStoredOperatorAuth = () => {
  localStorage.removeItem(STORAGE_KEYS.TOKEN)
  localStorage.removeItem(STORAGE_KEYS.DAIRY_ID)
  localStorage.removeItem(STORAGE_KEYS.OPERATOR)
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { token, dairyId } = getStoredOperatorAuth()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': crypto.randomUUID(),
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (dairyId) {
    headers['X-Dairy-Id'] = dairyId
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errMessage = `HTTP ${response.status} ${response.statusText}`
    try {
      const errJson = await response.json()
      errMessage = errJson.error || errJson.message || errMessage
    } catch {
      // Use status text
    }
    throw new Error(errMessage)
  }

  const data = await response.json()
  return data
}

// ============================================================================
// 1. Operator Auth API
// ============================================================================
export const authApi = {
  requestOtp: async (mobileNumber: string): Promise<{ success: boolean; message: string; previewOtp?: string }> => {
    return apiRequest('/auth/operator/otp/request', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber }),
    })
  },

  verifyOtp: async (mobileNumber: string, otp: string): Promise<OperatorSession> => {
    const res = await apiRequest<{
      success: boolean
      token: string
      operator: {
        id: string
        fullName: string
        mobileNumber: string
        role: string
        dairyId: string
        centerId: string
      }
    }>('/auth/operator/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, otp }),
    })

    const op: OperatorSession = {
      id: res.operator.id,
      mobileNumber: res.operator.mobileNumber,
      fullName: res.operator.fullName,
      dairyId: res.operator.dairyId,
      dairyName: (res.operator as any).dairyName || 'DFarm Dairy Cooperative',
      dairyCode: (res.operator as any).dairyCode || 'DFARM-01',
      role: (res.operator.role as any) || 'COLLECTION_OPERATOR',
      sessionToken: res.token,
    }

    setStoredOperatorAuth(res.token, res.operator.dairyId, op)
    return op
  },
}

// ============================================================================
// 2. Customer Directory & Lookup API (Dairy-Scoped)
// ============================================================================
export const customersApi = {
  list: async (params: { search?: string; category?: MilkCategory; limit?: number } = {}): Promise<CustomerIdentity[]> => {
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.append('search', params.search)
    if (params.category) searchParams.append('category', params.category)
    if (params.limit) searchParams.append('limit', String(params.limit))

    const queryString = searchParams.toString()
    const endpoint = `/customers${queryString ? `?${queryString}` : ''}`
    const res = await apiRequest<{ success: boolean; data: any[] }>(endpoint)

    return res.data.map((c: any) => ({
      id: c.id,
      customerCode: c.farmerCode || c.customerCode || '',
      farmerCode: c.farmerCode,
      fullName: c.fullName,
      mobileNumber: c.mobileNumber,
      village: c.village || '',
      preferredCategory: (c.permittedCategories?.[0] as MilkCategory) || 'COW',
      permittedCategories: c.permittedCategories || ['COW'],
      dairyId: c.organizationId,
      status: c.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      balanceDue: Number(c.balanceDue || 0),
      rfidCardUid: c.rfidCardUid,
      biometric: {
        templateVersion: 'v1.0',
        qualityScore: c.qualityScore || 95.0,
        modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
        consentVerified: true,
      },
      lastDelivery: c.lastDelivery,
    }))
  },

  getById: async (id: string): Promise<CustomerIdentity> => {
    const res = await apiRequest<{ success: boolean; data: any }>(`/customers/${id}`)
    const c = res.data
    return {
      id: c.id,
      customerCode: c.farmerCode || c.customerCode || '',
      farmerCode: c.farmerCode,
      fullName: c.fullName,
      mobileNumber: c.mobileNumber,
      village: c.village || '',
      preferredCategory: (c.permittedCategories?.[0] as MilkCategory) || 'COW',
      permittedCategories: c.permittedCategories || ['COW'],
      dairyId: c.organizationId,
      status: c.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      balanceDue: Number(c.balanceDue || 0),
      rfidCardUid: c.rfidCardUid,
      biometric: {
        templateVersion: 'v1.0',
        qualityScore: c.qualityScore || 95.0,
        modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
        consentVerified: true,
      },
      lastDelivery: c.lastDelivery,
    }
  },

  getByRfid: async (cardUid: string): Promise<CustomerIdentity | null> => {
    const customers = await customersApi.list()
    const target = customers.find((c) => c.rfidCardUid === cardUid)
    return target || null
  },
}

// ============================================================================
// 3. Biometric Face Templates & Matching API
// ============================================================================
export const identityApi = {
  getFaceTemplates: async (): Promise<any[]> => {
    const res = await apiRequest<{ success: boolean; data: any[] }>('/identity/face/templates')
    return res.data
  },

  matchFace: async (embedding: number[]): Promise<{
    isMatch: boolean
    matchedCustomer: CustomerIdentity | null
    similarity: number
    confidenceScore: number
  }> => {
    const res = await apiRequest<{
      success: boolean
      isMatch: boolean
      matchedCustomer: any | null
      similarity: number
      confidenceScore: number
    }>('/identity/face/match', {
      method: 'POST',
      body: JSON.stringify({ embedding }),
    })

    if (!res.isMatch || !res.matchedCustomer) {
      return {
        isMatch: false,
        matchedCustomer: null,
        similarity: res.similarity || 0,
        confidenceScore: res.confidenceScore || 0,
      }
    }

    const c = res.matchedCustomer
    return {
      isMatch: true,
      similarity: res.similarity,
      confidenceScore: res.confidenceScore,
      matchedCustomer: {
        id: c.id,
        customerCode: c.farmerCode || c.customerCode || '',
        farmerCode: c.farmerCode,
        fullName: c.fullName,
        mobileNumber: c.mobileNumber,
        village: c.village || '',
        preferredCategory: (c.permittedCategories?.[0] as MilkCategory) || 'COW',
        permittedCategories: c.permittedCategories || ['COW'],
        dairyId: c.organizationId,
        status: c.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        balanceDue: Number(c.balanceDue || 0),
        rfidCardUid: c.rfidCardUid,
        biometric: {
          templateVersion: 'v1.0',
          qualityScore: c.qualityScore || 95.0,
          modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
          consentVerified: true,
        },
        lastDelivery: c.lastDelivery,
      },
    }
  },
}

// ============================================================================
// 4. Shift Collection Sessions API
// ============================================================================
export const sessionsApi = {
  getActiveSession: async (deviceId = 'KIOSK_MAIN'): Promise<ActiveCollectionSession | null> => {
    try {
      const res = await apiRequest<{ success: boolean; data: any }>(
        `/collections/sessions/active?deviceId=${encodeURIComponent(deviceId)}`
      )
      const s = res.data
      return {
        id: s.id,
        sessionCode: s.sessionCode,
        dairyId: s.organizationId,
        date: s.businessDate,
        shift: s.shift as ShiftType,
        status: s.status as 'OPEN' | 'CLOSED',
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingOperatorName: s.openingOperatorName || 'Operator',
        closingOperatorName: s.closingOperatorName,
        deviceId: s.deviceIdentifier,
        deviceName: s.deviceName || 'Counter Kiosk',
        totals: {
          totalLiters: Number(s.totalLiters || 0),
          cowLiters: Number(s.cowLiters || 0),
          buffaloLiters: Number(s.buffaloLiters || 0),
          transactionCount: Number(s.transactionCount || 0),
          totalAmount: Number(s.totalAmount || 0),
          averageFat: Number(s.averageFat || 0),
          averageSnf: Number(s.averageSnf || 0),
        },
      }
    } catch {
      return null
    }
  },

  openSession: async (params: {
    shift?: ShiftType
    businessDate?: string
    deviceId?: string
    deviceName?: string
  } = {}): Promise<ActiveCollectionSession> => {
    const res = await apiRequest<{ success: boolean; data: any }>('/collections/sessions/open', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    const s = res.data
    return {
      id: s.id,
      sessionCode: s.sessionCode,
      dairyId: s.organizationId,
      date: s.businessDate,
      shift: s.shift as ShiftType,
      status: s.status as 'OPEN' | 'CLOSED',
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingOperatorName: s.openingOperatorName || 'Operator',
      closingOperatorName: s.closingOperatorName,
      deviceId: s.deviceIdentifier,
      deviceName: s.deviceName || 'Counter Kiosk',
      totals: {
        totalLiters: Number(s.totalLiters || 0),
        cowLiters: Number(s.cowLiters || 0),
        buffaloLiters: Number(s.buffaloLiters || 0),
        transactionCount: Number(s.transactionCount || 0),
        totalAmount: Number(s.totalAmount || 0),
        averageFat: Number(s.averageFat || 0),
        averageSnf: Number(s.averageSnf || 0),
      },
    }
  },

  closeSession: async (sessionCode: string): Promise<ActiveCollectionSession> => {
    const res = await apiRequest<{ success: boolean; data: any }>('/collections/sessions/close', {
      method: 'POST',
      body: JSON.stringify({ sessionCode }),
    })
    const s = res.data
    return {
      id: s.id,
      sessionCode: s.sessionCode,
      dairyId: s.organizationId,
      date: s.businessDate,
      shift: s.shift as ShiftType,
      status: s.status as 'OPEN' | 'CLOSED',
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingOperatorName: s.openingOperatorName || 'Operator',
      closingOperatorName: s.closingOperatorName,
      deviceId: s.deviceIdentifier,
      deviceName: s.deviceName || 'Counter Kiosk',
      totals: {
        totalLiters: Number(s.totalLiters || 0),
        cowLiters: Number(s.cowLiters || 0),
        buffaloLiters: Number(s.buffaloLiters || 0),
        transactionCount: Number(s.transactionCount || 0),
        totalAmount: Number(s.totalAmount || 0),
        averageFat: Number(s.averageFat || 0),
        averageSnf: Number(s.averageSnf || 0),
      },
    }
  },
}

// ============================================================================
// 5. Milk Intake Transactions API
// ============================================================================
export const transactionsApi = {
  submit: async (data: {
    sessionId: string
    sessionCode?: string
    customerId: string
    milkCategory: MilkCategory
    weightLiters: number
    fat: number
    snf: number
    clrDensity?: number
    identificationMethod: string
    operatorName?: string
    isOffline?: boolean
  }): Promise<CollectionTransaction> => {
    const res = await apiRequest<{
      success: boolean
      data: any
      receiptNumber: string
      customerBalanceAfter: number
    }>('/collections/transactions', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: data.sessionId,
        sessionCode: data.sessionCode,
        customerId: data.customerId,
        milkCategory: data.milkCategory,
        weightLiters: data.weightLiters,
        fatPercentage: data.fat,
        snfPercentage: data.snf,
        clrDensity: data.clrDensity,
        identificationMethod: data.identificationMethod,
        deviceId: 'KIOSK_MAIN',
        idempotencyKey: `TXN-${crypto.randomUUID()}`,
      }),
    })

    const t = res.data
    const txn: CollectionTransaction = {
      id: t.id,
      transactionCode: t.transactionCode || `TXN-${t.id.substring(0, 8).toUpperCase()}`,
      sessionId: t.sessionId,
      dairyId: t.dairyId,
      customerId: t.customerId,
      customerCode: t.customerCode || 'C-100',
      customerName: t.customerName || 'Farmer',
      timestamp: t.timestamp || new Date().toISOString(),
      date: t.date || new Date().toISOString().split('T')[0],
      shift: t.shift as ShiftType,
      milkCategory: t.milkCategory as MilkCategory,
      weightLiters: Number(t.weightLiters),
      fatPercentage: Number(t.fatPercentage),
      snfPercentage: Number(t.snfPercentage),
      clrDensity: Number(t.clrDensity || 28.0),
      appliedRatePerLiter: Number(t.appliedRatePerLiter),
      rateChartVersion: Number(t.rateChartVersion || 1),
      totalAmount: Number(t.totalAmount),
      identificationMethod: t.identificationMethod || 'FACE_YUNET_SFACE',
      syncStatus: 'SYNCED_CLOUD',
      deviceId: t.deviceId || 'KIOSK_MAIN',
      operatorName: t.operatorName || 'Operator',
    }

    // Persist to local client journal
    await localDB.saveTransaction(txn)
    return txn
  },

  getRecent: async (sessionId?: string): Promise<CollectionTransaction[]> => {
    if (!sessionId) {
      return localDB.getTransactions()
    }

    try {
      const res = await apiRequest<{ success: boolean; data: any[] }>(
        `/collections/transactions/recent?sessionId=${encodeURIComponent(sessionId)}`
      )
      if (res.data && res.data.length > 0) {
        return res.data.map((t: any) => ({
          id: t.id,
          transactionCode: t.transactionCode || `TXN-${t.id.substring(0, 8).toUpperCase()}`,
          sessionId: t.sessionId,
          dairyId: t.dairyId,
          customerId: t.customerId,
          customerCode: t.customerCode || 'C-100',
          customerName: t.customerName || 'Farmer',
          timestamp: t.timestamp || new Date().toISOString(),
          date: t.date || new Date().toISOString().split('T')[0],
          shift: t.shift as ShiftType,
          milkCategory: t.milkCategory as MilkCategory,
          weightLiters: Number(t.weightLiters),
          fatPercentage: Number(t.fatPercentage),
          snfPercentage: Number(t.snfPercentage),
          clrDensity: Number(t.clrDensity || 28.0),
          appliedRatePerLiter: Number(t.appliedRatePerLiter),
          rateChartVersion: Number(t.rateChartVersion || 1),
          totalAmount: Number(t.totalAmount),
          identificationMethod: t.identificationMethod || 'FACE_YUNET_SFACE',
          syncStatus: 'SYNCED_CLOUD',
          deviceId: t.deviceId || 'KIOSK_MAIN',
          operatorName: t.operatorName || 'Operator',
        }))
      }
    } catch {
      // Fall back to local DB
    }

    return localDB.getTransactions()
  },
}

// ============================================================================
// 6. Rate Calculation Formula (Standard Indian Cooperative Milk Matrix)
// ============================================================================
export const ratesApi = {
  calculateRate: (
    milkCategory: MilkCategory,
    fat: number,
    snf: number
  ): { ratePerLiter: number; version: number } => {
    let rate = 0
    if (milkCategory === 'COW') {
      // Base: 3.5% Fat, 8.5% SNF = Rs. 38.00/L
      // Formula: (Fat * 6.5) + (SNF * 2.8)
      rate = fat * 6.5 + snf * 2.8
    } else {
      // BUFFALO: Base: 6.0% Fat, 9.0% SNF = Rs. 58.00/L
      // Formula: (Fat * 7.2) + (SNF * 2.9)
      rate = fat * 7.2 + snf * 2.9
    }
    return {
      ratePerLiter: Number(Math.max(10.0, rate).toFixed(2)),
      version: 1,
    }
  },
}
