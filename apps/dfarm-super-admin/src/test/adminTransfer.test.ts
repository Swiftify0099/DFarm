import { describe, it, expect, beforeEach } from 'vitest'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Primary Dairy Admin Ownership Transfer', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('transfers primary administration to a new verified candidate with token authorization', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const dairy = mockBackend.getDairyById('dairy_kop_0118')!
    const previousAdminId = dairy.primaryAdminId

    const result = await mockBackend.transferPrimaryAdmin(
      {
        dairyId: dairy.id,
        currentAdminId: previousAdminId,
        newAdminName: 'Anil Deshmukh',
        newAdminMobile: '9765012345',
        newAdminEmail: 'anil.deshmukh@sahyadrimilk.com',
        transferReason: 'Managing committee resolution approved transition of primary dairy operator.',
        confirmationText: 'CONFIRM TRANSFER',
      },
      actor
    )

    expect(result.dairy.primaryAdminName).toBe('Anil Deshmukh')
    expect(result.dairy.primaryAdminMobile).toBe('9765012345')
    expect(result.newAdmin.fullName).toBe('Anil Deshmukh')
    expect(result.newAdmin.status).toBe('pending_verification')

    // Old admin account must be disabled
    const allAdmins = mockBackend.getAdmins({ dairyId: dairy.id })
    const oldAdmin = allAdmins.find((a) => a.id === previousAdminId)
    expect(oldAdmin?.status).toBe('disabled')

    // Audit trail must record the transfer
    const transferLogs = mockBackend.getAuditLogs({
      dairyId: dairy.id,
      action: 'admin.transferred',
    })
    expect(transferLogs.length).toBeGreaterThan(0)
    expect(transferLogs[0].actionDescription).toContain('Transferred primary administration')
  })

  it('rejects transfer when confirmation token does not match', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const dairy = mockBackend.getDairyById('dairy_kop_0118')!

    await expect(
      mockBackend.transferPrimaryAdmin(
        {
          dairyId: dairy.id,
          currentAdminId: dairy.primaryAdminId,
          newAdminName: 'Anil Deshmukh',
          newAdminMobile: '9765012345',
          transferReason: 'Valid reason here with more than 10 characters',
          confirmationText: 'WRONG_CONFIRM',
        },
        actor
      )
    ).rejects.toThrow(/Confirmation token mismatch/i)
  })

  it('rejects transfer when new mobile is already an active primary admin of another dairy', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const dairy = mockBackend.getDairyById('dairy_kop_0118')!

    await expect(
      mockBackend.transferPrimaryAdmin(
        {
          dairyId: dairy.id,
          currentAdminId: dairy.primaryAdminId,
          newAdminName: 'Ramesh Gowda',
          newAdminMobile: '9845012345', // Already primary admin of Amrith Milk Producer Co-op
          transferReason: 'Valid reason here with more than 10 characters',
          confirmationText: 'CONFIRM TRANSFER',
        },
        actor
      )
    ).rejects.toThrow(/already assigned as primary admin/i)
  })
})
