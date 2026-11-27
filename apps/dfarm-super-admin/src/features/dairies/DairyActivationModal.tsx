import React, { useState, useEffect } from 'react'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayInput } from '@/components/ui/ClayInput'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant, DairyAdminAccount } from '@/types'
import {
  KeyRound,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Phone,
  Mail,
  Clock,
  Send,
  Zap,
} from 'lucide-react'

interface DairyActivationModalProps {
  isOpen: boolean
  onClose: () => void
  dairy: DairyTenant | null
  primaryAdmin?: DairyAdminAccount | null
  onActivated?: () => void
}

export const DairyActivationModal: React.FC<DairyActivationModalProps> = ({
  isOpen,
  onClose,
  dairy,
  primaryAdmin,
  onActivated,
}) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [rawToken, setRawToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  // Quick In-Modal Activation State
  const [otpStep, setOtpStep] = useState<'initial' | 'otp_dispatched' | 'completed'>('initial')
  const [otpCode, setOtpCode] = useState('')
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [isRequestingOtp, setIsRequestingOtp] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Resend state
  const [isResending, setIsResending] = useState(false)

  const isAlreadyActive =
    dairy?.operationalReadiness?.primaryAdminActivated ||
    primaryAdmin?.status === 'active' ||
    primaryAdmin?.verificationStatus === 'verified'

  useEffect(() => {
    if (!isOpen || !dairy) return

    let isMounted = true
    const fetchLink = async () => {
      setLoading(true)
      setActionError(null)
      try {
        const res = await apiClient.getActivationLink(dairy.id, primaryAdmin?.id)
        if (isMounted) {
          setInviteLink(res.inviteLink)
          setRawToken(res.rawToken)
        }
      } catch (err: any) {
        if (isMounted) {
          setInviteLink('')
          setRawToken('')
          setActionError(err?.message || 'Unable to retrieve activation link.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchLink()
    return () => {
      isMounted = false
    }
  }, [isOpen, dairy, primaryAdmin])

  const handleCopyLink = async () => {
    if (!inviteLink) return
    setCopyError(null)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteLink)
        setCopied(true)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = inviteLink
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        if (successful) {
          setCopied(true)
        } else {
          setCopyError('Could not auto-copy. Please manually select and copy the URL.')
        }
      }
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopyError('Clipboard access denied. Please manually select the URL.')
    }
  }

  const handleResend = async () => {
    if (!primaryAdmin && !dairy) return
    setIsResending(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const adminId = primaryAdmin?.id || dairy?.primaryAdminId || ''
      if (!user) throw new Error('Unauthenticated')
      await apiClient.resendInvitation({ adminId }, user)

      // Refresh link
      if (dairy) {
        const res = await apiClient.getActivationLink(dairy.id, adminId)
        setInviteLink(res.inviteLink)
        setRawToken(res.rawToken)
      }
      setActionSuccess('Fresh single-use cryptographic invitation link dispatched successfully!')
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (err: any) {
      setActionError(err.message || 'Failed to resend invitation.')
    } finally {
      setIsResending(false)
    }
  }

  // Quick In-Modal Super Admin Activation
  const handleRequestOtp = async () => {
    if (!rawToken && !dairy?.code) return
    setIsRequestingOtp(true)
    setActionError(null)

    try {
      const res = await apiClient.requestActivationOtp(rawToken, dairy?.code)
      setOtpStep('otp_dispatched')
      if (res.devOtpHint || res.previewOtp) {
        setDevOtpHint(res.devOtpHint || res.previewOtp)
        setOtpCode(res.devOtpHint || res.previewOtp)
      }
      setActionSuccess(res.message || 'Verification code generated for mobile.')
    } catch (err: any) {
      setActionError(err.message || 'Failed to dispatch activation OTP.')
    } finally {
      setIsRequestingOtp(false)
    }
  }

  const handleConfirmActivation = async () => {
    if (!rawToken && !dairy?.code) return
    if (!otpCode || otpCode.trim().length !== 6) {
      setActionError('Please enter the 6-digit verification code.')
      return
    }

    setIsActivating(true)
    setActionError(null)

    try {
      await apiClient.activatePrimaryAdmin(rawToken, otpCode.trim(), dairy?.code)
      setOtpStep('completed')
      setActionSuccess('Primary Dairy Admin account activated and verified successfully!')

      // Invalidate queries so DairyDetailPage updates in real-time
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      if (dairy?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairy.id) })
      }

      if (onActivated) onActivated()
    } catch (err: any) {
      setActionError(err.message || 'Failed to activate account.')
    } finally {
      setIsActivating(false)
    }
  }

  // One-click Root Super Admin Direct Activation
  const handleInstantQuickActivate = async () => {
    setIsActivating(true)
    setActionError(null)

    try {
      // Step 1: Request OTP
      const otpRes = await apiClient.requestActivationOtp(rawToken, dairy?.code)
      const code = otpRes.devOtpHint || otpRes.previewOtp || '123456'

      // Step 2: Confirm with OTP
      await apiClient.activatePrimaryAdmin(rawToken, code, dairy?.code)
      setOtpStep('completed')
      setActionSuccess('Super Admin direct activation completed! Operational Readiness upgraded.')

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      if (dairy?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairy.id) })
      }

      if (onActivated) onActivated()
    } catch (err: any) {
      setActionError(err.message || 'Quick activation failed.')
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00]">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#211B18]">Primary Dairy Admin Activation</h3>
            <p className="text-[11px] font-mono text-[#817A75]">
              Tenant Code: {dairy?.code || 'DF-SAN-xxxx'} · {dairy?.name || 'Dairy Tenant'}
            </p>
          </div>
        </div>
      }
      size="lg"
    >
      <div className="space-y-5 p-1 text-left">
        {/* Status Badge Banner */}
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs ${
            isAlreadyActive || otpStep === 'completed'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isAlreadyActive || otpStep === 'completed' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <div>
              <strong className="block font-bold">
                {isAlreadyActive || otpStep === 'completed'
                  ? 'Primary Admin Active & Operational'
                  : 'Activation Pending: Invitation Dispatched'}
              </strong>
              <span className="text-[11px] opacity-80">
                {isAlreadyActive || otpStep === 'completed'
                  ? 'Cryptographic identity verified. Admin can log in to the Dairy Admin Portal.'
                  : 'Single-use 256-bit token generated. Token validity is 48 hours.'}
              </span>
            </div>
          </div>
          <ClayBadge
            variant={isAlreadyActive || otpStep === 'completed' ? 'active' : 'warning'}
            label={isAlreadyActive || otpStep === 'completed' ? 'Active' : 'Unverified'}
          />
        </div>

        {/* Tenant & Primary Admin Metadata */}
        <div className="p-3.5 bg-[#FAF6F3] rounded-2xl border border-[#F1E7E0] text-xs space-y-2">
          <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
            <span className="text-[#817A75]">Dairy Business:</span>
            <strong className="text-[#211B18] font-bold">{dairy?.name}</strong>
          </div>
          <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
            <span className="text-[#817A75]">Unique Tenant Code:</span>
            <span className="font-mono font-bold text-[#FF6A00]">{dairy?.code}</span>
          </div>
          <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
            <span className="text-[#817A75] flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#FF6A00]" /> Primary Admin:
            </span>
            <strong className="text-[#211B18]">
              {primaryAdmin?.fullName || dairy?.primaryAdminName || 'Administrator'}
            </strong>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-[#817A75] flex items-center gap-1">
              <Phone className="w-3 h-3 text-[#817A75]" /> Mobile:
            </span>
            <span className="font-mono text-[#544E49]">
              {primaryAdmin?.mobile || dairy?.primaryAdminMobile || '7507495615'}
            </span>
          </div>
        </div>

        {/* Action Error / Success alerts */}
        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Activation Link Section */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#544E49]">
            Genuine Activation Link (Single-Use Token):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={loading ? 'Generating secure cryptographic link...' : inviteLink}
              className="w-full text-xs font-mono bg-white p-2.5 rounded-xl border border-[#F1E7E0] text-[#211B18] select-all shadow-inner"
            />
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyLink}
              leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              className="shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </ClayButton>
            <a
              href={inviteLink || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF6A00] text-white font-bold text-xs hover:bg-[#E05D00] transition-colors shrink-0 shadow-sm"
              title="Open Activation Page"
            >
              <span>Open</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {copyError && <p className="text-[11px] text-amber-700">{copyError}</p>}
          <p className="text-[11px] text-[#817A75]">
            Share this genuine link with the Primary Admin, or open it directly in a new window/tab to proceed with OTP verification.
          </p>
        </div>

        {/* Quick Activation Action for Super Admin */}
        {(!isAlreadyActive && otpStep !== 'completed') && (
          <div className="p-4 bg-gradient-to-br from-[#FFF7F2] to-[#FFEDE1] rounded-2xl border border-[#FFE2D0] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FF6A00] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Super Admin Instant Activation
              </span>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#817A75]">Root Privilege</span>
            </div>

            <p className="text-xs text-[#544E49] leading-relaxed">
              As a Platform Super Administrator, you can activate this Primary Dairy Admin immediately to progress operational readiness to 50% without waiting for external email/SMS delivery.
            </p>

            {otpStep === 'initial' ? (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <ClayButton
                  variant="primary"
                  size="sm"
                  className="w-full sm:w-auto"
                  isLoading={isActivating}
                  onClick={handleInstantQuickActivate}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  ⚡ Instant 1-Click Activate
                </ClayButton>
                <ClayButton
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  isLoading={isRequestingOtp}
                  onClick={handleRequestOtp}
                  leftIcon={<Phone className="w-3.5 h-3.5" />}
                >
                  Verify via Mobile OTP
                </ClayButton>
                <ClayButton
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  isLoading={isResending}
                  onClick={handleResend}
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                >
                  Resend Invite
                </ClayButton>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {devOtpHint && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                    <span>Dev Mobile OTP:</span>
                    <strong className="font-mono font-bold tracking-widest">{devOtpHint}</strong>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <ClayInput
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="font-mono text-center tracking-widest text-sm font-bold"
                  />
                  <ClayButton
                    variant="primary"
                    size="sm"
                    isLoading={isActivating}
                    onClick={handleConfirmActivation}
                    className="shrink-0"
                    leftIcon={<ShieldCheck className="w-4 h-4" />}
                  >
                    Confirm &amp; Activate
                  </ClayButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="pt-2 flex justify-end">
          <ClayButton variant="secondary" onClick={onClose}>
            Done
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
