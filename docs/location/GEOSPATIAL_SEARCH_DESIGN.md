# DFarm — Geospatial Search Design

## Overview

The nearby dairy search calculates great-circle distance between the customer's GPS position and registered dairies in the database, returning results sorted nearest-first.

---

## Haversine Implementation

Because PostGIS is not installed in the standard DFarm deployment, distance calculation is performed using the **Haversine formula** implemented directly in PostgreSQL SQL math functions.

### Formula

$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

Where:
- $R = 6371.0\text{ km}$ (mean radius of Earth)
- $\phi_1, \phi_2$ = customer latitude and dairy latitude in radians
- $\Delta\phi = \phi_2 - \phi_1$
- $\Delta\lambda = \lambda_2 - \lambda_1$

### Equivalent Cosine Form (PostgreSQL SQL)

```sql
(
  6371.0 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians($1::double precision))
      * cos(radians(o.latitude::double precision))
      * cos(radians(o.longitude::double precision) - radians($2::double precision))
      + sin(radians($1::double precision))
      * sin(radians(o.latitude::double precision))
    ))
  )
) AS distance_km
```

`LEAST(1.0, GREATEST(-1.0, ...))` prevents numerical precision errors from producing values outside `[-1, 1]`, which would cause `acos()` to return `NaN`.

---

## Bounding-Box Pre-Filter

To avoid running the expensive `acos()` function against every row in the database, a rough bounding box is applied first:

```sql
-- ~111 km per degree of latitude
AND o.latitude BETWEEN ($1::double precision - ($4::double precision / 111.0))
                   AND ($1::double precision + ($4::double precision / 111.0))

-- Longitude degrees shrink by cos(latitude)
AND o.longitude BETWEEN ($2::double precision - ($4::double precision / (111.0 * cos(radians($1::double precision)))))
                    AND ($2::double precision + ($4::double precision / (111.0 * cos(radians($1::double precision)))))
```

This bounding box uses the existing index `idx_organizations_geo` on `(latitude, longitude)`, filtering the candidate set to only dairies in the vicinity before evaluating the exact great-circle distance.

---

## Search Radii

| Mode | Radius | Rationale |
|------|--------|-----------|
| **GPS Proximity** | **5 km** | Default product requirement (1–5 km). Returns dairies within walking or short driving distance of the farmer. |
| **Directory / Text Search** | **150 km** | Applied when no GPS coordinates are provided. Allows searching across a broad regional district. |
| **Override** | `radiusKm` query param | The client may pass `?radiusKm=X` to customize the search radius within bounds. |

---

## Response Contract

**Endpoint:** `GET /api/v1/dairies/nearby`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lat` / `latitude` | `number` | No | — | Customer latitude (-90 to +90) |
| `lng` / `longitude` | `number` | No | — | Customer longitude (-180 to +180) |
| `radiusKm` / `radius` | `number` | No | 5 (with GPS) / 150 (without) | Search radius in km |
| `searchQuery` / `search` / `q` | `string` | No | — | Text search filter |

**Response Format:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "org_kalpna_0119",
      "dairyId": "org_kalpna_0119",
      "name": "kalpna mlik's",
      "dairyName": "kalpna mlik's",
      "code": "DF-SAN-0119",
      "registrationNumber": "DF-SAN-0119",
      "village": "Miraj",
      "district": "Sangli",
      "state": "Maharashtra",
      "contactPhone": "+91 98220 12345",
      "associatedPerson": "Kalpana Patil",
      "adminName": "Kalpana Patil",
      "associatedPersonPhone": "+91 98220 12345",
      "centerId": "center_kalpna_001",
      "centerCode": "KL-01",
      "centerName": "kalpna mlik's Primary Center",
      "latitude": 16.8801100,
      "longitude": 74.4576870,
      "formattedAddress": "Station Road, Miraj, Sangli, Maharashtra 416410, India",
      "distanceKm": 0.85,
      "distanceMeters": 850,
      "distanceLabel": "850 m",
      "isActive": true,
      "discoveryStatus": "ACTIVE"
    }
  ]
}
```

---

## Sorting Rules

1. **When GPS coordinates are provided:** Sorted strictly ascending by `distance_km` (nearest dairy first).
2. **When no GPS coordinates are provided:** Sorted alphabetically ascending by `o.name`.
