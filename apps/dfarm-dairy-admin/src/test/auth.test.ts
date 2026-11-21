import { describe, it, expect, beforeEach } from 'vitest'
import { MockDairyBackend, CURRENT_DAIRY_ID } from './mocks/mock-server'

describe('Dairy Admin Mobile OTP Authentication State Machine', () => {
  const validMobile = '9876543210'
  const unauthorizedMobile = '9999999999'

  it('rejects unregistered mobile number', async () => {
    await expect(MockDairyBackend.sendLoginOtp(unauthorizedMobile)).rejects.toThrow(
      /is not registered as an authorized operator/
    )
  })

  it('dispatches a genuine 6-digit OTP for authorized Dairy Admin', async () => {
    const res = await MockDairyBackend.sendLoginOtp(validMobile)
    expect(res.success).toBe(true)
    expect(res.previewOtp).toBeDefined()
    expect(res.previewOtp?.length).toBe(6)
  })

  it('rejects invalid OTP entry and decrements attempt counter', async () => {
    const res = await MockDairyBackend.sendLoginOtp(validMobile)
    const validOtp = res.previewOtp!
    const wrongOtp = validOtp === '111111' ? '222222' : '111111'

    await expect(MockDairyBackend.verifyLoginOtp(validMobile, wrongOtp)).rejects.toThrow(
      /Invalid OTP code entered/
    )
  })

  it('authenticates valid OTP and resolves dairy tenant isolation', async () => {
    const res = await MockDairyBackend.sendLoginOtp(validMobile)
    const validOtp = res.previewOtp!

    const user = await MockDairyBackend.verifyLoginOtp(validMobile, validOtp)
    expect(user).toBeDefined()
    expect(user.dairyId).toBe(CURRENT_DAIRY_ID)
    expect(user.isPrimaryAdmin).toBe(true)
    expect(user.role).toBe('PRIMARY_DAIRY_ADMIN')
    expect(user.sessionToken).toContain('dfarm_jwt_')
  })
})
