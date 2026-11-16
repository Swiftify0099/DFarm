export type AuditActionType =
  | 'dairy.created'
  | 'dairy.updated'
  | 'dairy.activated'
  | 'dairy.suspended'
  | 'dairy.reactivated'
  | 'dairy.config_updated'
  | 'admin.provisioned'
  | 'admin.invitation_sent'
  | 'admin.activated'
  | 'admin.disabled'
  | 'admin.reactivated'
  | 'admin.transferred'
  | 'admin.removed'
  | 'support.access_granted'
  | 'support.access_revoked'
  | 'support.access_expired'
  | 'alert.acknowledged'
  | 'alert.resolved'
  | 'auth.login_success'
  | 'auth.logout'
  | 'auth.session_expired'

export type AuditTargetType = 'dairy' | 'admin' | 'platform' | 'support_session' | 'alert' | 'system'

export interface AuditLogEntry {
  id: string
  actorId: string
  actorName: string
  actorMobile: string
  action: AuditActionType
  actionDescription: string
  targetType: AuditTargetType
  targetId: string
  targetName?: string
  dairyId?: string
  dairyName?: string
  outcome: 'success' | 'failed'
  reason?: string
  metadata?: Record<string, unknown>
  ipAddress: string
  userAgent: string
  timestamp: string
}

export interface AuditLogFilter {
  dairyId?: string
  actorId?: string
  action?: AuditActionType
  targetType?: AuditTargetType
  startDate?: string
  endDate?: string
  search?: string
}
