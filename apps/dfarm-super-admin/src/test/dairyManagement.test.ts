import { describe, it, expect, beforeEach } from 'vitest'
import { mockBackend, SYNTHETIC_DF_SAN_2813_MOCK_TOKEN } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Dairy Business & Tenant Lifecycle Management', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('creates new multi-tenant dairy with unique backend generated ID and code', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const result = await mockBackend.createDairy(
      {
        name: 'Cauvery River Basin Milk Union',
        businessPhone: '08212456789',
        businessEmail: 'contact@cauverymilk.org',
        addressLine1: 'Hunsur Road, Mysore Rural',
        district: 'Mysore',
        state: 'Karnataka',
        pincode: '570018',
        primaryAdminName: 'Naveen Kumar',
        primaryAdminMobile: '9448012345',
      },
      actor
    )

    expect(result.dairy.id).toBeDefined()
    expect(result.dairy.code).toMatch(/^DF-MYS-\d{4}$/)
    expect(result.dairy.status).toBe('draft_onboarding')
    expect(result.dairy.primaryAdminName).toBe('Naveen Kumar')
    expect(result.admin.mobile).toBe('9448012345')
    expect(result.admin.verificationStatus).toBe('unverified')
    expect(result.inviteLink).toContain(result.dairy.code)

    // Verify presence in directory
    const listed = mockBackend.getDairyById(result.dairy.id)
    expect(listed).not.toBeNull()
    expect(listed?.name).toBe('Cauvery River Basin Milk Union')
  })

  it('prevents creation of duplicate dairy names', async () => {
    const actor = mockBackend.getSuperAdminUser()
    await expect(
      mockBackend.createDairy(
        {
          name: 'Amrith Milk Producer Co-op', // Already exists in initial seed
          businessEmail: 'contact@amrithdairy.org',
          businessPhone: '08027622345',
          addressLine1: 'Main Road',
          district: 'Bangalore Rural',
          state: 'Karnataka',
          pincode: '561203',
          primaryAdminName: 'Duplicate Test',
          primaryAdminMobile: '9988776655',
        },
        actor
      )
    ).rejects.toThrow(/already exists/i)
  })

  it('prevents reusing an existing primary admin mobile for another dairy (one admin per dairy rule)', async () => {
    const actor = mockBackend.getSuperAdminUser()
    await expect(
      mockBackend.createDairy(
        {
          name: 'New Independent Dairy',
          businessEmail: 'contact@independentdairy.org',
          businessPhone: '08027622345',
          addressLine1: 'Main Road',
          district: 'Hassan',
          state: 'Karnataka',
          pincode: '573201',
          primaryAdminName: 'Ramesh Gowda',
          primaryAdminMobile: '9845012345', // Already assigned to Amrith Milk Producer Co-op
        },
        actor
      )
    ).rejects.toThrow(/already associated with an existing Primary Dairy Admin/i)
  })

  it('suspends active dairy with mandatory audit reason and disables primary admin session', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const targetDairy = mockBackend.getDairyById('dairy_blr_0042')!
    expect(targetDairy.status).toBe('active')

    const suspended = await mockBackend.suspendDairy(
      {
        dairyId: targetDairy.id,
        reason: 'Mandatory annual electrical and chilling tank safety certification expired.',
      },
      actor
    )

    expect(suspended.status).toBe('suspended')
    expect(suspended.suspendedAt).toBeDefined()
    expect(suspended.suspensionReason).toContain('safety certification expired')

    // Corresponding admin must be disabled
    const admins = mockBackend.getAdmins({ dairyId: targetDairy.id })
    expect(admins[0].status).toBe('disabled')

    // Must generate audit log entry
    const auditLogs = mockBackend.getAuditLogs({ dairyId: targetDairy.id, action: 'dairy.suspended' })
    expect(auditLogs.length).toBeGreaterThan(0)
    expect(auditLogs[0].reason).toContain('safety certification expired')
  })

  it('rejects dairy suspension without adequate operational justification', async () => {
    const actor = mockBackend.getSuperAdminUser()
    await expect(
      mockBackend.suspendDairy(
        {
          dairyId: 'dairy_blr_0042',
          reason: 'Short', // Too short (< 10 chars)
        },
        actor
      )
    ).rejects.toThrow(/minimum 10 characters/i)
  })

  it('reactivates suspended dairy and restores primary admin access', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const suspendedDairy = mockBackend.getDairyById('dairy_ind_0489')!
    expect(suspendedDairy.status).toBe('suspended')

    const reactivated = await mockBackend.reactivateDairy(
      {
        dairyId: suspendedDairy.id,
        reason: 'Physical inspection completed and hardware calibrated successfully.',
      },
      actor
    )

    expect(reactivated.status).toBe('active')
    expect(reactivated.suspendedAt).toBeUndefined()
    expect(reactivated.suspensionReason).toBeUndefined()

    // Primary admin restored
    const admins = mockBackend.getAdmins({ dairyId: suspendedDairy.id })
    expect(admins[0].status).toBe('active')
  })

  it('creates new dairy with real geographical coordinates, pin location, and reverse geocoded address', async () => {
    const actor = mockBackend.getSuperAdminUser()
    const result = await mockBackend.createDairy(
      {
        name: 'Krishna River Valley Dairy Federation',
        businessPhone: '08332244556',
        businessEmail: 'info@krishnadairy.org',
        addressLine1: 'Belanki Cross Road, Miraj Rural',
        district: 'Sangli',
        state: 'Maharashtra',
        pincode: '416410',
        latitude: 16.8456721,
        longitude: 74.6478912,
        formattedAddress: 'Belanki Cross Road, Miraj Rural, Sangli, Maharashtra 416410, India',
        placeId: 'ChIJMirajRuralSahyadri001',
        villageLocality: 'Miraj Rural',
        primaryAdminName: 'Santosh Anna Patil',
        primaryAdminMobile: '9822334499',
      },
      actor
    )

    expect(result.dairy.location.latitude).toBe(16.8456721)
    expect(result.dairy.location.longitude).toBe(74.6478912)
    expect(result.dairy.location.formattedAddress).toContain('Belanki Cross Road')
    expect(result.dairy.location.placeId).toBe('ChIJMirajRuralSahyadri001')
    expect(result.dairy.location.villageLocality).toBe('Miraj Rural')

    // Verify retrieval preserves coordinates
    const stored = mockBackend.getDairyById(result.dairy.id)
    expect(stored?.location.latitude).toBe(16.8456721)
    expect(stored?.location.longitude).toBe(74.6478912)
  })

  it('retrieves activation link and allows full primary admin activation for dairy tenant', async () => {
    // Test activation link retrieval for an onboarding dairy (e.g. dairy_vja_0312)
    const linkData = await mockBackend.getActivationLink('dairy_vja_0312')
    expect(linkData.inviteLink).toContain('/activate?token=')
    expect(linkData.dairyCode).toBe('DF-VJA-0312')
    expect(linkData.rawToken).toBeDefined()

    // Validate the token
    const val = await mockBackend.validateActivationToken(linkData.rawToken, 'DF-VJA-0312')
    expect(val.code).toBe('VALID')
    expect(val.data?.dairyCode).toBe('DF-VJA-0312')
    expect(val.data?.dairyName).toBe('Krishna Valley Milk Producers')

    // Request OTP
    const otpRes = await mockBackend.requestActivationOtp(linkData.rawToken, 'DF-VJA-0312')
    expect(otpRes.success).toBe(true)
    expect(otpRes.previewOtp).toBeDefined()

    // Complete Activation
    const actRes = await mockBackend.activatePrimaryAdmin(linkData.rawToken, otpRes.previewOtp!, 'DF-VJA-0312')
    expect(actRes.success).toBe(true)
    expect(actRes.dairyCode).toBe('DF-VJA-0312')

    // Verify dairy operational readiness updated
    const updatedDairy = mockBackend.getDairyById('dairy_vja_0312')
    expect(updatedDairy?.status).toBe('active')
    expect(updatedDairy?.operationalReadiness.primaryAdminActivated).toBe(true)
    expect(updatedDairy?.operationalReadiness.readinessScore).toBe(50)
  })

  it('validates activation token for DF-SAN-2813 fallback scenario', async () => {
    const val = await mockBackend.validateActivationToken(SYNTHETIC_DF_SAN_2813_MOCK_TOKEN, 'DF-SAN-2813')
    expect(val.code).toBe('VALID')
    expect(val.data?.dairyCode).toBe('DF-SAN-2813')
    expect(val.data?.dairyName).toBe("Anand Malk's")
  })
})
