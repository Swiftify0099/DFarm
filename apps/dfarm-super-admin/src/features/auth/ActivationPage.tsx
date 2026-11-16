import React, { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayInput } from '@/components/ui/ClayInput'
import {
  ShieldCheck,
  Building2,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

type ActivationStatus = 'validating' | 'valid' | 'invalid' | 'expired' | 'consumed' | 'revoked'

interface InvitationDetails {
  dairyId: string
  dairyName: string
  dairyCode: string
  adminId: string
  adminName: string
  maskedEmail: string
  maskedMobile: string
  expiresAt: string
}

export const ActivationPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const legacyCode = searchParams.get('code') || ''
  const dairyCode = searchParams.get('dairyCode') || ''

  const [status, setStatus] = useState<ActivationStatus>('validating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)

  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)

  const [isActivating, setIsActivating] = useState(false)
  const [activationSuccess, setActivationSuccess] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const dairyAdminPortalUrl =
    (import.meta as any).env?.VITE_DAIRY_ADMIN_URL ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? `http://localhost:${window.location.port === '5174' ? '5173' : '5174'}/login`
      : 'https://dairy.dfarm.in/login')

  useEffect(() => {
    let isMounted = true
    const validate = async () => {
      setStatus('validating')
      setErrorMessage(null)

      const effectiveToken = token || legacyCode

      if (!effectiveToken && !dairyCode) {
        setStatus('invalid')
        setErrorMessage(
          'No activation token found in URL. Please copy and paste the complete genuine activation link from your onboarding email.',
        )
        return
      }

      try {
        const res = await apiClient.validateActivationToken(effectiveToken, dairyCode)
        if (!isMounted) return

        if (res.code === 'VALID' && res.data) {
          setStatus('valid')
          setInvitation(res.data)
        } else if (res.code === 'EXPIRED') {
          setStatus('expired')
          setErrorMessage(
            res.error ||
              'This activation invitation has expired (validity: 48 hours). Please contact your Super Administrator to issue a fresh invitation.',
          )
        } else if (res.code === 'ALREADY_CONSUMED') {
          setStatus('consumed')
          setErrorMessage(
            res.error ||
              'This activation invitation has already been used. Your Primary Admin account is active. Please proceed to the Dairy Admin Login portal.',
          )
        } else if (res.code === 'INVITATION_REVOKED') {
          setStatus('revoked')
          setErrorMessage(
            res.error ||
              'This invitation link was revoked because a newer invitation was generated. Please use the most recent activation email sent to your address.',
          )
        } else {
          setStatus('invalid')
          setErrorMessage(
            res.error ||
              'The activation token is invalid or unrecognized. Please ensure you copied the complete link without truncation.',
          )
        }
      } catch (err: any) {
        if (!isMounted) return
        setStatus('invalid')
        setErrorMessage(err.message || 'Unable to connect to the activation server. Please try again.')
      }
    }

    validate()
    return () => {
      isMounted = false
    }
  }, [token, legacyCode, dairyCode])

  const handleRequestOtp = async () => {
    const effectiveToken = token || legacyCode
    if (!effectiveToken && !dairyCode) return

    setOtpSending(true)
    setErrorMessage(null)

    try {
      const res = await apiClient.requestActivationOtp(effectiveToken, dairyCode)
      setOtpSent(true)
      setOtpSuccessMessage(res.message || 'Verification code dispatched to your registered mobile number.')
      if (res.devOtpHint || res.previewOtp) {
        setDevOtpHint(res.devOtpHint || res.previewOtp)
        setOtpCode(res.devOtpHint || res.previewOtp)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch activation OTP. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveToken = token || legacyCode
    if (!effectiveToken && !dairyCode) return

    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code sent to your mobile.')
      return
    }

    setIsActivating(true)
    setErrorMessage(null)

    try {
      await apiClient.activatePrimaryAdmin(effectiveToken, otpCode.trim(), dairyCode)
      setActivationSuccess(true)
    } catch (err: any) {
      setErrorMessage(err.message || 'Account activation failed. Please check the OTP and try again.')
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F2EE] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <BrandLogo size="lg" className="justify-center mb-3" />
          <p className="text-xs font-semibold tracking-wider text-[#817A75] uppercase">
            Primary Dairy Administrator Onboarding
          </p>
        </div>

        {/* 1. Validating State */}
        {status === 'validating' && (
          <ClayCard variant="default" className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] animate-spin">
              <RefreshCw className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-[#211B18]">Verifying Activation Invitation</h2>
            <p className="text-sm text-[#817A75]">
              Validating high-entropy cryptographic token and verifying tenant onboarding status...
            </p>
          </ClayCard>
        )}

        {/* 2. Success State */}
        {activationSuccess && (
          <ClayCard variant="default" className="p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <ClayBadge variant="active" label="Account Activated Successfully" />
              <h2 className="text-2xl font-black text-[#211B18]">Welcome to DFarm Platform</h2>
              <p className="text-sm text-[#817A75] max-w-sm mx-auto">
                Your Primary Dairy Administrator account is now active and authorized. You have full operational control of{' '}
                <strong>{invitation?.dairyName || 'your Dairy Tenant'}</strong>.
              </p>
            </div>

            <div className="p-4 bg-[#FAF6F3] rounded-2xl border border-[#F1E7E0] text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#817A75]">Dairy Business:</span>
                <strong className="text-[#211B18]">{invitation?.dairyName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#817A75]">Dairy Code:</span>
                <strong className="text-[#FF6A00] font-mono">{invitation?.dairyCode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#817A75]">Primary Admin:</span>
                <strong className="text-[#211B18]">{invitation?.adminName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#817A75]">Operational Readiness:</span>
                <strong className="text-emerald-700">50% (Admin Activated)</strong>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              {invitation?.dairyId && (
                <Link
                  to={`/dairies/${invitation.dairyId}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white border border-[#F1E7E0] text-[#211B18] font-bold text-xs hover:bg-[#FAF6F3] transition-colors"
                >
                  Return to Dairy Details
                </Link>
              )}
              <a
                href={dairyAdminPortalUrl}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-[#FF6A00] text-white font-bold text-xs shadow-[0_4px_16px_rgba(255,106,0,0.35)] hover:bg-[#E05D00] transition-all"
              >
                Proceed to Dairy Admin Login
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </ClayCard>
        )}

        {/* 3. Valid State (Verification & Activation Form) */}
        {status === 'valid' && !activationSuccess && (
          <ClayCard variant="default" className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF6A00]/10 text-[#FF6A00] text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Genuine Invitation Verified</span>
              </div>
              <h2 className="text-2xl font-black text-[#211B18]">Activate Dairy Admin Account</h2>
              <p className="text-xs text-[#817A75]">
                Complete two-factor activation for your Dairy tenant to start operations.
              </p>
            </div>

            {/* Tenant and Admin Metadata Card */}
            <div className="p-4 bg-[#FAF6F3] rounded-2xl border border-[#F1E7E0] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#EBE3DE] flex items-center justify-center text-[#FF6A00] shadow-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#211B18]">{invitation?.dairyName}</h3>
                  <p className="text-xs font-mono text-[#817A75]">Code: {invitation?.dairyCode}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-[#EBE3DE] grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-[#544E49]">
                  <Mail className="w-3.5 h-3.5 text-[#817A75]" />
                  <span className="truncate">{invitation?.maskedEmail}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#544E49]">
                  <Phone className="w-3.5 h-3.5 text-[#817A75]" />
                  <span>{invitation?.maskedMobile}</span>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {otpSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{otpSuccessMessage}</span>
              </div>
            )}

            {/* Dev OTP Hint */}
            {devOtpHint && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center justify-between">
                <span>Dev OTP Preview:</span>
                <span className="font-mono font-bold tracking-widest">{devOtpHint}</span>
              </div>
            )}

            {/* OTP Verification Flow */}
            <form onSubmit={handleActivateAccount} className="space-y-4">
              {!otpSent ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#817A75]">
                    For compliance and tenant security, an OTP will be dispatched to your registered mobile (
                    {invitation?.maskedMobile}).
                  </p>
                  <ClayButton
                    type="button"
                    variant="primary"
                    className="w-full"
                    onClick={handleRequestOtp}
                    isLoading={otpSending}
                  >
                    Send Verification OTP
                  </ClayButton>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#544E49] mb-1.5">
                      Enter 6-Digit Mobile Verification Code
                    </label>
                    <ClayInput
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="text-center text-xl tracking-widest font-mono font-bold"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="confirm-admin"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-[#EBE3DE] text-[#FF6A00] focus:ring-[#FF6A00]"
                    />
                    <label htmlFor="confirm-admin" className="text-xs text-[#544E49] leading-snug">
                      I confirm that I am the designated Primary Dairy Administrator for{' '}
                      <strong>{invitation?.dairyName}</strong> and accept platform operating policies.
                    </label>
                  </div>

                  <ClayButton
                    type="submit"
                    variant="primary"
                    className="w-full"
                    isLoading={isActivating}
                    disabled={otpCode.length !== 6 || !confirmed}
                  >
                    Confirm & Activate Dairy Admin Account
                  </ClayButton>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={otpSending}
                      className="text-xs text-[#FF6A00] hover:underline font-semibold"
                    >
                      Resend Verification Code
                    </button>
                  </div>
                </div>
              )}
            </form>
          </ClayCard>
        )}

        {/* 4. Error / Expired / Consumed States */}
        {(status === 'expired' ||
          status === 'consumed' ||
          status === 'revoked' ||
          status === 'invalid') &&
          !activationSuccess && (
            <ClayCard variant="default" className="p-8 text-center space-y-5">
              <div
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
                  status === 'consumed'
                    ? 'bg-blue-100 text-blue-600'
                    : status === 'expired'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-rose-100 text-rose-600'
                }`}
              >
                {status === 'consumed' ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : status === 'expired' ? (
                  <Clock className="w-7 h-7" />
                ) : (
                  <AlertCircle className="w-7 h-7" />
                )}
              </div>

              <div className="space-y-2">
                <ClayBadge
                  variant={
                    status === 'consumed'
                      ? 'info'
                      : status === 'expired'
                        ? 'warning'
                        : 'suspended'
                  }
                  label={
                    status === 'consumed'
                      ? 'Account Already Active'
                      : status === 'expired'
                        ? 'Invitation Expired'
                        : status === 'revoked'
                          ? 'Invitation Revoked'
                          : 'Invalid Activation Link'
                  }
                />
                <h2 className="text-xl font-black text-[#211B18]">
                  {status === 'consumed'
                    ? 'Invitation Already Used'
                    : status === 'expired'
                      ? 'Activation Window Passed (48h)'
                      : status === 'revoked'
                        ? 'Superseded Invitation Link'
                        : 'Activation Link Unrecognized'}
                </h2>
                <p className="text-sm text-[#817A75] max-w-sm mx-auto leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {status === 'consumed' ? (
                  <a
                    href={dairyAdminPortalUrl}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FF6A00] text-white font-bold text-sm shadow hover:bg-[#E05D00] transition-colors"
                  >
                    Go to Dairy Admin Login
                    <ArrowRight className="w-4 h-4" />
                  </a>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[#817A75]">
                      Please reach out to your DFarm Super Administrator to issue a new activation email.
                    </p>
                    <Link
                      to="/login"
                      className="inline-block text-xs text-[#FF6A00] font-semibold hover:underline"
                    >
                      Return to DFarm Portal
                    </Link>
                  </div>
                )}
              </div>
            </ClayCard>
          )}

        {/* Footer Security Note */}
        <div className="mt-8 text-center text-xs text-[#817A75] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Protected by DFarm Zero-Trust Architecture & 256-Bit Cryptography</span>
        </div>
      </div>
    </div>
  )
}
export default ActivationPage
