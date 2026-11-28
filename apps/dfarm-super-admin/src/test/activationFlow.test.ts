import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { mockBackend, SYNTHETIC_DF_SAN_2813_MOCK_TOKEN } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Dairy Admin Two-Factor Activation Flow', () => {
  beforeEach(async () => {
    storage.clear()
    vi.restoreAllMocks()
    mockBackend.purgeAdminAndRelatedRecords('7755995615')
    mockBackend.purgeAdminAndRelatedRecords('7507495615')
    // Stub fetch to prevent test contamination from local background dev server on port 4000
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network offline in unit test')))
  })

  it('validates activation token and fallback dairy code successfully', async () => {
    const res = await apiClient.validateActivationToken(
      SYNTHETIC_DF_SAN_2813_MOCK_TOKEN,
      'DF-SAN-2813'
    )

    expect(res.code).toBe('VALID')
    expect(res.data).toBeDefined()
    expect(res.data?.dairyCode).toBe('DF-SAN-2813')
    expect(res.data?.adminName).toBe('Pankaj Popat Yewale')
    expect(res.data?.maskedMobile).toBeDefined()
  })

  it('requests activation OTP and returns preview OTP code', async () => {
    const res = await apiClient.requestActivationOtp(
      SYNTHETIC_DF_SAN_2813_MOCK_TOKEN,
      'DF-SAN-2813'
    )

    expect(res.success).toBe(true)
    expect(res.message).toContain('Verification code sent')
    expect(res.previewOtp || res.devOtpHint).toBeDefined()
    expect((res.previewOtp || res.devOtpHint)?.length).toBe(6)
  })

  it('activates primary admin account and updates tenant operational readiness to 50%', async () => {
    const otpRes = await apiClient.requestActivationOtp(
      SYNTHETIC_DF_SAN_2813_MOCK_TOKEN,
      'DF-SAN-2813'
    )

    const otpCode = otpRes.previewOtp || otpRes.devOtpHint!
    const result = await apiClient.activatePrimaryAdmin(
      SYNTHETIC_DF_SAN_2813_MOCK_TOKEN,
      otpCode,
      'DF-SAN-2813'
    )

    expect(result.success).toBe(true)
    expect(result.dairyCode).toBe('DF-SAN-2813')

    // Subsequent token validation must indicate account is already activated
    const reval = await apiClient.validateActivationToken(
      SYNTHETIC_DF_SAN_2813_MOCK_TOKEN,
      'DF-SAN-2813'
    )
    expect(reval.code).toBe('ALREADY_CONSUMED')
  })

  it('gracefully handles network errors without unhandled Failed to fetch', async () => {
    // Mock global fetch to throw TypeError("Failed to fetch")
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const val = await apiClient.validateActivationToken('test-token', 'DF-SAN-2813')
    expect(val.code).toBe('VALID')

    const otp = await apiClient.requestActivationOtp('test-token', 'DF-SAN-2813')
    expect(otp.success).toBe(true)

    const act = await apiClient.activatePrimaryAdmin('test-token', otp.previewOtp!, 'DF-SAN-2813')
    expect(act.success).toBe(true)
  })
})
