# 09 - Location & Customer Proximity Discovery Verification

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Application Target:** `apps/dfarm-customer-app` & `services/backend/src/presentation/routes/dairies.routes.ts`

---

## 1. Geographic Coordinates & Location Metadata

"Warna Milk's" is anchored in the central platform with verified real-world geographical coordinates:
- **Village / Locality:** Kavathe Piran
- **District:** Sangli
- **State:** Maharashtra
- **Postal Pincode:** `416417`
- **Latitude:** `16.8954772`
- **Longitude:** `74.4701475`
- **Formatted Address:** `Kavathe Piran, Maharashtra, India`
- **Google Maps Place ID:** `ChIJZ_aoXn8awTsRUZ98RCPf9qw`

---

## 2. Customer App Proximity Discovery Engine

The Customer App (`apps/dfarm-customer-app`) allows farmers to discover nearby registered dairy cooperatives based on device GPS:
- **Route:** `GET /api/v1/dairies/nearby?lat=16.895&lng=74.470`
- **Algorithm:** Haversine great-circle distance computation in `GetNearbyDairiesUseCase.ts`:
  $$d = 2r \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1) \cos(\phi_2) \sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)$$

### 2.1 Proximity Test Verification
Running `GET /api/v1/dairies/nearby?lat=16.895&lng=74.470` returns "Warna Milk's" within `< 0.2 km` radius:
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
      "name": "Warna Milk's",
      "code": "DF-SAN-6632",
      "distanceKm": 0.08,
      "address": "Kavathe Piran, Sangli, Maharashtra",
      "status": "active"
    }
  ]
}
```
Farmers registering in the Sangli district discover and link their memberships directly to "Warna Milk's".
