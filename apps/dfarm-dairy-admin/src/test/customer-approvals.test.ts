import { describe, it, expect } from 'vitest'
import { MockDairyBackend } from '@/api/mock-server'

describe('Customer Registration Approval & Face Biometrics Workflow', () => {
  it('retrieves pending registration requests with YuNet/SFace metadata', async () => {
    const pending = await MockDairyBackend.getPendingRegistrations()
    expect(pending.length).toBeGreaterThan(0)
    const first = pending[0]
    expect(first.faceCapture.modelVersion).toBe('YuNet-v1.0 + SFace-INT8-v1.0')
    expect(first.faceCapture.consentAgreed).toBe(true)
    expect(first.faceCapture.qualityScore).toBeGreaterThan(80)
  })

  it('rejects approval without proper request ID', async () => {
    await expect(MockDairyBackend.approveRegistration('non-existent-id', 'Test Operator')).rejects.toThrow(
      /Registration request not found/
    )
  })

  it('approves a pending customer and registers active customer profile and face enrollment', async () => {
    const pending = await MockDairyBackend.getPendingRegistrations()
    const target = pending.find((p) => p.status === 'PENDING')!

    const approvedCust = await MockDairyBackend.approveRegistration(target.id, 'Rajesh Patel')
    expect(approvedCust.fullName).toBe(target.candidateName)
    expect(approvedCust.status).toBe('ACTIVE')
    expect(approvedCust.customerCode).toMatch(/^C-\d+$/)

    // Verify face record was activated
    const faceRecords = await MockDairyBackend.getFaceEnrollments()
    const faceRec = faceRecords.find((f) => f.customerId === approvedCust.id)
    expect(faceRec).toBeDefined()
    expect(faceRec?.status).toBe('APPROVED')
    expect(faceRec?.modelVersion).toBe('YuNet-v1.0 + SFace-INT8-v1.0')
  })

  it('requires a mandatory detailed reason (min 5 chars) to reject registration', async () => {
    const pending = await MockDairyBackend.getPendingRegistrations()
    const target = pending.find((p) => p.status === 'PENDING')!

    await expect(MockDairyBackend.rejectRegistration(target.id, 'No', 'Rajesh Patel')).rejects.toThrow(
      /detailed rejection reason is required/
    )

    await MockDairyBackend.rejectRegistration(
      target.id,
      'Applicant resides outside designated collection route',
      'Rajesh Patel'
    )
    expect(target.status).toBe('REJECTED')
  })
})
