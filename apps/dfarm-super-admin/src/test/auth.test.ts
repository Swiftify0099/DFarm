import { describe, it, expect, beforeEach } from 'vitest'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Super Admin Authentication & Session Security', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('allows authorized provisioned Super Admin mobile to request OTP', async () => {
    const res = await mockBackend.requestOtp({ mobile: '7755995615' })
    expect(res.success).toBe(true)
    expect(res.requestId).toBeDefined()
    expect(res.expiresInSeconds).toBe(300)
    expect(res.devOtpHint).toBeDefined()
  })

  it('rejects unauthorized public mobile numbers from requesting Super Admin OTP', async () => {
    await expect(
      mockBackend.requestOtp({ mobile: '9999911111' })
    ).rejects.toThrow(/Access Denied/i)
  })

  it('rejects invalid or malformed mobile numbers', async () => {
    await expect(
      mockBackend.requestOtp({ mobile: '123' })
    ).rejects.toThrow(/valid 10-digit/i)
  })

  it('verifies valid OTP and provisions secure 8-hour session token', async () => {
    const otpRes = await mockBackend.requestOtp({ mobile: '7755995615' })
    const session = await mockBackend.verifyOtp({
      mobile: '7755995615',
      otp: otpRes.devOtpHint!,
      requestId: otpRes.requestId,
    })

    expect(session.token).toBeDefined()
    expect(session.user.mobile).toBe('7755995615')
    expect(session.user.fullName).toBe('Pankaj Popat Yewale')
    expect(session.user.permissions).toContain('dairies:create')
    expect(session.user.permissions).toContain('dairies:suspend')
    expect(session.user.permissions).toContain('platform:admin')

    // Session must be active in storage
    const active = mockBackend.getActiveSession()
    expect(active).not.toBeNull()
    expect(active?.token).toBe(session.token)
  })

  it('verifies master dev test OTP code (555555)', async () => {
    const otpRes = await mockBackend.requestOtp({ mobile: '7755995615' })
    const session = await mockBackend.verifyOtp({
      mobile: '7755995615',
      otp: '555555',
      requestId: otpRes.requestId,
    })

    expect(session.token).toBeDefined()
  })

  it('rejects invalid OTP codes', async () => {
    const otpRes = await mockBackend.requestOtp({ mobile: '7755995615' })
    await expect(
      mockBackend.verifyOtp({
        mobile: '7755995615',
        otp: '000000',
        requestId: otpRes.requestId,
      })
    ).rejects.toThrow(/Invalid or expired OTP/i)
  })

  it('clears session on logout and writes audit record', async () => {
    const otpRes = await mockBackend.requestOtp({ mobile: '7755995615' })
    await mockBackend.verifyOtp({
      mobile: '7755995615',
      otp: otpRes.devOtpHint!,
      requestId: otpRes.requestId,
    })

    mockBackend.logout()
    expect(mockBackend.getActiveSession()).toBeNull()

    const logs = mockBackend.getAuditLogs({ action: 'auth.logout' })
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].action).toBe('auth.logout')
  })
})
