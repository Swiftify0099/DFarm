# Super Admin Web — Dairy Location Picker Architecture & Guide

## 1. Overview & Architectural Role

The `DairyLocationPicker` component (`apps/dfarm-super-admin/src/features/dairies/DairyLocationPicker.tsx`) is an interactive geographic location selector designed for the DFarm Super Admin portal. It provides accurate spatial positioning for new and existing dairy organizations, ensuring that dairy collection centers have permanent, validated GPS coordinates (`latitude`, `longitude`) and structured postal address components saved to PostgreSQL.

```
+---------------------------------------------------------------------------------------------------+
|                                     DAIRY LOCATION PICKER UI                                      |
|                                                                                                   |
|  [ Search Address / Landmark in Google Places Autocomplete... ] [ 📍 Use Current Location ]       |
|  ------------------------------------------------------------------------------------------------ |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |  GOOGLE MAPS JAVASCRIPT VIEWPORT (Interactive Canvas)                                       |  |
|  |                                                                                             |  |
|  |                              📍 [Draggable Pin Marker]                                      |  |
|  |                              lat: 28.6139, lng: 77.2090                                     |  |
|  |                                                                                             |  |
|  |                     (Click anywhere on map to drop or reposition pin)                        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  [ COORDINATE & ADDRESS CONFIRMATION CARD ]                                                       |
|  - Latitude: 28.613900 | Longitude: 77.209000                                                     |
|  - Address: Anand Milk Union Limited, Dairy Road, Anand, Gujarat 388001, India                     |
|  - Reverse Geocoded: Village: Anand, City: Anand, State: Gujarat, PIN: 388001                     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Technical Capabilities & Features

### 2.1 Modern `@googlemaps/js-api-loader` v2 Integration
Rather than using deprecated global `<script>` tags or obsolete loader classes (`new Loader({...})` has been removed in v2), the component utilizes Google's official functional API:
```typescript
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

setOptions({
  key: apiKey,
  libraries: ['places', 'geometry'],
});

const [{ Map }, { AdvancedMarkerElement, Marker }, { Geocoder }, { AutocompleteService, PlacesService }] = 
  await Promise.all([
    importLibrary('maps'),
    importLibrary('marker'),
    importLibrary('geocoding'),
    importLibrary('places'),
  ]);
```
This guarantees tree-shaking, lazy loading, and full TypeScript type safety with `@types/google.maps`.

### 2.2 Google Places Autocomplete Search
- As the administrator types a dairy name, landmark, or village, an Autocomplete search queries the Google Places API.
- Results are debounced (300ms) to conserve API quotas.
- Selecting a prediction immediately:
  1. Pans and smoothly zooms the map to the target location (`map.panTo(...)`, `map.setZoom(16)`).
  2. Centers the draggable marker pin at the selected coordinates.
  3. Extracts place ID, formatted address, and individual administrative components.

### 2.3 Interactive Draggable Marker & Pin Dropping
- **Draggable Marker**: The marker can be dragged across the terrain. When released (`dragend` event), new coordinates are captured.
- **Click to Drop**: Clicking anywhere on the map canvas moves the pin directly to the clicked point and triggers reverse geocoding.
- Coordinates are validated to ensure they lie within standard geographical boundaries:
  - Latitude: $[-90.000000, 90.000000]$
  - Longitude: $[-180.000000, 180.000000]$

### 2.4 One-Click "Use Current Location" (HTML5 Geolocation)
- An intuitive button allows the admin to auto-detect their current field location using `navigator.geolocation.getCurrentPosition`.
- High accuracy is requested (`enableHighAccuracy: true`, `timeout: 10000`).
- If granted, the map centers on the device's GPS position, drops the pin, and executes reverse geocoding.

### 2.5 Automated Reverse Geocoding
Whenever coordinates change (via drag, click, or geolocation), the Google Geocoder service resolves the coordinates to a physical address:
- `address_line1`: Street name and premises number.
- `village_locality`: Village, sublocality, or neighborhood name.
- `city`: Locality or postal town.
- `district`: Administrative area level 2 (district).
- `state`: Administrative area level 1 (state/province).
- `postal_code`: Postal / ZIP code.
- `country`: Country code (e.g., `'IN'`).
- `formatted_address`: Complete human-readable postal address string.

### 2.6 Graceful Fallback Mode (Zero Broken UI)
If the Google Maps API key is unconfigured, network requests are blocked, or quota is exceeded:
- The component displays an informative banner: `"Google Maps API Key not detected. Operating in manual address entry mode."`
- Numeric latitude and longitude input fields allow manual coordinate entry.
- Standard address text inputs allow complete address entry without blocking the dairy registration workflow.

---

## 3. Component Integration Points

### 3.1 New Dairy Creation (`CreateDairyModal.tsx`)
In Step 1 ("Basic Details & Location") of the dairy creation modal:
```tsx
<DairyLocationPicker
  initialLatitude={formData.latitude}
  initialLongitude={formData.longitude}
  initialAddress={formData.formattedAddress}
  onLocationSelect={(loc) => {
    setFormData((prev) => ({
      ...prev,
      latitude: loc.latitude,
      longitude: loc.longitude,
      formattedAddress: loc.formattedAddress,
      placeId: loc.placeId,
      villageLocality: loc.villageLocality,
      city: loc.city,
      district: loc.district,
      state: loc.state,
      postalCode: loc.postalCode,
      country: loc.country,
    }));
  }}
/>
```

### 3.2 Dairy Detail & Location Management (`DairyDetailPage.tsx`)
- Displays an interactive location card showing the permanent coordinates, Google Maps deep-link, and address components.
- Super Admins can update the location or drag the pin to adjust spatial boundaries.
