# DFarm — Dairy Location Persistence

## Overview

Each Dairy (organization) stores a full geographical record in the `organizations` table. Location data is set during Super Admin onboarding via the `DairyLocationPicker` map component, and can be updated at any time via the PATCH location endpoint.

---

## Database Schema

**Table: `organizations`** — Added by migration `028_dairy_location_co*.sql`

| Column | Type | Constraint | Description |
|--------|------|------------|-------------|
| `latitude` | `NUMERIC(10,7)` | `CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0))` | WGS-84 latitude |
| `longitude` | `NUMERIC(10,7)` | `CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0))` | WGS-84 longitude |
| `formatted_address` | `TEXT` | nullable | Full reverse-geocoded address string |
| `place_id` | `VARCHAR(255)` | nullable | Google Maps Place ID |
| `address_line1` | `TEXT` | nullable | Street / premises address |
| `village_locality` | `VARCHAR(100)` | nullable | Village or locality name |
| `city` | `VARCHAR(100)` | nullable | City / town |
| `district` | `VARCHAR(100)` | nullable | Administrative district |
| `state` | `VARCHAR(100)` | nullable | State name |
| `postal_code` | `VARCHAR(20)` | nullable | PIN code |
| `country` | `VARCHAR(100)` | default `'India'` | Country |
| `location_updated_at` | `TIMESTAMPTZ` | nullable | Last coordinate update timestamp |

**Spatial Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_organizations_geo
ON organizations (latitude, longitude)
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);
```

This partial index is used by the Haversine bounding-box pre-filter in `GetNearbyDairiesUseCase`.

---

## Coordinate Validation Rules

| Rule | Enforcement |
|------|-------------|
| Latitude: -90 to +90 | PostgreSQL CHECK constraint + backend validation |
| Longitude: -180 to +180 | PostgreSQL CHECK constraint + backend validation |
| Coordinates (0, 0) | Excluded from GPS proximity search via `o.latitude <> 0 AND o.longitude <> 0` |
| NULL coordinates | Excluded from GPS proximity search; shown in text-search/all-areas mode |
| Out-of-range rejected | Backend returns HTTP 400 at `dairies.routes.ts` lines 819–827 |

---

## Super Admin Location Flow

1. Admin opens **Create Dairy** modal in the Super Admin app
2. **Step 1 (Business Profile)** embeds the `DairyLocationPicker` React component
3. Admin can interact via:
   - **Autocomplete search** — type a place name, select from suggestions
   - **Map click** — click any point on the Google Map
   - **Marker drag** — drag the red pin to precise location
   - **GPS detect** — use browser location for current admin position
   - **Manual entry** — type coordinates when map is offline
4. Each interaction triggers `reverseGeocode(lat, lng)` → `onLocationSelect(locationData)`
5. `CreateDairyModal.handleLocationSelect()` calls `setValue()` for all 9 location fields via react-hook-form
6. On form submit, all fields are included in the POST body to `POST /api/v1/dairies`

**INSERT SQL (dairies.routes.ts lines 994–1019):**
```sql
INSERT INTO organizations (
  id, name, code, status,
  latitude, longitude, formatted_address, place_id,
  address_line1, village_locality, city, district, state,
  postal_code, country, business_phone, business_email,
  location_updated_at
) VALUES (
  $1, $2, $3, 'ACTIVE',
  $4, $5, $6, $7,
  $8, $9, $10, $11, $12,
  $13, 'India', $14, $15,
  NOW()
);
```

---

## Updating Location After Creation

**Endpoint:** `PATCH /api/v1/dairies/:id/location`

**Request Body:**
```json
{
  "latitude": 16.8801100,
  "longitude": 74.4576870,
  "formattedAddress": "Station Road, Miraj, Sangli, Maharashtra 416410, India",
  "placeId": "ChIJ_example",
  "addressLine1": "Station Road",
  "villageLocality": "Miraj",
  "district": "Sangli",
  "state": "Maharashtra",
  "pincode": "416410"
}
```

Uses `COALESCE($n, existing_column)` — only provided fields are updated.  
Also propagates coordinates to all `dairy_centers` belonging to the organization.

---

## Verification After Save

```
GET /api/v1/dairies/:id
```

Response `data.location`:
```json
{
  "latitude": 16.8801100,
  "longitude": 74.4576870,
  "formattedAddress": "Station Road, Miraj, Sangli, Maharashtra 416410, India",
  "placeId": "ChIJ_example",
  "addressLine1": "Station Road",
  "villageLocality": "Miraj",
  "district": "Sangli",
  "state": "Maharashtra",
  "pincode": "416410"
}
```
