import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'
import { GlobalRatePoliciesPage } from '@/features/rate-policies/GlobalRatePoliciesPage'
import { GlobalFatSnfPoliciesPage } from '@/features/fat-snf-policies/GlobalFatSnfPoliciesPage'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Policy Management - Rate & FAT/SNF Engine', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('lists existing global rate policies with versions', () => {
    const policies = mockBackend.getGlobalRatePolicies()
    expect(policies.length).toBeGreaterThan(0)
    const active = policies[0]
    expect(active.policyCode).toBeDefined()
    expect(active.versions.length).toBeGreaterThan(0)
    expect(active.versions[0].status).toBe('PUBLISHED')
    expect(active.versions[0].cowMinRate).toBeGreaterThan(0)
  })

  it('creates a new global rate policy draft and publishes a version', async () => {
    const newPolicy = await mockBackend.createGlobalRatePolicy({
      policyCode: 'TEST-RP-01',
      name: 'Test Federation Price Floor',
      description: 'Test automated rate floor',
      applicableDairies: ['*'],
    })

    expect(newPolicy.id).toBeDefined()
    expect(newPolicy.policyCode).toBe('TEST-RP-01')

    const newVersion = await mockBackend.createGlobalRatePolicyVersion(newPolicy.id, {
      cowMinRate: 36.5,
      buffaloMinRate: 46.0,
      standardFatCow: 3.5,
      standardSnfCow: 8.5,
      standardFatBuffalo: 6.5,
      standardSnfBuffalo: 9.0,
      effectiveFrom: '2026-06-01T00:00:00Z',
    })

    expect(newVersion.versionNumber).toBe(1)
    expect(newVersion.status).toBe('DRAFT')

    const published = await mockBackend.publishGlobalRatePolicyVersion(newPolicy.id, newVersion.versionNumber)
    expect(published.status).toBe('PUBLISHED')
    expect(published.checksum).toBeDefined()
    expect(published.publishedAt).toBeDefined()
  })

  it('lists existing global FAT/SNF adjustment policies', () => {
    const policies = mockBackend.getGlobalFatSnfPolicies()
    expect(policies.length).toBeGreaterThan(0)
    const active = policies[0]
    expect(active.policyCode).toBeDefined()
    expect(active.versions.length).toBeGreaterThan(0)
    expect(active.versions[0].fatAdjustments.length).toBeGreaterThan(0)
    expect(active.versions[0].snfAdjustments.length).toBeGreaterThan(0)
  })

  it('creates and publishes a FAT/SNF adjustment policy with slabs', async () => {
    const newPolicy = await mockBackend.createGlobalFatSnfPolicy({
      policyCode: 'TEST-FS-01',
      name: 'Test Regional Adjustment Slabs',
      description: 'Regional FAT and SNF adjustment test',
      applicableDairies: ['*'],
    })

    expect(newPolicy.id).toBeDefined()

    const newVersion = await mockBackend.createGlobalFatSnfPolicyVersion(newPolicy.id, {
      milkType: 'COW',
      roundingRule: 'HALF_UP',
      effectiveFrom: '2026-07-01T00:00:00Z',
      fatAdjustments: [
        {
          minFat: 3.0,
          maxFat: 3.5,
          adjustmentPerPoint: -0.2,
          type: 'DEDUCTION',
        },
        {
          minFat: 3.5,
          maxFat: 4.5,
          adjustmentPerPoint: 0.25,
          type: 'INCENTIVE',
        },
      ],
      snfAdjustments: [
        {
          minSnf: 8.0,
          maxSnf: 8.5,
          adjustmentPerPoint: -0.3,
          type: 'DEDUCTION',
        },
      ],
    })

    expect(newVersion.status).toBe('DRAFT')
    expect(newVersion.fatAdjustments.length).toBe(2)

    const published = await mockBackend.publishGlobalFatSnfPolicyVersion(newPolicy.id, newVersion.versionNumber)
    expect(published.status).toBe('PUBLISHED')
    expect(published.checksum).toBeDefined()
  })

  it('renders GlobalRatePoliciesPage component with policy list and controls', async () => {
    renderWithProviders(<GlobalRatePoliciesPage />)

    expect(screen.getByText('Global Rate Policy Management')).toBeInTheDocument()
    expect(screen.getByText('Create Rate Policy')).toBeInTheDocument()

    // Wait for policy to load from query
    await waitFor(() => {
      expect(screen.getByText('Maharashtra State Cooperative Baseline Rate Policy')).toBeInTheDocument()
    })

    expect(screen.getByText(/Authorized Dairy \/ Federation Procurement Price Floor/i)).toBeInTheDocument()
  })

  it('renders GlobalFatSnfPoliciesPage component with quality rules and tables', async () => {
    renderWithProviders(<GlobalFatSnfPoliciesPage />)

    expect(screen.getByText('Global FAT/SNF Adjustment Policy')).toBeInTheDocument()
    expect(screen.getByText('Create FAT/SNF Policy')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Standard Precision Deduction Policy 2026')).toBeInTheDocument()
    })

    expect(screen.getByText(/Quality Calibration Specification/i)).toBeInTheDocument()
  })
})
