import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { mockBackend } from '@/services/mockBackend'
import { storage } from '@/services/storage'
import { apiClient } from '@/api/client'
import { AuthContext } from '@/context/AuthContext'
import { PlatformSettingsPage } from '@/features/settings/PlatformSettingsPage'
import { DairyLocationsPage } from '@/features/locations/DairyLocationsPage'

// Mock @googlemaps/js-api-loader for location components
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(async (lib: string) => {
    if (lib === 'maps') {
      return {
        Map: vi.fn().mockImplementation(() => ({
          setCenter: vi.fn(),
          setZoom: vi.fn(),
          addListener: vi.fn(),
        })),
      }
    }
    if (lib === 'marker') {
      return {
        Marker: vi.fn().mockImplementation(() => ({
          setPosition: vi.fn(),
          getPosition: vi.fn(() => ({ lat: () => 18.5204, lng: () => 73.8567 })),
          addListener: vi.fn(),
        })),
      }
    }
    if (lib === 'geocoding') {
      return {
        Geocoder: vi.fn().mockImplementation(() => ({
          geocode: vi.fn(),
        })),
      }
    }
    if (lib === 'places') {
      return {
        AutocompleteService: vi.fn().mockImplementation(() => ({
          getPlacePredictions: vi.fn(),
        })),
      }
    }
    return {}
  }),
}))

const mockAuthValue: any = {
  user: {
    id: 'user-001',
    mobile: '9876543210',
    fullName: 'Chief Super Admin',
    role: 'SUPER_ADMIN',
    permissions: ['*'],
  },
  session: {
    token: 'test_token',
    expiresAt: '2099-01-01T00:00:00Z',
  },
  isAuthenticated: true,
  isLoading: false,
  hasPermission: () => true,
  hasAnyPermission: () => true,
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
}

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
    <AuthContext.Provider value={mockAuthValue}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{ui}</BrowserRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  )
}

describe('Platform Settings & Dairy Locations Directory', () => {
  beforeEach(() => {
    storage.clear()
    vi.clearAllMocks()
  })

  it('retrieves platform infrastructure configuration with masked secrets and boundaries', () => {
    const settings = mockBackend.getPlatformSettings()
    expect(settings.environment).toBeDefined()
    expect(settings.centralDatabase.status).toBe('CONNECTED')
    expect(settings.centralDatabase.isolationMode).toBe('DATABASE_PER_TENANT')

    // Verify SMS Gateway (Dove SMS)
    expect(settings.smsGateway.provider).toContain('Dove SMS')
    expect(settings.smsGateway.configured).toBe(true)

    // Verify Razorpay SaaS scope boundary
    expect(settings.razorpaySaaS.scope).toContain('SaaS')
    expect(settings.razorpaySaaS.milkSettlementProhibited).toBe(true)
  })

  it('renders PlatformSettingsPage with system health cards and security guardrails', async () => {
    renderWithProviders(<PlatformSettingsPage />)

    expect(screen.getByRole('heading', { level: 1, name: /Platform Configuration/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('PostgreSQL Tenant Database Cluster')).toBeInTheDocument()
    })

    expect(screen.getByText('SMS & OTP Dispatch Provider')).toBeInTheDocument()
    expect(screen.getByText('Razorpay Payment Gateway Scope')).toBeInTheDocument()
    expect(screen.getByText(/Platform SaaS Subscriptions & AMC Invoicing Only/i)).toBeInTheDocument()
  })

  it('renders DairyLocationsPage with geo-coordinates and state filters', async () => {
    vi.spyOn(apiClient, 'getDairies').mockImplementation(async () => mockBackend.getDairies())

    renderWithProviders(<DairyLocationsPage />)

    expect(screen.getByText('Dairy Locations & Discovery Directory')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText(/Amrith Milk Producer Co-op/i).length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText(/DF-BLR-0042/i).length).toBeGreaterThan(0)
  })
})
