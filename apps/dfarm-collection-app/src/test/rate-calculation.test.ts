import { describe, it, expect } from 'vitest'
import { MockCollectionBackend } from './mocks/mock-backend'

describe('Rate Calculation Matrix Engine', () => {
  it('correctly calculates Cow milk rate using two-axis formula', () => {
    // Formula: 38.5 + (fat - 3.5) * 4.2 + (snf - 8.5) * 3.5
    // For fat = 4.0, snf = 8.5:
    // 38.5 + (0.5 * 4.2) + (0.0 * 3.5) = 38.5 + 2.1 = 40.60
    const result = MockCollectionBackend.calculateRate('COW', 4.0, 8.5)
    expect(result.ratePerLiter).toBe(40.6)
    expect(result.version).toBe(2)
  })

  it('correctly calculates Buffalo milk rate with higher base rate', () => {
    // Formula: 58.0 + (fat - 3.5) * 4.2 + (snf - 8.5) * 3.5
    // For fat = 6.5, snf = 9.0:
    // 58.0 + (3.0 * 4.2) + (0.5 * 3.5) = 58.0 + 12.6 + 1.75 = 72.35
    const result = MockCollectionBackend.calculateRate('BUFFALO', 6.5, 9.0)
    expect(result.ratePerLiter).toBe(72.35)
    expect(result.version).toBe(1)
  })

  it('enforces minimum rate floor of ₹15.00', () => {
    // Extreme low quality reading
    const result = MockCollectionBackend.calculateRate('COW', 0.5, 2.0)
    expect(result.ratePerLiter).toBeGreaterThanOrEqual(15.0)
  })
})
