# 06 — Customer App Dairy Selection & Offline Protection Audit

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Target:** `apps/dfarm-customer-app` (`dairy-discovery.tsx`, `useDairyDiscovery.ts`)  
**Status:** ENHANCED & VERIFIED  
**Date:** 2026-11-19  

---

## 1. The Vulnerability in Dairy Discovery

In the previous version of the Customer App:
1. `useDairyDiscovery` queried `GET /api/v1/dairies/nearby`.
2. The backend returned dairies based on geographic proximity, with `isActive: true` derived solely from the central `organizations` table.
3. The response lacked `provisioningStatus` and `isOperational` fields.
4. When a dairy had `DB: FAILED` in Super Admin, it was still presented in the Customer App as fully operational with a green radio button.
5. The customer was allowed to select the dairy, spend minutes filling out personal, milk preference, and banking details, only to receive a jarring HTTP 503 error on the final submit button.

---

## 2. Comprehensive Frontend & API Hardening

### 2.1 Backend Contract Enrichment (`dairies.routes.ts`)
The `GET /api/v1/dairies/nearby` endpoint was updated to inspect both the central organization record and the associated `dairy_database_mappings` record:

```typescript
const isOperational = dairy.provisioningStatus !== 'FAILED';
const discoveryStatus = dairy.provisioningStatus === 'FAILED' 
  ? 'PROVISIONING_FAILED' 
  : (dairy.status || 'ACTIVE');

return {
  ...dairy,
  provisioningStatus: dairy.provisioningStatus || 'ACTIVE',
  isOperational,
  discoveryStatus
};
```

### 2.2 Customer App Type Contract (`types/dairy.ts`)
Updated `DairySchema` to include the health attributes:

```typescript
export const DairySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  distanceMeters: z.number().optional(),
  provisioningStatus: z.string().optional(),
  isOperational: z.boolean().optional(),
  discoveryStatus: z.string().optional(),
  // ...other fields
});
```

### 2.3 Visual Status Badge in Dairy Card (`dairy-discovery.tsx`)
In the dairy card list, when a dairy is unprovisioned, a prominent warning badge is rendered:

```tsx
{item.isOperational === false || item.provisioningStatus === 'FAILED' ? (
  <View style={{ marginTop: 4 }}>
    <ClayBadge label="Setup In Progress / डेटाबेस तयार नाही" variant="orange" />
  </View>
) : null}
```

### 2.4 Sticky CTA Protection & Helpful Guidance
If the user selects a dairy whose database is offline:
1. The **Proceed** button is automatically disabled (`disabled={!selectedDairy || isSelectedDairyUnavailable}`).
2. The button label changes from `Proceed to Registration` to `${selectedDairy.name} Setup In Progress`.
3. A contextual helper note appears below the button in English and Marathi:
   > *"This dairy is currently undergoing system setup. Please select another nearby dairy / ही डेअरी सध्या सेटअपमध्ये आहे, कृपया दुसरी डेअरी निवडा."*
4. A defensive safety guard in `handleProceed()` halts execution and alerts the user if an invalid state is triggered.

---

## 3. User Experience Outcome

Customers are now protected upfront against attempting registration with an unprovisioned dairy. They are informed before filling out the form, completely eliminating the HTTP 503 runtime crash on registration submit.
