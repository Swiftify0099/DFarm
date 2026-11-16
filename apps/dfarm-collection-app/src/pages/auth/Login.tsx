import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ClayCard, ClayButton, ClayInput } from '@/components/ui'
import { DfarmCollectionLogo } from '@/assets/illustrations'
import { Phone, KeyRound, ShieldCheck, ArrowRight, UserCheck } from 'lucide-react'

export const Login: React.FC = () => {
  const { requestOtp, loginWithOtp } = useAuth()
  const navigate = useNavigate()

  const [mobileNumber, setMobileNumber] = useState('7755995615')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE')
  const [previewOtp, setPreviewOtp] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    try {
      const res = await requestOtp(mobileNumber)
      setPreviewOtp(res.previewOtp)
      setStep('OTP')
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch OTP')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    try {
      await loginWithOtp(mobileNumber, otpCode)
      navigate('/collection')
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid verification code')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-block">
            <DfarmCollectionLogo size={64} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            DFarm Collection Kiosk
          </h1>
          <p className="text-xs text-text-muted">
            Gokul Dairy Farmers Cooperative • Terminal DF-KIOSK-001
          </p>
        </div>

        {/* Auth Clay Card */}
        <ClayCard className="p-6 bg-cream shadow-xl border border-border-subtle">
          {step === 'PHONE' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                  Operator Mobile Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted text-xs font-semibold">
                    +91
                  </div>
                  <ClayInput
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    className="pl-12 font-mono text-sm tracking-wider"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-1.5">
                  Authorized mobile number registered with Dairy Admin.
                </p>
              </div>

              {/* Authorized Operator Authority Banner */}
              <div className="pt-2">
                <div className="p-3 rounded-xl border border-border-subtle bg-peach/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-text-primary">Pankaj Popat Yewale</span>
                    <span className="text-text-muted block text-[10px]">+91 7755995615 • Super Administrator / Primary Operator</span>
                  </div>
                  <UserCheck className="w-4 h-4 text-primary-orange" />
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {errorMessage}
                </div>
              )}

              <ClayButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={isLoading || mobileNumber.length !== 10}
                className="w-full mt-4 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <span>Requesting OTP...</span>
                ) : (
                  <>
                    <span>Request OTP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </ClayButton>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center pb-2">
                <span className="text-xs text-text-muted">Enter verification code sent to:</span>
                <p className="text-sm font-bold font-mono text-text-primary">+91 {mobileNumber}</p>
              </div>

              {/* Real Greenfield Preview OTP Banner */}
              {previewOtp && (
                <div className="p-3 bg-orange-50 border border-primary-orange/40 rounded-xl text-center space-y-1">
                  <span className="text-[11px] font-bold uppercase text-primary-orange tracking-wider">
                    Greenfield Development OTP:
                  </span>
                  <div
                    onClick={() => setOtpCode(previewOtp)}
                    className="text-2xl font-mono font-bold text-primary-orange tracking-widest cursor-pointer hover:scale-105 transition-transform"
                    title="Click to auto-fill OTP"
                  >
                    {previewOtp}
                  </div>
                  <span className="text-[10px] text-text-muted">(Click code to auto-populate)</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                  6-Digit OTP Code
                </label>
                <ClayInput
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  leftIcon={<KeyRound className="w-4 h-4 text-text-muted" />}
                  className="text-center font-mono text-xl tracking-widest"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <ClayButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isLoading || otpCode.length !== 6}
                  className="w-full flex items-center justify-center space-x-2"
                >
                  {isLoading ? <span>Verifying...</span> : <span>Unlock Terminal</span>}
                </ClayButton>

                <ClayButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('PHONE')}
                  className="w-full text-xs text-text-muted"
                >
                  Change Mobile Number
                </ClayButton>
              </div>
            </form>
          )}
        </ClayCard>

        {/* Security badge footer */}
        <div className="flex items-center justify-center space-x-2 text-xs text-text-muted">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Tenant Isolated: Gokul Dairy (dairy-ten-9801)</span>
        </div>
      </div>
    </div>
  )
}
