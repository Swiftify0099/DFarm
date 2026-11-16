import { describe, it, expect } from 'vitest'
import { MockCollectionBackend, CURRENT_DAIRY_ID } from '../api/mock-backend'

describe('Operator Authentication & Tenant Isolation', () => {
  it('dispatches valid 6-digit OTP to assigned operator mobile number', async () => {
    const res = await MockCollectionBackend.sendOtp('9876543210')
    expect(res.success).toBe(true)
    expect(res.previewOtp).toHaveLength(6)
  })

  it('rejects unassigned mobile numbers', async () => {
    await expect(MockCollectionBackend.sendOtp('9999999999')).rejects.toThrow(
      'not assigned to this collection terminal'
    )
  })

  it('verifies correct OTP and returns session scoped to dairy tenant', async () => {
    const res = await MockCollectionBackend.sendOtp('9876543210')
    const session = await MockCollectionBackend.verifyOtp('9876543210', res.previewOtp)

    expect(session.mobileNumber).toBe('9876543210')
    expect(session.dairyId).toBe(CURRENT_DAIRY_ID)
    expect(session.role).toBe('COLLECTION_OPERATOR')
    expect(session.sessionToken).toBeDefined()
  })

  it('rejects incorrect OTP code', async () => {
    await MockCollectionBackend.sendOtp('9876543210')
    await expect(MockCollectionBackend.verifyOtp('9876543210', '000000')).rejects.toThrow(
      'Invalid 6-digit OTP code'
    )
  })
})
