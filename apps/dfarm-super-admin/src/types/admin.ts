export type AdminAccountStatus = 'active' | 'pending_verification' | 'disabled'
export type AdminVerificationStatus = 'unverified' | 'verified'

export interface DairyAdminAccount {
  id: string
  dairyId: string
  dairyName: string
  dairyCode: string
  fullName: string
  mobile: string
  email?: string
  status: AdminAccountStatus
  verificationStatus: AdminVerificationStatus
  createdAt: string
  activatedAt?: string
  lastLoginAt?: string
  invitationSentAt?: string
  invitationExpiresAt?: string
  invitationCodePreview?: string // Obfuscated or test representation
  invitationChannel: 'sms' | 'email' | 'whatsapp'
}

export interface AdminInvitation {
  invitationId: string
  dairyId: string
  adminId: string
  mobile: string
  sentAt: string
  expiresAt: string
  status: 'sent' | 'delivered' | 'accepted' | 'expired'
  inviteLink: string
}

export interface PrimaryAdminTransferRequest {
  id: string
  dairyId: string
  dairyName: string
  previousAdminId: string
  previousAdminName: string
  newAdminName: string
  newAdminMobile: string
  newAdminEmail?: string
  transferReason: string
  status: 'pending' | 'completed' | 'rejected'
  requestedBy: string
  requestedAt: string
  completedAt?: string
}

export interface ProvisionAdminPayload {
  dairyId: string
  fullName: string
  mobile: string
  email?: string
}

export interface ResendInvitationPayload {
  adminId: string
  channel?: 'sms' | 'email' | 'whatsapp'
}

export interface TransferAdminPayload {
  dairyId: string
  currentAdminId: string
  newAdminName: string
  newAdminMobile: string
  newAdminEmail?: string
  transferReason: string
  confirmationText: string // "CONFIRM TRANSFER"
}
