import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayInput } from '@/components/ui/ClayInput'
import { ShieldCheck, Phone, KeyRound, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [step, setStep] = useState<'mobile' | 'otp'>('mobile')
  const [mobile, setMobile] = useState('7755995615')
  const [otp, setOtp] = useState('')
  const [requestId, setRequestId] = useState('')
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfoMessage(null)
    setIsLoading(true)

    try {
      const res = await apiClient.requestOtp({ mobile })
      setRequestId(res.requestId)
      setDevOtpHint(res.devOtpHint || null)
      setInfoMessage(res.message)
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await login(mobile, otp, requestId)
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid verification code')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#FFF5EE] relative overflow-hidden select-none">
      {/* Decorative Clay Ambient Gradients */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#FFE9DC]/60 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-[#FFE9DC]/70 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Login Card Container */}
      <div className="w-full max-w-md relative z-10">
        <ClayCard variant="default" padding="lg" className="border border-[#F1E7E0] shadow-xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-[#F1E7E0]">
            <BrandLogo size="lg" showPlatformBadge={true} className="mb-3" />
            <h1 className="text-xl font-black text-[#211B18] tracking-tight">
              Platform Super Admin
            </h1>
            <p className="text-xs text-[#817A75] mt-1">
              Secure Central Administration for Multi-Dairy Tenants
            </p>
          </div>

          {/* Security Alert Badge */}
          <div className="my-5 p-3 rounded-xl bg-[#FAF2EC] border border-[#F1E7E0] flex items-start gap-2.5 text-xs text-[#817A75]">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            <span>
              <strong>Restricted Gateway:</strong> Public registration is strictly disabled. Only provisioned platform administrators may request authentication OTPs.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Info/Success Message */}
          {infoMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Step 1: Mobile Form */}
          {step === 'mobile' && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <ClayInput
                label="Provisioned Mobile Number"
                type="tel"
                placeholder="e.g. 7755995615"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                leftIcon={<Phone className="w-4 h-4" />}
                helperText="Enter your registered 10-digit platform super admin mobile number"
                required
                autoFocus
              />

              <ClayButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isLoading}
              >
                Send Verification OTP
              </ClayButton>
            </form>
          )}

          {/* Step 2: OTP Verification Form */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[#817A75] px-1">
                <span>Code dispatched to: <strong>+91 {mobile}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('mobile')
                    setOtp('')
                    setError(null)
                  }}
                  className="text-[#FF6A00] font-bold hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              <ClayInput
                label="6-Digit Verification Code"
                type="text"
                placeholder="• • • • • •"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                leftIcon={<KeyRound className="w-4 h-4" />}
                required
                autoFocus
              />

              {devOtpHint && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                  <span>Development OTP Code: <strong className="font-mono">{devOtpHint}</strong></span>
                  <button
                    type="button"
                    onClick={() => setOtp(devOtpHint)}
                    className="px-2 py-1 rounded bg-amber-200/80 hover:bg-amber-300 font-bold text-[10px] cursor-pointer"
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <ClayButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isLoading}
              >
                Verify & Open Console
              </ClayButton>
            </form>
          )}

          {/* Super Administrator Authority Banner */}
          <div className="mt-6 pt-4 border-t border-[#F1E7E0] text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#817A75]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Platform Super Administrator</span>
            </div>
            <p className="text-[11px] text-[#817A75] mt-1">
              Authorized Authority: <strong className="text-[#211B18]">Pankaj Popat Yewale</strong> • <code className="font-mono text-[#211B18] font-bold">+91 77559 95615</code>
            </p>
          </div>
        </ClayCard>
      </div>
    </div>
  )
}
