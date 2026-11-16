import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { DfarmLogo } from '@/assets/illustrations'
import { ClayCard, ClayButton, ClayInput, ClayAlert, ClayBadge } from '@/components/ui'
import { api } from '@/api'
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  UserCheck,
  Mail,
  Phone,
  ArrowRight,
  Lock,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'

export const ActivationPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token') || ''
  const legacyCode = searchParams.get('code') || ''
  const dairyCode = searchParams.get('dairyCode') || ''

  const [isLoading, setIsLoading] = useState(true)
  const [errorState, setErrorState] = useState<{
    code: string
    message: string
  } | null>(null)

  const [invitationData, setInvitationData] = useState<{
    dairyId: string
    dairyName: string
    dairyCode: string
    adminId: string
    adminName: string
    maskedEmail: string
    maskedMobile: string
    expiresAt: string
  } | null>(null)

  // OTP State
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [previewOtp, setPreviewOtp] = useState<string | null>(null)
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null)

  // Activation Submit State
  const [isActivating, setIsActivating] = useState(false)
  const [activationSuccess, setActivationSuccess] = useState(false)

  // 1. Initial Token Validation on Mount
  useEffect(() => {
    let isMounted = true

    async function validateToken() {
      if (!token && !legacyCode && !dairyCode) {
        if (isMounted) {
          setErrorState({
            code: 'INVALID_TOKEN',
            message: 'This activation link is invalid or unavailable. No activation token was provided.',
          })
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      setErrorState(null)

      try {
        const effectiveToken = token || legacyCode || dairyCode
        const res = await api.activation.validateToken(effectiveToken)

        if (!isMounted) return

        const activeData = res.data || res.invitation
        if (res.code === 'VALID' && activeData) {
          setInvitationData(activeData)
        } else if (res.code === 'ALREADY_CONSUMED') {
          setErrorState({
            code: 'ALREADY_CONSUMED',
            message: 'This Primary Dairy Admin account has already been activated.',
          })
        } else if (res.code === 'INVITATION_REVOKED') {
          setErrorState({
            code: 'INVITATION_REVOKED',
            message: 'This activation invitation has been revoked. A newer invitation may have been dispatched by the Super Admin.',
          })
        } else if (res.code === 'EXPIRED') {
          setErrorState({
            code: 'EXPIRED',
            message: 'This activation invitation has expired. Please contact the Super Admin for a fresh invitation.',
          })
        } else {
          setErrorState({
            code: res.code || 'INVALID_TOKEN',
            message: res.error || 'This activation link is invalid or unavailable.',
          })
        }
      } catch (err: any) {
        if (!isMounted) return
        setErrorState({
          code: 'NETWORK_ERROR',
          message: err.message || 'Failed to connect to the activation server. Please check your network and retry.',
        })
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    validateToken()
    return () => {
      isMounted = false
    }
  }, [token, legacyCode, dairyCode])

  // 2. Request Mobile OTP
  const handleRequestOtp = async () => {
    const effectiveToken = token || legacyCode || dairyCode
    setOtpError(null)
    setOtpSuccessMessage(null)
    setOtpSending(true)

    try {
      const res = await api.activation.requestOtp(effectiveToken)
      setOtpSent(true)
      setOtpSuccessMessage(res.message || 'Verification code dispatched to your registered mobile number via SMS.')
      if (res.previewOtp) {
        setPreviewOtp(res.previewOtp)
        setOtpCode(res.previewOtp)
      }
    } catch (err: any) {
      setOtpError(err.message || 'Failed to dispatch verification code.')
    } finally {
      setOtpSending(false)
    }
  }

  // 3. Confirm & Complete Activation
  const handleCompleteActivation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Please enter the 6-digit verification code sent to your mobile.')
      return
    }

    const effectiveToken = token || legacyCode || dairyCode
    setIsActivating(true)
    setOtpError(null)

    try {
      await api.activation.activate(effectiveToken, otpCode.trim())
      setActivationSuccess(true)
    } catch (err: any) {
      setOtpError(err.message || 'Activation failed. Please check the OTP code and retry.')
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF5EE] flex flex-col justify-center items-center p-4 sm:p-6 text-center">
      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center">
        <DfarmLogo size={60} className="mb-2" />
        <h1 className="text-2xl sm:text-3xl font-black text-[#211B18] tracking-tight">
          DFarm Dairy Platform
        </h1>
        <p className="text-xs sm:text-sm text-[#817A75] mt-0.5 font-medium">
          Primary Dairy Administrator Secure Invitation &amp; Activation
        </p>
      </div>

      {/* Main Claymorphic Card Container */}
      <ClayCard className="w-full max-w-lg !p-6 sm:!p-8 border-[#F1E7E0] shadow-xl text-left">
        {/* State A: Loading Verification */}
        {isLoading && (
          <div className="py-12 text-center space-y-4">
            <div className="w-12 h-12 border-3 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <h3 className="text-base font-bold text-[#211B18]">Verifying Activation Token...</h3>
              <p className="text-xs text-[#817A75] mt-1">
                Validating cryptographic authenticity and expiry timestamp.
              </p>
            </div>
          </div>
        )}

        {/* State B: Error / Inactive States */}
        {!isLoading && errorState && !activationSuccess && (
          <div className="py-4 space-y-5 text-center">
            <div
              className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto shadow-sm ${
                errorState.code === 'ALREADY_CONSUMED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {errorState.code === 'ALREADY_CONSUMED' ? (
                <CheckCircle2 className="w-8 h-8" />
              ) : (
                <AlertTriangle className="w-8 h-8" />
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#211B18]">
                {errorState.code === 'ALREADY_CONSUMED'
                  ? 'Account Already Activated'
                  : errorState.code === 'EXPIRED'
                    ? 'Activation Invitation Expired'
                    : errorState.code === 'INVITATION_REVOKED'
                      ? 'Invitation Link Revoked'
                      : 'Invalid Activation Link'}
              </h2>
              <p className="text-xs text-[#817A75] mt-1.5 max-w-md mx-auto leading-relaxed">
                {errorState.message}
              </p>
            </div>

            {errorState.code === 'ALREADY_CONSUMED' ? (
              <div className="pt-2">
                <ClayButton
                  variant="primary"
                  className="w-full"
                  onClick={() => navigate('/login')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Proceed to Dairy Admin Login
                </ClayButton>
              </div>
            ) : (
              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <ClayButton
                  variant="secondary"
                  onClick={() => window.location.reload()}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Retry Validation
                </ClayButton>
                <ClayButton
                  variant="secondary"
                  onClick={() => navigate('/login')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Go to Login
                </ClayButton>
              </div>
            )}
          </div>
        )}

        {/* State C: Valid Invitation — Complete Activation Form */}
        {!isLoading && !errorState && invitationData && !activationSuccess && (
          <div className="space-y-5">
            {/* Header */}
            <div className="border-b border-[#F1E7E0] pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#FF6A00] uppercase tracking-wider">
                  Verified Invitation
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFE9DC] text-[#C2410C] font-mono text-xs font-bold border border-[#FDBA74]">
                  {invitationData.dairyCode}
                </span>
              </div>
              <h2 className="text-lg font-black text-[#211B18] mt-1">
                {invitationData.dairyName}
              </h2>
              <p className="text-xs text-[#817A75] mt-0.5">
                Complete mobile verification to claim root administrator ownership.
              </p>
            </div>

            {/* Inset Credentials Summary */}
            <div className="p-4 rounded-2xl bg-[#FFF7F2] border border-[#FFE6D6] space-y-2.5 text-xs">
              <div className="flex justify-between items-center border-b border-[#F5E5DA] pb-1.5">
                <span className="text-[#817A75] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#FF6A00]" /> Primary Admin:
                </span>
                <strong className="text-[#211B18]">{invitationData.adminName}</strong>
              </div>
              <div className="flex justify-between items-center border-b border-[#F5E5DA] pb-1.5">
                <span className="text-[#817A75] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#FF6A00]" /> Registered Email:
                </span>
                <strong className="text-[#211B18] font-mono">{invitationData.maskedEmail}</strong>
              </div>
              <div className="flex justify-between items-center border-b border-[#F5E5DA] pb-1.5">
                <span className="text-[#817A75] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#FF6A00]" /> Registered Mobile:
                </span>
                <strong className="text-[#211B18] font-mono">{invitationData.maskedMobile}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#817A75] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#FF6A00]" /> Token Validity:
                </span>
                <span className="text-emerald-700 font-bold">Active (48 Hours)</span>
              </div>
            </div>

            {/* Alerts */}
            {otpError && <ClayAlert type="danger" message={otpError} className="mb-2" />}
            {otpSuccessMessage && !otpError && (
              <ClayAlert type="success" message={otpSuccessMessage} className="mb-2" />
            )}

            {/* Dev Preview OTP Box */}
            {previewOtp && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold">Test/Preview Verification OTP:</span>{' '}
                <code className="bg-amber-100 px-2 py-0.5 rounded font-mono font-bold text-amber-950">
                  {previewOtp}
                </code>
              </div>
            )}

            {/* Step: Request or Enter OTP */}
            {!otpSent ? (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-[#615953] leading-relaxed">
                  For tenant security, click below to dispatch a genuine 6-digit verification code (OTP) via SMS to your registered mobile number ({invitationData.maskedMobile}).
                </p>
                <ClayButton
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  isLoading={otpSending}
                  onClick={handleRequestOtp}
                  rightIcon={<Phone className="w-4 h-4" />}
                >
                  Send Verification Code to Mobile
                </ClayButton>
              </div>
            ) : (
              <form onSubmit={handleCompleteActivation} className="space-y-4 pt-1">
                <div>
                  <ClayInput
                    label="Enter 6-Digit Mobile Verification Code"
                    placeholder="e.g. 123456"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    leftIcon={<Lock className="w-4 h-4" />}
                    required
                  />
                  <p className="text-xs text-[#817A75] mt-1">
                    Check SMS sent to {invitationData.maskedMobile}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={otpSending}
                    className="text-[#FF6A00] font-bold hover:underline cursor-pointer"
                  >
                    Resend Code
                  </button>
                  <span className="text-[#817A75]">Valid for 5 minutes</span>
                </div>

                <ClayButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-2"
                  isLoading={isActivating}
                  rightIcon={<ShieldCheck className="w-5 h-5" />}
                >
                  Confirm &amp; Activate Primary Admin Account
                </ClayButton>
              </form>
            )}
          </div>
        )}

        {/* State D: Activation Success View */}
        {activationSuccess && (
          <div className="py-4 space-y-5 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h2 className="text-xl font-black text-[#211B18]">
                Account Activated Successfully!
              </h2>
              <p className="text-xs text-[#817A75] mt-1 max-w-sm mx-auto">
                Your Primary Dairy Admin identity has been securely bound to{' '}
                <strong>{invitationData?.dairyName}</strong>.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-emerald-200 text-left text-xs space-y-2 text-emerald-950">
              <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                <span className="text-emerald-800">Dairy Business:</span>
                <strong className="text-emerald-950">{invitationData?.dairyName}</strong>
              </div>
              <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                <span className="text-emerald-800">Tenant Code:</span>
                <span className="font-mono font-bold text-emerald-900">{invitationData?.dairyCode}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                <span className="text-emerald-800">Primary Administrator:</span>
                <strong className="text-emerald-950">{invitationData?.adminName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-800">Account State:</span>
                <strong className="text-emerald-700">Active &amp; Verified</strong>
              </div>
            </div>

            <ClayButton
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => navigate('/login')}
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              Go to Dairy Admin Login
            </ClayButton>
          </div>
        )}
      </ClayCard>
    </div>
  )
}
