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

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    timestamp: string
  }
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  timestamp: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface DashboardMetrics {
  totalDairies: number
  activeDairies: number
  suspendedDairies: number
  pendingOnboardingDairies: number
  totalPrimaryAdmins: number
  adminsAwaitingActivation: number
  totalRegisteredHardwareUnits: number
  platformSyncHealthStatus: 'healthy' | 'degraded' | 'failing'
  openAlertsCount: number
  criticalAlertsCount: number
}

export interface GlobalAnalytics {
  monthlyOnboardingTrend: Array<{
    month: string
    newDairies: number
    activatedDairies: number
  }>
  geographicDistribution: Array<{
    state: string
    count: number
    activeCount: number
  }>
  syncLatencyTrend: Array<{
    time: string
    averageLatencyMs: number
    healthyNodesPct: number
  }>
}

export interface DairyListQuery {
  search?: string
  status?: string
  state?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface AdminListQuery {
  search?: string
  dairyId?: string
  status?: string
  verificationStatus?: string
  page?: number
  pageSize?: number
}
