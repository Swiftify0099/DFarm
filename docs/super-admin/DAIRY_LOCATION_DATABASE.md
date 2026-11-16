# Super Admin Web — Dairy Location Database & API Specification

## 1. Overview

This document details the PostgreSQL schema changes, integrity constraints, spatial composite indexes, and RESTful API endpoints introduced in DFarm to support permanent, accurate geographical coordinates and structured postal addresses for dairy organizations and collection centers.

---

## 2. Database Migration Specification

### File
`supabase/migrations/028_dairy_location_coordinates_and_address.sql`

### 2.1 Table Alterations: `organizations`
The root tenant table `organizations` (which holds all dairy entities) was extended with the following columns:

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS village_locality VARCHAR(150),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS business_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS business_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ DEFAULT NOW();
```

### 2.2 Table Alterations: `dairy_centers`
To allow branch and village-level collection centers to have independent GPS coordinates, the same spatial columns were added to `dairy_centers`:

```sql
ALTER TABLE dairy_centers
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS village_locality VARCHAR(150),
  ADD COLUMN IF NOT EXISTS district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ DEFAULT NOW();
```

### 2.3 Check Constraints (Geographical Bounds)
Strict mathematical boundary checks ensure that impossible or corrupted coordinates cannot be written:
```sql
ALTER TABLE organizations
  ADD CONSTRAINT chk_org_latitude CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
  ADD CONSTRAINT chk_org_longitude CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0));

ALTER TABLE dairy_centers
  ADD CONSTRAINT chk_center_latitude CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
  ADD CONSTRAINT chk_center_longitude CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0));
```

### 2.4 Composite Spatial Indexes
For fast spatial filtering and proximity calculations:
```sql
CREATE INDEX IF NOT EXISTS idx_organizations_location 
  ON organizations (latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dairy_centers_location 
  ON dairy_centers (latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_place_id 
  ON organizations (place_id) 
  WHERE place_id IS NOT NULL;
```

---

## 3. Backend REST API Endpoints

The backend routes in `services/backend/src/presentation/routes/dairies.routes.ts` provide complete lifecycle management for dairy locations:

### 3.1 Create Dairy: `POST /api/v1/dairies`
- **Request Body**:
  ```json
  {
    "name": "Baroda District Co-operative Milk Producers Union",
    "code": "BARODA_MILK",
    "latitude": 22.3072,
    "longitude": 73.1812,
    "formattedAddress": "Baroda Dairy, Makarpura Road, Vadodara, Gujarat 390009",
    "placeId": "ChIJ_3-G-Z_vXzkR2A",
    "addressLine1": "Makarpura Road",
    "villageLocality": "Makarpura",
    "city": "Vadodara",
    "district": "Vadodara",
    "state": "Gujarat",
    "postalCode": "390009",
    "country": "IN",
    "businessPhone": "+91 265 264 2601",
    "businessEmail": "contact@barodadairy.coop"
  }
  ```
- **Validation**: Rejects invalid latitudes ($<-90$ or $>90$) or longitudes ($<-180$ or $>180$) with HTTP 400.
- **Response**: HTTP 201 Created with full entity representation.

### 3.2 Update Dairy Location: `PATCH /api/v1/dairies/:id/location`
- Allows targeted updating of the map pin without resubmitting unrelated administrative data.
- **Request Body**:
  ```json
  {
    "latitude": 22.3120,
    "longitude": 73.1850,
    "formattedAddress": "Updated Main Gate, Makarpura Road, Vadodara",
    "placeId": "ChIJ_3-G-Z_vXzkR2B"
  }
  ```
- **Response**: HTTP 200 OK with updated coordinates and timestamp.

### 3.3 Find Nearby Dairies (Proximity Search): `GET /api/v1/dairies/nearby`
- **Query Parameters**:
  - `lat`: User's latitude (e.g., `22.3000`).
  - `lng`: User's longitude (e.g., `73.1800`).
  - `radiusKm`: Search radius in kilometers (default: `25.0`).
- **Mathematical Formula**:
  Computes great-circle distance using the spherical Haversine formula ($R = 6371\text{ km}$):
  $$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$
  $$c = 2 \cdot \arctan2\left(\sqrt{a}, \sqrt{1-a}\right)$$
  $$d = R \cdot c$$
- **Response**: List of dairies sorted by ascending distance in kilometers:
  ```json
  [
    {
      "id": "dairy-uuid-1",
      "name": "Baroda Dairy",
      "distanceKm": 1.28,
      "latitude": 22.3072,
      "longitude": 73.1812,
      "formattedAddress": "Baroda Dairy, Vadodara"
    }
  ]
  ```

---

## 4. Verification & Migration Registry

Migration 028 is officially registered in `packages/database/src/index.ts` under the migration manifests array:
```typescript
{
  id: '028_dairy_location_coordinates_and_address',
  name: 'Add latitude, longitude, and geocoded address fields to organizations and dairy_centers',
  checksum: 'sha256-...',
  appliedAt: '2026-11-15'
}
```
Validated via `npm run db:validate` (13/13 tests passed).
