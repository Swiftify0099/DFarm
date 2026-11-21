export type DairyStatus = 'draft_onboarding' | 'active' | 'suspended'

export interface DairyLocation {
  addressLine1: string
  addressLine2?: string
  district: string
  state: string
  pincode: string
  latitude?: number
  longitude?: number
  formattedAddress?: string
  placeId?: string
  villageLocality?: string
}

export interface DairyContact {
  businessEmail?: string
  businessPhone: string
  alternatePhone?: string
}

export interface DairyOperationalReadiness {
  businessProfileComplete: boolean
  primaryAdminActivated: boolean
  hardwareSynced: boolean
  collectionStaffTrained: boolean
  readinessScore: number // 0 to 100%
}

export interface DairyDeviceSummary {
  registeredDevicesCount: number
  onlineDevicesCount: number
  lastHeartbeatAt?: string
  firmwareVersionsSummary: string
}

export type SyncHealthStatus = 'healthy' | 'degraded' | 'failing'

export interface DairySyncHealth {
  status: SyncHealthStatus
  lastSyncAt: string
  pendingSyncEventsCount: number
  averageLatencyMs: number
  errorCountLast24h: number
}

export interface DairyConfig {
  timezone: string
  locale: string
  allowSelfRegistration: boolean
  offlineSyncGracePeriodHours: number
  featureFlags: {
    automaticFatTestingIntegration: boolean
    smsAlertsEnabled: boolean
    chillingCenterSync: boolean
  }
}

export interface DairyTenant {
  id: string
  code: string // e.g. DF-BLR-0042
  name: string
  status: DairyStatus
  databaseName?: string
  provisioningStatus?: string
  provisioningError?: string
  primaryAdminId: string
  primaryAdminName: string
  primaryAdminMobile: string
  location: DairyLocation
  contact: DairyContact
  createdAt: string
  updatedAt: string
  activatedAt?: string
  suspendedAt?: string
  suspensionReason?: string
  operationalReadiness: DairyOperationalReadiness
  deviceSummary: DairyDeviceSummary
  syncHealth: DairySyncHealth
  configuration: DairyConfig
}

export interface CreateDairyPayload {
  name: string
  businessPhone: string
  businessEmail: string
  addressLine1: string
  district: string
  state: string
  pincode: string
  latitude?: number
  longitude?: number
  formattedAddress?: string
  placeId?: string
  villageLocality?: string
  primaryAdminName: string
  primaryAdminMobile: string
  timezone?: string
}

export interface SuspendDairyPayload {
  dairyId: string
  reason: string
}

export interface ReactivateDairyPayload {
  dairyId: string
  reason?: string
}

export interface UpdateDairyConfigPayload {
  dairyId: string
  configuration: Partial<DairyConfig>
}
