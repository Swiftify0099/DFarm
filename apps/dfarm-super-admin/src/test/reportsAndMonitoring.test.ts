import { describe, it, expect, beforeEach } from 'vitest'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'

describe('Platform Monitoring & Tenant-Isolated Reports', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('aggregates live platform health metrics across multi-tenant nodes', () => {
    const health = mockBackend.getPlatformHealth()
    expect(health.overallStatus).toBeDefined()
    expect(health.components.length).toBeGreaterThan(0)
    expect(health.syncMetrics.activeDairyNodesOnline).toBeGreaterThan(0)
    expect(health.deviceMetrics.totalRegisteredHardwareUnits).toBeGreaterThan(0)
  })

  it('generates dairy growth report with aggregated tenant metrics', () => {
    const actor = mockBackend.getSuperAdminUser()
    const report = mockBackend.generateReport(
      {
        reportType: 'dairy_growth',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      actor
    )

    expect(report.title).toContain('Dairy Registration')
    expect(report.rows.length).toBeGreaterThan(0)
    expect(report.summaryMetrics['Total Registered Tenants']).toBeDefined()

    // Tenant privacy rule: General platform reports must NOT contain individual farmer or customer ledgers
    report.rows.forEach((row) => {
      expect(row.dairyCode).toBeDefined()
      expect(row).not.toHaveProperty('farmerId')
      expect(row).not.toHaveProperty('milkFat')
      expect(row).not.toHaveProperty('farmerPaymentAmount')
    })
  })

  it('generates dairy lifecycle compliance report', () => {
    const actor = mockBackend.getSuperAdminUser()
    const report = mockBackend.generateReport(
      {
        reportType: 'dairy_lifecycle',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      actor
    )

    expect(report.title).toContain('Lifecycle')
    expect(report.rows.length).toBeGreaterThan(0)
    expect(report.summaryMetrics['Suspended Tenants']).toBeDefined()
  })

  it('generates primary dairy admin verification compliance report', () => {
    const actor = mockBackend.getSuperAdminUser()
    const report = mockBackend.generateReport(
      {
        reportType: 'admin_compliance',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      actor
    )

    expect(report.title).toContain('Admin Provisioning')
    expect(report.rows.length).toBeGreaterThan(0)
    expect(report.summaryMetrics['Total Primary Admins']).toBeDefined()
  })

  it('generates hardware sync telemetry report', () => {
    const actor = mockBackend.getSuperAdminUser()
    const report = mockBackend.generateReport(
      {
        reportType: 'sync_health',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      actor
    )

    expect(report.title).toContain('Hardware Sync')
    expect(report.rows.length).toBeGreaterThan(0)
  })
})
