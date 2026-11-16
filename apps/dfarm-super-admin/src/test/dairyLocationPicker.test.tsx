import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DairyLocationPicker } from '../features/dairies/DairyLocationPicker'

// Mock @googlemaps/js-api-loader
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

describe('DairyLocationPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders interactive map container when API key is provided', async () => {
    const onLocationSelect = vi.fn()
    render(<DairyLocationPicker onLocationSelect={onLocationSelect} />)

    // With VITE_GOOGLE_MAPS_API_KEY configured, Interactive Map Offline should NOT be shown
    expect(screen.queryByText('Interactive Map Offline')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search village, city, landmark/i)).toBeInTheDocument()
    expect(screen.getByText('Use Current Location')).toBeInTheDocument()
  })

  it('displays confirmed geographic location coordinates and address', () => {
    const onLocationSelect = vi.fn()
    render(
      <DairyLocationPicker
        initialLatitude={18.5204}
        initialLongitude={73.8567}
        initialAddress="Pune, Maharashtra"
        onLocationSelect={onLocationSelect}
      />
    )

    // Confirmed Geographic Location card shows formatted coordinates
    expect(screen.getByText('Confirmed Geographic Location')).toBeInTheDocument()
    expect(screen.getByText('18.5204000')).toBeInTheDocument()
    expect(screen.getByText('73.8567000')).toBeInTheDocument()
    expect(screen.getByText(/Pune, Maharashtra/i)).toBeInTheDocument()
  })
})
