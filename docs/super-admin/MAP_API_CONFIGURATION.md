# Google Maps API Setup & Configuration Guide for DFarm Super Admin

## 1. Overview

The DFarm Super Admin application relies on Google Maps Platform services to provide interactive dairy mapping, address autocomplete, coordinate pin dropping, and reverse geocoding. This document details how to configure Google Cloud Platform (GCP), activate the necessary APIs, apply security restrictions, and configure environment variables.

---

## 2. Required Google Cloud APIs

To support the complete functionality of `DairyLocationPicker`, three specific APIs must be enabled within your Google Cloud project:

| API Service | Purpose in DFarm | Required Quota Scope |
|---|---|---|
| **Maps JavaScript API** | Renders the interactive map viewport, terrain controls, and draggable marker pin. | Map Loads (Dynamic Maps) |
| **Places API (New or Legacy)** | Powers real-time search autocomplete for dairy names, villages, and landmarks. | Autocomplete Requests / Place Details |
| **Geocoding API** | Reverse geocodes marker coordinates `(lat, lng)` into structured addresses (village, district, state, PIN). | Geocode Requests |

### Enabling the APIs
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create your DFarm production / staging project (e.g., `dfarm-production`).
3. Open **APIs & Services** > **Library**.
4. Search for each of the three APIs above and click **Enable**.

---

## 3. Creating & Restricting the API Key

Never use an unrestricted API key in production client applications. Because Vite bundles frontend environment variables into client JavaScript, key restrictions are mandatory.

### Step 1: Create the API Key
1. In Google Cloud Console, navigate to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **API Key**.
3. Rename the key to `DFarm Super Admin Web Key`.

### Step 2: Set Application Restrictions (HTTP Referrers)
Select **Websites (HTTP referrers)** and add the authorized hostnames:
- `http://localhost:5173/*` (Local development server)
- `http://localhost:4173/*` (Local Vite preview server)
- `https://admin.dfarm.com/*` (Production Super Admin domain)
- `https://staging-admin.dfarm.com/*` (Staging environment)

### Step 3: Set API Restrictions
Select **Restrict key** under API Restrictions and explicitly select only:
1. Maps JavaScript API
2. Places API
3. Geocoding API

Click **Save**.

---

## 4. Environment Variable Configuration

### Local Environment Setup
Create or update `apps/dfarm-super-admin/.env.local`:
```bash
# Google Maps Platform API Key for Dairy Location Mapping
VITE_GOOGLE_MAPS_API_KEY=AIzaSyYourActualSecretKeyHere_123456789
```

### Reference Example (`.env.example`)
The repository includes a template file at `apps/dfarm-super-admin/.env.example`:
```bash
# Google Maps API Key for Super Admin Dairy Location Picker
# Enable: Maps JavaScript API, Places API, Geocoding API
# Restrict to your domain or localhost:5173
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

---

## 5. Error Handling & Diagnostics

The `DairyLocationPicker` component implements defensive error handling for all standard Google Maps failure codes:

| Error Condition | Detection in DFarm | User-Facing Fallback Behavior |
|---|---|---|
| **Missing API Key** | `!apiKey || apiKey.startsWith('your_')` | Banner alert displayed. Map canvas is hidden; manual numeric coordinate (`lat`, `lng`) and text address fields are automatically presented. |
| **RefererNotAllowedMapError** | Google loader rejection | Informative warning displayed in development console. Manual fallback mode engaged. |
| **ApiNotActivatedMapError** | Google loader rejection | Instructions logged to enable Places or Geocoding APIs in Google Cloud Console. |
| **Geolocation Denied** | `navigator.geolocation` error callback | Notification: `"Location permission denied. Please search or click on the map."` |
| **Zero Geocoding Results** | Geocoder status `ZERO_RESULTS` | Coordinates are preserved; address text fields remain editable for manual input. |
