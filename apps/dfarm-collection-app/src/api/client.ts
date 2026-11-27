// DFarm Collection App — Real API Client & Tenant Headers
// Strictly scopes all network operations to authenticated dairy tenant

import type {
  OperatorSession,
  ActiveCollectionSession,
  CustomerIdentity,
  CollectionTransaction,
  MilkCategory,
  ShiftType,
  RateChartCacheItem,
  RateCalculationResult,
} from '@/types'
import type {
  BulkCollectionSyncRequestDTO,
  BulkCollectionSyncResponseDTO,
  BulkCollectionResultItemDTO,
} from '@dfarm/shared-types'
import { localDB, LocalCollectionDB } from '@/services/local-storage'
import { roundHalfUp } from '@/utils/rounding'
import { generateStationLoginProof } from '@/services/device-crypto'

const STORAGE_KEYS = {
  TOKEN: 'dfarm_collection_token',
  DAIRY_ID: 'dfarm_collection_dairy_id',
  OPERATOR: 'dfarm_collection_operator',
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

  // Local development fallback to Vite dev server proxy '/api/v1'
  if (import.meta.env.DEV) {
    return '/api/v1'
  }

  // In production, fallback to production backend instead of relative URL on frontend host
  return 'https://dfarm-backend.onrender.com/api/v1'
}

export const getStoredOperatorAuth = (): {
  token: string | null
  dairyId: string | null
  centerId: string | null
  centerCode: string | null
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
      centerId: operator?.centerId || null,
      centerCode: operator?.centerCode || null,
      operator,
      isAuthenticated: !!token && (!!operator || !!dairyId),
      dairyCode: operator?.dairyCode || null,
      operatorRole: operator?.role || operator?.operatorRole || null,
    }
  } catch {
    return {
      token: null,
      dairyId: null,
      centerId: null,
      centerCode: null,
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

async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { token, dairyId, centerId } = getStoredOperatorAuth()
  const { timeoutMs = 30000, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': crypto.randomUUID(),
    ...(fetchOptions.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (dairyId) {
    headers['X-Dairy-Id'] = dairyId
    headers['X-Dairy-Tenant-Id'] = dairyId
    headers['X-Organization-Id'] = dairyId
  }
  if (centerId) {
    headers['X-Center-Id'] = centerId
  }

  const baseUrl = getApiBaseUrl()
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${cleanEndpoint}`

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null

  let response: Response
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller?.signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const timeoutErr: any = new Error(`Request to ${cleanEndpoint} timed out after ${timeoutMs}ms`)
      timeoutErr.statusCode = 408
      timeoutErr.status = 408
      timeoutErr.code = 'REQUEST_TIMEOUT'
      throw timeoutErr
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!response.ok) {
    let errMessage = `HTTP ${response.status} ${response.statusText}`
    let errJson: any = null
    try {
      errJson = await response.json()
      errMessage =
        errJson.error?.message ||
        errJson.message ||
        (typeof errJson.error === 'string' ? errJson.error : errJson.error ? JSON.stringify(errJson.error) : errMessage)
    } catch {
      // Use status text
    }
    const err: any = new Error(errMessage)
    err.statusCode = response.status
    err.status = response.status
    err.retryAfter = response.headers?.get('Retry-After') || null
    if (errJson?.code) err.code = errJson.code
    if (errJson?.errorCode) err.errorCode = errJson.errorCode
    throw err
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
    let deviceProofBody: {
      deviceIdentifier?: string
      challenge?: string
      deviceProof?: string
    } = {}

    try {
      const baseUrl = getApiBaseUrl()
      const proofParams = await generateStationLoginProof(baseUrl)
      if (proofParams) {
        deviceProofBody = {
          deviceIdentifier: proofParams.deviceIdentifier,
          challenge: proofParams.challenge,
          deviceProof: proofParams.deviceProof,
        }
      }
    } catch (err: any) {
      console.warn('[authApi] Station device challenge proof bypassed or failed:', err.message)
    }

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
      body: JSON.stringify({ mobileNumber, otp, ...deviceProofBody }),
    })

    const op: OperatorSession = {
      id: res.operator.id,
      mobileNumber: res.operator.mobileNumber,
      fullName: res.operator.fullName,
      dairyId: res.operator.dairyId,
      centerId: res.operator.centerId,
      dairyName: (res.operator as any).dairyName || 'DFarm Dairy Cooperative',
      dairyCode: (res.operator as any).dairyCode || 'DFARM-01',
      centerCode: (res.operator as any).centerCode || undefined,
      role: (res.operator.role as any) || 'COLLECTION_OPERATOR',
      sessionToken: res.token,
    }

    setStoredOperatorAuth(res.token, res.operator.dairyId, op)
    return op
  },
}

// ============================================================================
// 2. Customer Directory & Lookup API (Dairy & Center Scoped)
// ============================================================================
export const customersApi = {
  list: async (params: { search?: string; category?: MilkCategory; limit?: number; organizationId?: string; centerId?: string } = {}): Promise<CustomerIdentity[]> => {
    const { dairyId, centerId: storedCenterId } = getStoredOperatorAuth()
    const targetOrgId = params.organizationId || dairyId
    const targetCenterId = params.centerId || storedCenterId
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.append('search', params.search)
    if (params.category) searchParams.append('category', params.category)
    if (params.limit) searchParams.append('limit', String(params.limit))
    if (targetOrgId) searchParams.append('organizationId', targetOrgId)
    if (targetCenterId) searchParams.append('centerId', targetCenterId)

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
      dairyId: c.organizationId || targetOrgId || undefined,
      centerId: c.centerId || targetCenterId || undefined,
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
      centerId: c.centerId || undefined,
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
    try {
      const normalizedUid = cardUid.trim().toUpperCase()
      const res = await apiRequest<{
        success: boolean
        data: {
          id: string
          farmerCode?: string
          customerCode?: string
          fullName: string
          status: string
          defaultMilkType?: string
          organizationId: string
          centerId: string
          canDeliver?: boolean
        }
      }>(`/rfid/lookup/${encodeURIComponent(normalizedUid)}`)

      if (!res.data) return null
      const c = res.data
      return {
        id: c.id,
        customerCode: c.farmerCode || c.customerCode || '',
        farmerCode: c.farmerCode,
        fullName: c.fullName,
        mobileNumber: '', // Minimal privacy projection
        village: '',
        preferredCategory: (c.defaultMilkType as MilkCategory) || 'COW',
        permittedCategories: [(c.defaultMilkType as MilkCategory) || 'COW'],
        dairyId: c.organizationId,
        centerId: c.centerId || undefined,
        status: (c.status as any) || 'ACTIVE',
        balanceDue: 0,
        rfidCardUid: normalizedUid,
        canDeliver: c.canDeliver !== false,
      } as CustomerIdentity
    } catch (err: any) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        return null
      }
      return null
    }
  },
}

// ============================================================================
// 3. Biometric Face Templates & Matching API
// ============================================================================
export const identityApi = {
  getFaceTemplates: async (organizationId?: string): Promise<any[]> => {
    const { dairyId } = getStoredOperatorAuth()
    const targetOrgId = organizationId || dairyId
    const query = targetOrgId ? `?organizationId=${encodeURIComponent(targetOrgId)}` : ''
    const res = await apiRequest<{ success: boolean; data: any[] }>(`/identity/face/templates${query}`)
    return res.data
  },

  matchFace: async (
    embedding: number[],
    organizationId?: string
  ): Promise<{
    isMatch: boolean
    matchedCustomer: CustomerIdentity | null
    similarity: number
    confidenceScore: number
  }> => {
    const { dairyId } = getStoredOperatorAuth()
    const targetOrgId = organizationId || dairyId
    const res = await apiRequest<{
      success: boolean
      matched?: boolean
      isMatch?: boolean
      matchedCustomer: any | null
      farmerId?: string
      farmerCode?: string
      farmerName?: string
      similarity?: number
      similarityScore?: number
      confidenceScore?: number
    }>('/identity/face/match', {
      method: 'POST',
      body: JSON.stringify({
        embedding,
        organizationId: targetOrgId,
        dairyId: targetOrgId,
      }),
    })

    const isMatch = Boolean(res.matched ?? res.isMatch ?? false)
    const similarity = Number(res.similarityScore ?? res.similarity ?? 0)
    const confidenceScore = Number(res.confidenceScore ?? 0)

    let matchedCustomer: CustomerIdentity | null = null
    const c = res.matchedCustomer

    if (c) {
      matchedCustomer = {
        id: c.id,
        customerCode: c.farmerCode || c.customerCode || '',
        farmerCode: c.farmerCode,
        fullName: c.fullName,
        mobileNumber: c.mobileNumber || '',
        village: c.village || '',
        preferredCategory: (c.permittedCategories?.[0] as MilkCategory) || 'COW',
        permittedCategories: c.permittedCategories || ['COW'],
        dairyId: c.organizationId || targetOrgId || '',
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
    } else if (isMatch && res.farmerId) {
      matchedCustomer = {
        id: res.farmerId,
        customerCode: res.farmerCode || '',
        farmerCode: res.farmerCode,
        fullName: res.farmerName || 'Matched Farmer',
        mobileNumber: '',
        village: '',
        preferredCategory: 'COW' as MilkCategory,
        permittedCategories: ['COW' as MilkCategory],
        dairyId: targetOrgId || '',
        status: 'ACTIVE',
        balanceDue: 0,
      } as CustomerIdentity
    }

    return {
      isMatch,
      matchedCustomer,
      similarity,
      confidenceScore,
    }
  },
}

// ============================================================================
// 4. Shift Collection Sessions API
// ============================================================================
export const sessionsApi = {
  getActiveSession: async (deviceId = 'KIOSK_MAIN', centerId?: string): Promise<ActiveCollectionSession | null> => {
    // Throws on network/HTTP error so caller can distinguish network failure vs confirmed no-session
    const { centerId: storedCenterId } = getStoredOperatorAuth()
    const targetCenter = centerId || storedCenterId
    let query = `deviceId=${encodeURIComponent(deviceId)}`
    if (targetCenter) query += `&centerId=${encodeURIComponent(targetCenter)}`

    const res = await apiRequest<{ success: boolean; data: any }>(
      `/collections/sessions/active?${query}`
    )
    const s = res.data
    if (!s) return null
    if (s.offlineAuthorization?.token) {
      await localDB.saveSessionOfflineAuth(s.id, s.offlineAuthorization)
    }
    return {
      id: s.id,
      sessionCode: s.sessionCode,
      dairyId: s.organizationId,
      centerId: s.centerId || targetCenter || undefined,
      date: s.businessDate,
      businessDate: s.businessDate,
      timezone: s.timezone || s.centerTimezone || undefined,
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
    if (s.offlineAuthorization?.token) {
      await localDB.saveSessionOfflineAuth(s.id, s.offlineAuthorization)
    }
    return {
      id: s.id,
      sessionCode: s.sessionCode,
      dairyId: s.organizationId,
      centerId: s.centerId || undefined,
      date: s.businessDate,
      businessDate: s.businessDate,
      timezone: s.timezone || s.centerTimezone || undefined,
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
      businessDate: s.businessDate,
      timezone: s.timezone || s.centerTimezone || undefined,
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

  reopenSession: async (sessionCode: string): Promise<ActiveCollectionSession> => {
    const res = await apiRequest<{ success: boolean; data: any }>('/collections/sessions/reopen', {
      method: 'POST',
      body: JSON.stringify({ sessionCode }),
    })
    const s = res.data
    if (s.offlineAuthorization?.token) {
      await localDB.saveSessionOfflineAuth(s.id, s.offlineAuthorization)
    }
    return {
      id: s.id,
      sessionCode: s.sessionCode,
      dairyId: s.organizationId,
      centerId: s.centerId || undefined,
      date: s.businessDate,
      businessDate: s.businessDate,
      timezone: s.timezone || s.centerTimezone || undefined,
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
    idempotencyKey?: string
    clientIntakeUuid?: string
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
        idempotencyKey: data.idempotencyKey || `TXN-${crypto.randomUUID()}`,
        clientIntakeUuid: data.clientIntakeUuid,
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

    // Server submission acknowledgement only. Do NOT insert second row into completed_transactions.
    // localDB.markTransactionSynced() remains the sole updater of the local canonical transaction row.
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
// 6. Dynamic Authoritative Rate Calculation & Download Engine
// ============================================================================
export const ratesApi = {
  /**
   * Calculates milk rate strictly based on the active rate chart cached in IndexedDB.
   * If no rate chart is cached or if the chart is expired, blocks calculation
   * with isValid: false and clear error message. Never falls back to hardcoded formulas.
   */
  calculateRate: (
    milkCategory: MilkCategory,
    fat: number,
    snf: number,
    chart?: RateChartCacheItem | null
  ): RateCalculationResult => {
    if (!chart) {
      return {
        ratePerLiter: 0,
        version: 0,
        isValid: false,
        error: `No active rate chart cached for ${milkCategory}. Connect to internet to download rate charts.`,
      }
    }

    if (!Number.isFinite(fat) || !Number.isFinite(snf)) {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `INVALID_FINANCIAL_VALUES: Fat and SNF must be valid finite numbers. Received Fat: ${fat}, SNF: ${snf}.`,
      }
    }

    if (chart.milkCategory !== milkCategory) {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `Rate chart category mismatch: chart is for ${chart.milkCategory}, but intake is ${milkCategory}.`,
      }
    }

    // Check expiration
    const today = new Date().toISOString().split('T')[0]
    if (chart.effectiveTo && chart.effectiveTo < today) {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `Rate chart for ${milkCategory} expired on ${chart.effectiveTo}. Connect to internet to download updated chart.`,
      }
    }

    // Check biological bounds
    const minFat = chart.minFat ?? 2.0
    const maxFat = chart.maxFat ?? 15.0
    const minSnf = chart.minSnf ?? 6.0
    const maxSnf = chart.maxSnf ?? 12.0

    if (fat < minFat || fat > maxFat) {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `Fat ${fat.toFixed(1)}% is outside allowed chart bounds (${minFat}% - ${maxFat}%).`,
      }
    }

    if (snf < minSnf || snf > maxSnf) {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `SNF ${snf.toFixed(1)}% is outside allowed chart bounds (${minSnf}% - ${maxSnf}%).`,
      }
    }

    // Model 1: Exact matrix grid lookup
    if (chart.pricingType === 'GRID' || (!chart.pricingType && chart.gridMatrix)) {
      if (chart.gridMatrix) {
        const fatKey = fat.toFixed(1)
        const snfKey = snf.toFixed(1)
        const matrixRate = chart.gridMatrix[fatKey]?.[snfKey]
        if (typeof matrixRate === 'number' && Number.isFinite(matrixRate) && matrixRate > 0) {
          return {
            ratePerLiter: roundHalfUp(matrixRate, 2),
            version: chart.version,
            isValid: true,
            rateChartId: chart.id,
          }
        }
        return {
          ratePerLiter: 0,
          version: chart.version,
          isValid: false,
          error: `RATE_CELL_NOT_FOUND: No configured rate cell in rate chart for ${milkCategory} at ${fatKey}% Fat and ${snfKey}% SNF.`,
        }
      }
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `RATE_CELL_NOT_FOUND: Grid matrix is unpopulated for ${milkCategory}.`,
      }
    }

    // Model 2: Total Solids Formula (Rate = Fat% * fatFactor + SNF% * snfFactor)
    if (chart.pricingType === 'TOTAL_SOLIDS_FORMULA') {
      const fatFactor = chart.ratePerFatUnit ?? chart.fatFactor
      const snfFactor = chart.ratePerSnfUnit ?? chart.snfFactor
      if (typeof fatFactor !== 'number' || !Number.isFinite(fatFactor) || typeof snfFactor !== 'number' || !Number.isFinite(snfFactor)) {
        return {
          ratePerLiter: 0,
          version: chart.version,
          isValid: false,
          error: `INVALID_FORMULA_DEFINITION: Total Solids formula requires valid numeric fatFactor and snfFactor.`,
        }
      }
      const roundedFat = Math.round(fat * 10) / 10
      const roundedSnf = Math.round(snf * 10) / 10
      const calculatedRate = (roundedFat * fatFactor) + (roundedSnf * snfFactor)
      const roundedRate = roundHalfUp(calculatedRate, 2)

      if (roundedRate <= 0) {
        return {
          ratePerLiter: 0,
          version: chart.version,
          isValid: false,
          error: `Calculated rate (${roundedRate}) is non-positive. Cannot accept intake.`,
        }
      }

      return {
        ratePerLiter: roundedRate,
        version: chart.version,
        isValid: true,
        rateChartId: chart.id,
      }
    }

    // Model 3: Two-Axis Formula (Base rate + Fat/SNF increments)
    const hasExplicitFactors =
      (typeof chart.ratePerFatUnit === 'number' && typeof chart.ratePerSnfUnit === 'number') ||
      (typeof chart.fatFactor === 'number' && typeof chart.snfFactor === 'number')

    if (
      chart.pricingType === 'TWO_AXIS_FORMULA' ||
      chart.pricingType === 'FORMULA' ||
      (typeof chart.baseRate === 'number' && chart.baseRate > 0 && hasExplicitFactors)
    ) {
      if (!hasExplicitFactors || typeof chart.baseRate !== 'number' || !Number.isFinite(chart.baseRate) || chart.baseRate <= 0) {
        return {
          ratePerLiter: 0,
          version: chart.version,
          isValid: false,
          error: `INVALID_FORMULA_DEFINITION: Two-axis formula requires positive baseRate and explicit fat/snf factors.`,
        }
      }

      const baseFat = typeof chart.baseFat === 'number' ? chart.baseFat : (milkCategory === 'COW' ? 3.5 : 6.0)
      const baseSnf = typeof chart.baseSnf === 'number' ? chart.baseSnf : (milkCategory === 'COW' ? 8.5 : 9.0)
      const fatFactor = chart.ratePerFatUnit ?? chart.fatFactor!
      const snfFactor = chart.ratePerSnfUnit ?? chart.snfFactor!

      const roundedFat = Math.round(fat * 10) / 10
      const roundedSnf = Math.round(snf * 10) / 10
      const fatDiff = roundedFat - baseFat
      const snfDiff = roundedSnf - baseSnf

      const calculatedRate = chart.baseRate + fatDiff * fatFactor + snfDiff * snfFactor
      const roundedRate = roundHalfUp(calculatedRate, 2)

      if (roundedRate <= 0) {
        return {
          ratePerLiter: 0,
          version: chart.version,
          isValid: false,
          error: `Calculated rate (${roundedRate}) is non-positive. Cannot accept intake.`,
        }
      }

      return {
        ratePerLiter: roundedRate,
        version: chart.version,
        isValid: true,
        rateChartId: chart.id,
      }
    }

    if (chart.pricingType && chart.pricingType !== 'GRID') {
      return {
        ratePerLiter: 0,
        version: chart.version,
        isValid: false,
        error: `UNSUPPORTED_PRICING_MODEL: Pricing model '${chart.pricingType}' is not supported for offline calculation.`,
      }
    }

    return {
      ratePerLiter: 0,
      version: chart.version,
      isValid: false,
      error: `Cached rate chart for ${milkCategory} has no active rate matrix cells or verified formula factors. Connect to internet to update rate chart.`,
    }
  },

  /**
   * Downloads active rate charts from backend when online and caches them in IndexedDB.
   * Calls canonical production endpoint: GET /api/v1/rates/sync
   * Supports conditional HTTP 304 ETag caching to avoid redundant bandwidth overhead.
   */
  downloadRateCharts: async (dairyId: string, centerId?: string): Promise<RateChartCacheItem[] | null> => {
    const scopeSuffix = `${dairyId.trim().toLowerCase()}_${(centerId || 'org_wide').trim().toLowerCase()}`
    const etagMetaKey = `rate_charts_etag_${scopeSuffix}`
    const verifiedMetaKey = `rate_charts_last_verified_at_${scopeSuffix}`
    const syncedMetaKey = `rate_charts_last_synced_at_${scopeSuffix}`

    try {
      const storedEtag = await localDB.getMetadata(etagMetaKey)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Request-Id': crypto.randomUUID(),
      }
      if (storedEtag) {
        headers['If-None-Match'] = storedEtag
      }

      const { token, dairyId: storedDairyId } = getStoredOperatorAuth()
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (dairyId || storedDairyId) headers['X-Dairy-Tenant-Id'] = dairyId || storedDairyId || ''
      if (dairyId || storedDairyId) headers['X-Organization-Id'] = dairyId || storedDairyId || ''
      const explicitScope: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC' = centerId ? 'CENTER_SPECIFIC' : 'ORGANIZATION_WIDE'
      headers['X-Rate-Scope'] = explicitScope
      if (centerId) headers['X-Center-Id'] = centerId

      const baseUrl = getApiBaseUrl()
      const queryParams = new URLSearchParams()
      queryParams.set('scope', explicitScope)
      if (centerId) queryParams.set('centerId', centerId)
      if (dairyId) queryParams.set('organizationId', dairyId)
      const qs = queryParams.toString() ? `?${queryParams.toString()}` : ''
      const url = `${baseUrl}/rates/sync${qs}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      let response: Response
      try {
        response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (response.status === 304) {
        console.info('[ratesApi] Rate charts unchanged (HTTP 304 Not Modified). Preserving verified cache.')
        await localDB.setMetadata(verifiedMetaKey, new Date().toISOString())
        const cowChart = await localDB.getRateChart(dairyId, 'COW', centerId)
        const bufChart = await localDB.getRateChart(dairyId, 'BUFFALO', centerId)
        return [cowChart, bufChart].filter(Boolean) as RateChartCacheItem[]
      }

      if (response.ok) {
        const etag = response.headers?.get('ETag')
        if (etag) {
          await localDB.setMetadata(etagMetaKey, etag)
        }

        const res = await response.json()
        const responseOrgId = res.data?.organizationId
        if (responseOrgId && String(responseOrgId).trim().toLowerCase() !== dairyId.trim().toLowerCase()) {
          throw new Error(`[ratesApi] Cross-tenant rate sync mismatch: expected ${dairyId}, received ${responseOrgId}`)
        }

        const rawCharts = res.data?.charts || (Array.isArray(res.data) ? res.data : [])
        if (Array.isArray(rawCharts) && rawCharts.length > 0) {
          const items: RateChartCacheItem[] = rawCharts.map((c: any) => {
            if (c.organizationId && String(c.organizationId).trim().toLowerCase() !== dairyId.trim().toLowerCase()) {
              throw new Error(`[ratesApi] Cross-tenant chart DTO rejected: chart=${c.chartId || c.id}`)
            }

            let explicitScope: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC'
            let chartCenterId: string | null = null

            if (c.centerScope === 'ORGANIZATION_WIDE') {
              if (c.centerId && String(c.centerId).trim() !== '') {
                throw new Error(
                  `[ratesApi] Invalid ORGANIZATION_WIDE chart declares non-empty centerId (${c.centerId}). Chart: ${c.chartId || c.id}`
                )
              }
              explicitScope = 'ORGANIZATION_WIDE'
              chartCenterId = null
            } else if (c.centerScope === 'CENTER_SPECIFIC') {
              if (!c.centerId || !String(c.centerId).trim()) {
                throw new Error(
                  `[ratesApi] CENTER_SPECIFIC chart missing centerId. Chart: ${c.chartId || c.id}`
                )
              }
              if (centerId && String(c.centerId).trim().toLowerCase() !== centerId.trim().toLowerCase()) {
                throw new Error(
                  `[ratesApi] Cross-centre chart mismatch: requested ${centerId}, received ${c.centerId}. Chart: ${c.chartId || c.id}`
                )
              }
              explicitScope = 'CENTER_SPECIFIC'
              chartCenterId = String(c.centerId).trim()
            } else {
              throw new Error(
                `[ratesApi] Rate chart missing explicit discriminated centerScope ('ORGANIZATION_WIDE' | 'CENTER_SPECIFIC'). Missing centerId never implies organization-wide. Chart: ${c.chartId || c.id}`
              )
            }

            const vNum = Number(c.versionNumber || c.version || 1)
            const cId = c.chartId || c.id || `${dairyId}_${c.milkCategory}`
            const vId = c.versionId || `v${vNum}`

            return {
              id: LocalCollectionDB.buildRateChartCacheKey({
                dairyId,
                milkCategory: c.milkCategory,
                centerScope: explicitScope,
                centerId: chartCenterId,
                chartId: cId,
                versionId: vId,
                versionNumber: vNum,
              }),
              dairyId,
              centerId: chartCenterId,
              chartId: cId,
              versionId: vId,
              versionNumber: vNum,
              centerScope: explicitScope,
              isOrganizationWide: explicitScope === 'ORGANIZATION_WIDE',
              milkCategory: c.milkCategory,
              pricingType: c.pricingType || (c.gridMatrix || c.cells ? 'GRID' : 'TWO_AXIS_FORMULA'),
              version: vNum,
              effectiveFrom: c.effectiveFrom || new Date().toISOString().split('T')[0],
              effectiveTo: c.effectiveTo,
              baseFat: typeof c.baseFat === 'number' ? c.baseFat : (c.milkCategory === 'COW' ? 3.5 : 6.0),
              baseSnf: typeof c.baseSnf === 'number' ? c.baseSnf : (c.milkCategory === 'COW' ? 8.5 : 9.0),
              baseRate: typeof c.baseRate === 'number' ? c.baseRate : Number(c.baseRatePerLiter || 0),
              fatMin: typeof c.fatMin === 'number' ? c.fatMin : undefined,
              fatMax: typeof c.fatMax === 'number' ? c.fatMax : undefined,
              snfMin: typeof c.snfMin === 'number' ? c.snfMin : undefined,
              snfMax: typeof c.snfMax === 'number' ? c.snfMax : undefined,
              ratePerFatUnit:
                typeof c.ratePerFatUnit === 'number'
                  ? c.ratePerFatUnit
                  : typeof c.fatFactor === 'number'
                  ? c.fatFactor
                  : undefined,
              ratePerSnfUnit:
                typeof c.ratePerSnfUnit === 'number'
                  ? c.ratePerSnfUnit
                  : typeof c.snfFactor === 'number'
                  ? c.snfFactor
                  : undefined,
              fatFactor:
                typeof c.fatFactor === 'number'
                  ? c.fatFactor
                  : typeof c.ratePerFatUnit === 'number'
                  ? c.ratePerFatUnit
                  : undefined,
              snfFactor:
                typeof c.snfFactor === 'number'
                  ? c.snfFactor
                  : typeof c.ratePerSnfUnit === 'number'
                  ? c.ratePerSnfUnit
                  : undefined,
              gridMatrix: c.gridMatrix || undefined,
              cells: c.cells || undefined,
              etag: etag || undefined,
              updatedAt: new Date().toISOString(),
            }
          })

          for (const item of items) {
            await localDB.saveRateChart(item)
          }
          await localDB.setMetadata(syncedMetaKey, new Date().toISOString())
          await localDB.setMetadata(verifiedMetaKey, new Date().toISOString())
          return items
        }
      }
    } catch (err) {
      console.warn('[ratesApi] Failed to download rate charts from server:', err)
    }
    return []
  },
}

// ============================================================================
// 7. Authoritative Collections & Bulk Synchronization API
// ============================================================================
export const collectionsApi = {
  /**
   * Submits a bounded batch of milk collections to the authoritative backend bulk sync endpoint.
   * Endpoint: POST /api/v1/collections/sync/bulk
   */
  bulkSync: async (
    payload: BulkCollectionSyncRequestDTO
  ): Promise<BulkCollectionSyncResponseDTO> => {
    return apiRequest<BulkCollectionSyncResponseDTO>('/collections/sync/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

export const syncApi = {
  bulkSync: async (
    payload: BulkCollectionSyncRequestDTO
  ): Promise<BulkCollectionSyncResponseDTO> => {
    return collectionsApi.bulkSync(payload)
  },

  pushBatch: async (batch: {
    deviceId?: string
    transactions: Array<{
      clientIntakeUuid: string
      sessionCode?: string
      customerId: string
      milkCategory: 'COW' | 'BUFFALO'
      weightLiters: number
      fatPercentage: number
      snfPercentage: number
      clrDensity?: number
      identificationMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH'
      idempotencyKey?: string
    }>
  }): Promise<{
    total: number
    succeeded: number
    failed: number
    items: Array<{
      clientIntakeUuid: string
      success: boolean
      error?: string
      transactionId?: string
      receiptNumber?: string
      isIdempotentReplay?: boolean
    }>
  }> => {
    const res = await apiRequest<{ success: boolean; data: any }>('/sync/transactions', {
      method: 'POST',
      body: JSON.stringify(batch),
    })
    return res.data
  },
}
