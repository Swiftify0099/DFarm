export type SupportScope = 'read_only_diagnostics' | 'sync_repair' | 'config_audit'
export type SupportSessionStatus = 'active' | 'expired' | 'revoked'

export interface SupportSession {
  id: string
  dairyId: string
  dairyName: string
  dairyCode: string
  requestedBy: string
  requestedByMobile: string
  justificationReason: string
  supportTicketRef?: string
  authorizedScope: SupportScope
  startedAt: string
  expiresAt: string
  status: SupportSessionStatus
  revokedAt?: string
  revokedBy?: string
  revocationReason?: string
}

export interface RequestSupportSessionPayload {
  dairyId: string
  justificationReason: string
  supportTicketRef?: string
  durationMinutes: 15 | 30 | 60
  authorizedScope: SupportScope
}

export interface RevokeSupportSessionPayload {
  sessionId: string
  reason: string
}
