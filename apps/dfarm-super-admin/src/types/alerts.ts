export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type AlertCategory = 'security' | 'sync' | 'onboarding' | 'lifecycle' | 'hardware' | 'infrastructure'

export interface PlatformAlert {
  id: string
  title: string
  message: string
  severity: AlertSeverity
  status: AlertStatus
  category: AlertCategory
  dairyId?: string
  dairyName?: string
  createdAt: string
  acknowledgedAt?: string
  acknowledgedBy?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionNotes?: string
  auditReferenceId?: string
}

export interface AcknowledgeAlertPayload {
  alertId: string
  notes?: string
}

export interface ResolveAlertPayload {
  alertId: string
  resolutionNotes: string
}
