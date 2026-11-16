import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { DfarmLogo } from '@/assets/illustrations'
import { ClayCard, ClayButton, ClayInput, ClayAlert } from '@/components/ui'
import { Phone, Shield, ArrowRight, CheckCircle2, Lock } from 'lucide-react'

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const { sendOtp, loginWithOtp } = useAuth()

  const [step, setStep] = useState<'MOBILE' | 'OTP'>('MOBILE')
  const [mobileNumber, setMobileNumber] = useState('7755995615')
  const [otpCode, setOtpCode] = useState('')
  const [dispatchedOtpPreview, setDispatchedOtpPreview] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!/^\d{10}$/.test(mobileNumber)) {
      setError('Please enter a valid 10-digit mobile number')
      return
    }

    setIsLoading(true)
    try {
      const res = await sendOtp(mobileNumber)
      setSuccessMsg(res.message)
      if (res.previewOtp) {
        setDispatchedOtpPreview(res.previewOtp)
        setOtpCode(res.previewOtp)
      } else {
        setDispatchedOtpPreview(null)
        setOtpCode('')
      }
      setStep('OTP')
      setCountdown(60)
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch OTP')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit verification code')
      return
    }

    setIsLoading(true)
    try {
      await loginWithOtp(mobileNumber, otpCode)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Verification failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF5EE] flex flex-col justify-center items-center p-4 sm:p-6 text-center">
      {/* Brand header */}
      <div className="mb-6 flex flex-col items-center">
        <DfarmLogo size={64} className="mb-3" />
        <h1 className="text-2xl sm:text-3xl font-black text-[#211B18] tracking-tight">
          DFarm Dairy Admin
        </h1>
        <p className="text-xs sm:text-sm text-[#817A75] mt-1 font-medium">
          Authorized Individual Dairy Business Management Portal
        </p>
      </div>

      {/* Claymorphic Login Card */}
      <ClayCard className="w-full max-w-md !p-6 sm:!p-8 border-[#F1E7E0] shadow-xl text-left">
        <div className="mb-5 pb-4 border-b border-[#F1E7E0]">
          <h2 className="text-lg font-bold text-[#211B18]">
            {step === 'MOBILE' ? 'Operator Sign In' : 'Enter Verification Code'}
          </h2>
          <p className="text-xs text-[#817A75] mt-1">
            {step === 'MOBILE'
              ? 'Enter your registered mobile number provisioned by Super Admin'
              : `Enter the 6-digit OTP code sent to +91 ${mobileNumber}`}
          </p>
        </div>

        {error && (
          <ClayAlert type="danger" message={error} className="mb-4" />
        )}

        {successMsg && !error && (
          <ClayAlert type="success" message={successMsg} className="mb-4" />
        )}

        {/* Development Helper Preview */}
        {dispatchedOtpPreview && step === 'OTP' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <span className="font-bold">Authoritative OTP Dispatched:</span>{' '}
            <code className="bg-amber-100 px-2 py-0.5 rounded font-mono font-bold text-amber-950">
              {dispatchedOtpPreview}
            </code>
          </div>
        )}

        {step === 'MOBILE' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <ClayInput
              label="Registered Mobile Number"
              placeholder="e.g. 7755995615"
              type="tel"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
              leftIcon={<Phone size={18} />}
              hint="Authorized Primary Admin: Pankaj Popat Yewale (+91 7755995615)"
              required
            />

            <ClayButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
              rightIcon={<ArrowRight size={18} />}
            >
              Send Authentication OTP
            </ClayButton>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <ClayInput
              label="6-Digit OTP Code"
              placeholder="123456"
              type="text"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              leftIcon={<Lock size={18} />}
              required
            />

            <ClayButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
              rightIcon={<CheckCircle2 size={18} />}
            >
              Verify OTP & Access Dairy
            </ClayButton>

            <div className="flex items-center justify-between pt-3 text-xs text-[#817A75]">
              <button
                type="button"
                onClick={() => setStep('MOBILE')}
                className="hover:text-[#211B18] underline font-semibold cursor-pointer"
              >
                Change Mobile Number
              </button>

              <button
                type="button"
                onClick={handleSendOtp}
                disabled={countdown > 0}
                className="hover:text-[#FF6A00] font-semibold cursor-pointer disabled:opacity-50"
              >
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        {/* Security badge */}
        <div className="mt-6 pt-4 border-t border-[#F1E7E0] flex items-center justify-center gap-2 text-[11px] text-[#817A75]">
          <Shield size={14} className="text-[#FF6A00]" />
          <span>One-Primary-Admin-Per-Dairy Enforced</span>
        </div>
      </ClayCard>
    </div>
  )
}
