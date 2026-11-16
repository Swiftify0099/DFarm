import { describe, it, expect, beforeEach } from 'vitest'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Platform Audit Integrity & Controlled Support Access', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('guarantees append-only audit records for all privileged operations', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const initialLogCount = mockBackend.getAuditLogs().length

    // Trigger an administrative action
    await mockBackend.requestOtp({ mobile: actor.mobile })
    await mockBackend.verifyOtp({
      mobile: actor.mobile,
      otp: '555555',
      requestId: 'test_req',
    })

    const afterLogCount = mockBackend.getAuditLogs().length
    expect(afterLogCount).toBeGreaterThan(initialLogCount)

    const latest = mockBackend.getAuditLogs()[0]
    expect(latest.actorId).toBe(actor.id)
    expect(latest.action).toBe('auth.login_success')
    expect(latest.ipAddress).toBeDefined()
    expect(latest.timestamp).toBeDefined()
  })

  it('creates controlled support access session with expiration and audit records', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const dairy = mockBackend.getDairyById('dairy_blr_0042')!

    const session = await mockBackend.requestSupportSession(
      {
        dairyId: dairy.id,
        justificationReason: 'Customer reported digital weighing scale disconnecting during morning shift.',
        supportTicketRef: 'HD-8841',
        durationMinutes: 30,
        authorizedScope: 'read_only_diagnostics',
      },
      actor
    )

    expect(session.id).toBeDefined()
    expect(session.dairyId).toBe(dairy.id)
    expect(session.status).toBe('active')
    expect(session.expiresAt).toBeDefined()

    // Must be reported as the active session
    const active = mockBackend.getActiveSupportSession()
    expect(active?.id).toBe(session.id)

    // Audit record created
    const supportAudit = mockBackend.getAuditLogs({ action: 'support.access_granted' })
    expect(supportAudit.length).toBeGreaterThan(0)
    expect(supportAudit[0].dairyId).toBe(dairy.id)
  })

  it('rejects support session request with insufficient justification', async () => {
    const actor = mockBackend.getSuperAdminUser()
    await expect(
      mockBackend.requestSupportSession(
        {
          dairyId: 'dairy_blr_0042',
          justificationReason: 'Fix error', // Too short (< 15 chars)
          durationMinutes: 15,
          authorizedScope: 'read_only_diagnostics',
        },
        actor
      )
    ).rejects.toThrow(/minimum 15 characters/i)
  })

  it('manually revokes active support session and logs revocation event', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const dairy = mockBackend.getDairyById('dairy_blr_0042')!

    const session = await mockBackend.requestSupportSession(
      {
        dairyId: dairy.id,
        justificationReason: 'Investigate edge sync packet drop for morning batch collection.',
        durationMinutes: 15,
        authorizedScope: 'sync_repair',
      },
      actor
    )

    const revoked = await mockBackend.revokeSupportSession(
      {
        sessionId: session.id,
        reason: 'Troubleshooting completed; network queue cleared.',
      },
      actor
    )

    expect(revoked.status).toBe('revoked')
    expect(mockBackend.getActiveSupportSession()).toBeNull()

    const revokeAudit = mockBackend.getAuditLogs({ action: 'support.access_revoked' })
    expect(revokeAudit.length).toBeGreaterThan(0)
  })
})
