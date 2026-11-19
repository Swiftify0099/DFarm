import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'
import { HardwareInventoryPage } from '@/features/hardware/HardwareInventoryPage'
import { AmcManagementPage } from '@/features/amc/AmcManagementPage'

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

describe('Hardware Inventory & AMC Management', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('lists existing central hardware inventory units', () => {
    const devices = mockBackend.getHardware()
    expect(devices.length).toBeGreaterThan(0)
    const dev = devices[0]
    expect(dev.serialNumber).toBeDefined()
    expect(dev.deviceCategory).toBeDefined()
    expect(dev.status).toBeDefined()
  })

  it('registers, assigns, and unassigns hardware devices', async () => {
    const newDevice = await mockBackend.registerHardware({
      deviceCategory: 'ANALYZER',
      serialNumber: 'SN-TEST-8899',
      imei: '861234567890123',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      hardwareModel: 'Lactoscan Combo Pro',
      firmwareVersion: 'v2.4.0',
      procuredDate: '2026-03-01',
      procurementCostPaise: 4500000,
    })

    expect(newDevice.id).toBeDefined()
    expect(newDevice.status).toBe('AVAILABLE')

    // Assign to dairy
    const assigned = await mockBackend.assignHardware(newDevice.id, {
      dairyId: 'dairy-001',
      notes: 'Assigned for testing collection center',
    })

    expect(assigned.status).toBe('ASSIGNED')
    expect(assigned.assignedDairyId).toBe('dairy-001')

    // Update status to MAINTENANCE
    const maintained = await mockBackend.updateHardwareStatus(newDevice.id, {
      status: 'MAINTENANCE',
      notes: 'Sensor recalibration in progress',
    })
    expect(maintained.status).toBe('MAINTENANCE')

    // Unassign device back to stock
    const unassigned = await mockBackend.unassignHardware(newDevice.id, {
      notes: 'Returned from field inspection',
    })
    expect(unassigned.status).toBe('AVAILABLE')
    expect(unassigned.assignedDairyId).toBeFalsy()
  })

  it('manages AMC plans and dairy subscriptions with payment verification', async () => {
    const plans = mockBackend.getAmcPlans()
    expect(plans.length).toBeGreaterThan(0)

    const newPlan = await mockBackend.createAmcPlan({
      planCode: 'AMC-ENTERPRISE-TEST',
      planName: 'Enterprise SLA Test Plan',
      description: 'Comprehensive test coverage',
      annualCostPaise: 1200000,
      preventiveVisitsPerYear: 6,
      slaHours: 12,
      includesSpares: true,
      maxEmergencyCalls: 8,
    })

    expect(newPlan.id).toBeDefined()
    expect(newPlan.planCode).toBe('AMC-ENTERPRISE-TEST')

    // Create subscription
    const sub = await mockBackend.createAmcSubscription({
      dairyId: '00000000-0000-0000-0000-000000000001',
      planId: newPlan.id,
      startDate: '2026-04-01T00:00:00Z',
      endDate: '2027-03-31T23:59:59Z',
      coveredDevices: ['SN-TEST-8899'],
    })

    expect(sub.id).toBeDefined()
    expect(sub.status).toBe('PENDING_PAYMENT')

    // Verify payment
    const verified = await mockBackend.verifyAmcPayment(sub.id, {
      razorpayPaymentId: 'pay_test_amc_123456',
      razorpayOrderId: 'order_test_amc_789012',
      razorpaySignature: 'sig_test_amc_valid',
    })

    expect(verified.status).toBe('ACTIVE')
  })

  it('renders HardwareInventoryPage component with filters and action buttons', async () => {
    renderWithProviders(<HardwareInventoryPage />)

    expect(screen.getByText('Central Hardware Inventory & Allocation')).toBeInTheDocument()
    expect(screen.getByText('Register Hardware Unit')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('ANALYZER-MA-800-01')).toBeInTheDocument()
      expect(screen.getByText('Baramati Milk Union')).toBeInTheDocument()
    })
  })

  it('renders AmcManagementPage component with plans and active contracts', async () => {
    renderWithProviders(<AmcManagementPage />)

    expect(screen.getByText('AMC & Service Management')).toBeInTheDocument()
    expect(screen.getByText('New Plan')).toBeInTheDocument()
    expect(screen.getByText('Assign AMC')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('Standard Annual AMC').length).toBeGreaterThan(0)
      expect(screen.getByText('Baramati Milk Union')).toBeInTheDocument()
    })
  })
})
