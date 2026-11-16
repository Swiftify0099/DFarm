import React, { useEffect, useRef, useState, useCallback } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import {
  MapPin,
  Search,
  Crosshair,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Compass,
} from 'lucide-react'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'

export interface DairyLocationData {
  latitude: number
  longitude: number
  formattedAddress: string
  placeId?: string
  addressLine1?: string
  villageLocality?: string
  city?: string
  district?: string
  state?: string
  pincode?: string
}

interface DairyLocationPickerProps {
  initialLatitude?: number
  initialLongitude?: number
  initialAddress?: string
  onLocationSelect: (location: DairyLocationData) => void
  readOnly?: boolean
}

interface AutocompletePrediction {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

// Default center: India (Pune / Maharashtra hub)
const DEFAULT_LAT = 18.5204303
const DEFAULT_LNG = 73.8567437

export const DairyLocationPicker: React.FC<DairyLocationPickerProps> = ({
  initialLatitude,
  initialLongitude,
  initialAddress,
  onLocationSelect,
  readOnly = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markerInstanceRef = useRef<google.maps.Marker | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [loadingMap, setLoadingMap] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLatitude ?? DEFAULT_LAT,
    lng: initialLongitude ?? DEFAULT_LNG,
  })
  const [currentAddress, setCurrentAddress] = useState<string>(initialAddress ?? '')

  const apiKey =
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''

  const currentAddressRef = useRef<string>(currentAddress)
  useEffect(() => {
    currentAddressRef.current = currentAddress
  }, [currentAddress])

  const onLocationSelectRef = useRef(onLocationSelect)
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect
  }, [onLocationSelect])

  // Parse Google Address Components into clean DFarm fields
  const parseAddressComponents = (
    result: google.maps.GeocoderResult,
    lat: number,
    lng: number
  ): DairyLocationData => {
    let streetNumber = ''
    let route = ''
    let sublocality = ''
    let locality = ''
    let district = ''
    let state = ''
    let postalCode = ''

    for (const comp of result.address_components) {
      const types = comp.types
      if (types.includes('street_number')) streetNumber = comp.long_name
      if (types.includes('route')) route = comp.long_name
      if (types.includes('sublocality') || types.includes('sublocality_level_1'))
        sublocality = comp.long_name
      if (types.includes('locality')) locality = comp.long_name
      if (types.includes('administrative_area_level_2')) district = comp.long_name
      if (types.includes('administrative_area_level_1')) state = comp.long_name
      if (types.includes('postal_code')) postalCode = comp.long_name
    }

    const addressLine1 = [streetNumber, route].filter(Boolean).join(' ') || sublocality || locality
    const villageLocality = sublocality || locality || district

    return {
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7)),
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      addressLine1: addressLine1 || result.formatted_address,
      villageLocality,
      city: locality || district,
      district: district || locality || 'District',
      state: state || 'Maharashtra',
      pincode: postalCode,
    }
  }

  // Reverse geocode coordinates to update address
  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (!geocoderRef.current) {
        const locationData: DairyLocationData = {
          latitude: Number(lat.toFixed(7)),
          longitude: Number(lng.toFixed(7)),
          formattedAddress: currentAddressRef.current || `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        }
        onLocationSelectRef.current(locationData)
        return
      }

      setIsGeocoding(true)
      geocoderRef.current.geocode(
        { location: { lat, lng } },
        (results: any, status: any) => {
          setIsGeocoding(false)
          if (status === 'OK' && results && results[0]) {
            const parsed = parseAddressComponents(results[0], lat, lng)
            setCurrentAddress(parsed.formattedAddress)
            onLocationSelectRef.current(parsed)
          } else {
            const fallback: DairyLocationData = {
              latitude: Number(lat.toFixed(7)),
              longitude: Number(lng.toFixed(7)),
              formattedAddress: currentAddressRef.current || `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`,
            }
            onLocationSelectRef.current(fallback)
          }
        }
      )
    },
    []
  )

  // Initialize Google Maps with modern functional API
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!apiKey) {
      setLoadError(
        'Google Maps API key is not configured in environment (VITE_GOOGLE_MAPS_API_KEY). You can manually enter or adjust coordinates.'
      )
      return
    }

    let isMounted = true
    setLoadingMap(true)
    setLoadError(null)

    const initMap = async () => {
      try {
        setOptions({
          key: apiKey,
        })

        const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary
        const { Marker } = (await importLibrary('marker')) as google.maps.MarkerLibrary
        const { Geocoder } = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary
        const { AutocompleteService } = (await importLibrary('places')) as google.maps.PlacesLibrary

        if (!isMounted || !mapContainerRef.current) return

        const map = new Map(mapContainerRef.current, {
          center: currentCoords,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        })
        mapInstanceRef.current = map

        const marker = new Marker({
          position: currentCoords,
          map,
          draggable: !readOnly,
          title: 'Dairy Location Pin (Drag to fine-tune)',
        })
        markerInstanceRef.current = marker

        geocoderRef.current = new Geocoder()
        autocompleteServiceRef.current = new AutocompleteService()

        if (!readOnly) {
          marker.addListener('dragend', () => {
            const pos = marker.getPosition()
            if (pos) {
              const lat = pos.lat()
              const lng = pos.lng()
              setCurrentCoords({ lat, lng })
              reverseGeocode(lat, lng)
            }
          })

          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              const lat = e.latLng.lat()
              const lng = e.latLng.lng()
              marker.setPosition(e.latLng)
              setCurrentCoords({ lat, lng })
              reverseGeocode(lat, lng)
            }
          })
        }

        setMapLoaded(true)
        setLoadingMap(false)
      } catch (err: any) {
        if (!isMounted) return
        setLoadingMap(false)
        setLoadError(err?.message || 'Failed to load Google Maps SDK')
      }
    }

    initMap()

    return () => {
      isMounted = false
    }
  }, [apiKey, readOnly, reverseGeocode])

  // Handle Autocomplete Search Query with debouncing
  useEffect(() => {
    if (!searchQuery.trim() || !autocompleteServiceRef.current) {
      setPredictions([])
      return
    }

    const timer = setTimeout(() => {
      setIsSearching(true)
      autocompleteServiceRef.current?.getPlacePredictions(
        {
          input: searchQuery,
          componentRestrictions: { country: 'in' },
        },
        (results: any, status: any) => {
          setIsSearching(false)
          if (status === 'OK' && results) {
            setPredictions(
              results.map((r: any) => ({
                placeId: r.place_id,
                description: r.description,
                mainText: r.structured_formatting.main_text,
                secondaryText: r.structured_formatting.secondary_text,
              }))
            )
          } else {
            setPredictions([])
          }
        }
      )
    }, 280)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Select place from predictions
  const handleSelectPrediction = (pred: AutocompletePrediction) => {
    setSearchQuery(pred.description)
    setPredictions([])

    if (!geocoderRef.current || !mapInstanceRef.current || !markerInstanceRef.current) return

    setIsGeocoding(true)
    geocoderRef.current.geocode(
      { placeId: pred.placeId },
      (results: any, status: any) => {
        setIsGeocoding(false)
        if (status === 'OK' && results && results[0]) {
          const result = results[0]
          const location = result.geometry.location
          const lat = location.lat()
          const lng = location.lng()

          setCurrentCoords({ lat, lng })
          setCurrentAddress(result.formatted_address)

          mapInstanceRef.current?.setCenter(location)
          mapInstanceRef.current?.setZoom(16)
          markerInstanceRef.current?.setPosition(location)

          const parsed = parseAddressComponents(result, lat, lng)
          onLocationSelectRef.current(parsed)
        }
      }
    )
  }

  // Use My Current Location (Geolocation API)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    setIsGeocoding(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCurrentCoords({ lat, lng })

        if (mapInstanceRef.current && markerInstanceRef.current) {
          const latLng = { lat, lng }
          mapInstanceRef.current.setCenter(latLng)
          mapInstanceRef.current.setZoom(16)
          markerInstanceRef.current.setPosition(latLng)
        }

        reverseGeocode(lat, lng)
      },
      (err) => {
        setIsGeocoding(false)
        alert(`Could not fetch your location: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Manual coordinate update fallback
  const handleManualCoordChange = (latVal: string, lngVal: string) => {
    const lat = parseFloat(latVal)
    const lng = parseFloat(lngVal)
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setCurrentCoords({ lat, lng })
      if (mapInstanceRef.current && markerInstanceRef.current) {
        const latLng = { lat, lng }
        mapInstanceRef.current.setCenter(latLng)
        markerInstanceRef.current.setPosition(latLng)
      }
      reverseGeocode(lat, lng)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search & Autocomplete Bar */}
      {!readOnly && (
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search village, city, landmark or address in India..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-amber-500 animate-spin absolute right-3.5 top-3.5" />
              )}
            </div>

            <ClayButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseCurrentLocation}
              disabled={isGeocoding}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"
            >
              <Crosshair className="w-3.5 h-3.5 text-amber-600" />
              Use Current Location
            </ClayButton>
          </div>

          {/* Autocomplete Predictions Dropdown */}
          {predictions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto divide-y divide-gray-50">
              {predictions.map((p) => (
                <button
                  key={p.placeId}
                  type="button"
                  onClick={() => handleSelectPrediction(p)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-amber-50/60 transition-colors flex items-start gap-2.5"
                >
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{p.mainText}</div>
                    <div className="text-xs text-gray-500 truncate">{p.secondaryText}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map Container Viewport */}
      <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-md bg-gray-100 h-64 md:h-72">
        <div ref={mapContainerRef} className="w-full h-full" />

        {loadingMap && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
              Loading interactive Google Maps...
            </div>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 bg-amber-50/90 p-4 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-8 h-8 text-amber-600 mb-2" />
            <div className="text-sm font-semibold text-gray-800 mb-1">Interactive Map Offline</div>
            <div className="text-xs text-gray-600 max-w-sm mb-3">{loadError}</div>
            <ClayButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseCurrentLocation}
              className="text-xs"
            >
              <Compass className="w-3.5 h-3.5 text-amber-600 mr-1" />
              Detect GPS Coordinates
            </ClayButton>
          </div>
        )}

        {/* Map Overlay Badge */}
        {!readOnly && mapLoaded && (
          <div className="absolute bottom-2.5 left-2.5 bg-black/75 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-xs flex items-center gap-1.5 shadow">
            <MapPin className="w-3 h-3 text-amber-400" />
            Click anywhere on map or drag pin to adjust
          </div>
        )}
      </div>

      {/* Selected Coordinates & Address Confirmation Panel */}
      <ClayCard className="p-3.5 bg-white border border-gray-100 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-semibold text-gray-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Confirmed Geographic Location
          </span>
          {isGeocoding && (
            <span className="flex items-center gap-1 text-amber-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              Reverse geocoding...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">
              Latitude
            </span>
            <span className="font-mono font-bold text-gray-800 text-xs">
              {currentCoords.lat.toFixed(7)}
            </span>
          </div>

          <div className="p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">
              Longitude
            </span>
            <span className="font-mono font-bold text-gray-800 text-xs">
              {currentCoords.lng.toFixed(7)}
            </span>
          </div>
        </div>

        {currentAddress && (
          <div className="text-xs text-gray-600 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 leading-relaxed">
            <span className="font-medium text-amber-900 block text-[11px] mb-0.5">
              Reverse Geocoded Address:
            </span>
            {currentAddress}
          </div>
        )}

        {/* Manual coordinate entry when map SDK is offline */}
        {loadError && (
          <div className="pt-2 border-t border-gray-100 flex gap-2">
            <input
              type="number"
              step="any"
              placeholder="Lat (e.g. 18.5204)"
              value={currentCoords.lat}
              onChange={(e) => handleManualCoordChange(e.target.value, String(currentCoords.lng))}
              className="w-1/2 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200"
            />
            <input
              type="number"
              step="any"
              placeholder="Lng (e.g. 73.8567)"
              value={currentCoords.lng}
              onChange={(e) => handleManualCoordChange(String(currentCoords.lat), e.target.value)}
              className="w-1/2 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200"
            />
          </div>
        )}
      </ClayCard>
    </div>
  )
}
