import { describe, it, expect } from 'vitest'
import { MockDairyBackend } from '@/api/mock-server'

describe('Milk Rate Chart Versioning & Historical Preservation', () => {
  it('creates a new draft version incrementing version number', async () => {
    const existing = await MockDairyBackend.getRateCharts()
    const cowCharts = existing.filter((r) => r.milkCategory === 'COW')
    const currentMaxVersion = cowCharts.length

    const newDraft = await MockDairyBackend.createRateChartVersion(
      {
        title: 'New Winter Incentive Chart',
        milkCategory: 'COW',
        baseRatePerLiter: 40.0,
        minFat: 3.0,
        maxFat: 5.0,
        fatStep: 0.1,
        minSnf: 8.0,
        maxSnf: 9.2,
        snfStep: 0.1,
        effectiveDate: '2026-12-01',
        changeNotes: 'Bonus winter rates',
      },
      'Rajesh Patel'
    )

    expect(newDraft.status).toBe('DRAFT')
    expect(newDraft.version).toBe(currentMaxVersion + 1)
  })

  it('archives previously active version upon activating new version', async () => {
    const charts = await MockDairyBackend.getRateCharts()
    const draft = charts.find((c) => c.status === 'DRAFT')!

    await MockDairyBackend.activateRateChartVersion(draft.id, 'Rajesh Patel')

    const updated = await MockDairyBackend.getRateCharts()
    const activated = updated.find((c) => c.id === draft.id)!
    expect(activated.status).toBe('ACTIVE')

    // Historical version is preserved as ARCHIVED
    const archived = updated.filter((c) => c.milkCategory === draft.milkCategory && c.id !== draft.id)
    archived.forEach((rc) => {
      expect(rc.status).toBe('ARCHIVED')
    })
  })
})
