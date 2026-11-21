# DFARM — CUSTOMER APP ENROLLMENT & DIAGNOSTICS TEST FIX

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `03_CUSTOMER_APP_ENROLLMENT_AND_TEST_FIX`  
**Status:** FIXED & VERIFIED  

---

## 1. Problem Description

When customers opened Customer App (`apps/dfarm-customer-app`), navigated to the Profile tab, and clicked **"Test Face"** (or attempted biometric diagnostics), the application abruptly redirected to the Home Dashboard (`/(main)/index`) instead of opening the diagnostics camera screen.

Furthermore, read-only testing against the enrolled face template was unavailable or returned route errors.

---

## 2. Root Cause: Tab Navigation & Routing Failure

In Expo Router, the tab bar was defined in `apps/dfarm-customer-app/src/app/(main)/_layout.tsx`:
```tsx
<Tabs.Screen
  name="profile/index"
  options={{
    title: 'Profile',
    tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
  }}
/>
```

When `router.push('/(main)/profile/diagnostics')` was triggered:
1. Expo Router looked for a route named `profile/diagnostics` inside the main tab group.
2. Because `profile` was not configured as a nested Stack router, the router could not resolve the sibling file `apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx`.
3. Expo Router reverted unhandled push destinations to the initial tab route: `/(main)/index` (Home Dashboard).

---

## 3. Structural Routing Fix

### 3.1 Created Profile Sub-Router Stack
Created `apps/dfarm-customer-app/src/app/(main)/profile/_layout.tsx`:
```tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen name="diagnostics" options={{ title: 'Face Sensor Diagnostics' }} />
      <Stack.Screen name="update-face" options={{ title: 'Update Biometrics' }} />
    </Stack>
  );
}
```

### 3.2 Registered Clean Profile Tab
Updated `apps/dfarm-customer-app/src/app/(main)/_layout.tsx`:
```tsx
<Tabs.Screen
  name="profile"
  options={{
    title: 'Profile',
    headerShown: false,
    tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
  }}
/>
```

This properly mounts the Profile Stack within the Tab navigator, enabling smooth push/pop transitions to `/profile/diagnostics` and `/profile/update-face`.

---

## 4. Read-Only 1:1 Diagnostic Test Pipeline

In `services/backend/src/presentation/routes/identity.routes.ts`:
Added dedicated 1:1 match evaluation when `targetCustomerId` (or `customerId`) is provided:

```typescript
if (targetCustomerId) {
  const targetCustomer = await customerRepo.findById(targetCustomerId, orgId);
  if (!targetCustomer) {
    res.status(404).json({ success: false, error: 'Target customer not found' });
    return;
  }

  const enrollment = await customerRepo.getFaceEnrollment(targetCustomer.id, orgId);
  if (!enrollment || !enrollment.embedding) {
    res.json({
      success: true,
      isMatch: false,
      status: 'ENROLLMENT_NOT_FOUND',
      similarity: 0,
      threshold: 0.363,
    });
    return;
  }

  const sim = cosineSimilarity(embedding, enrollment.embedding);
  const isMatch = sim >= 0.363;

  res.json({
    success: true,
    isMatch,
    status: isMatch ? 'FACE_MATCHED' : 'FACE_NOT_MATCHED',
    similarity: Math.round(sim * 10000) / 10000,
    threshold: 0.363,
    matchedCustomer: isMatch
      ? {
          id: targetCustomer.id,
          globalCustomerId: targetCustomer.globalCustomerId,
          farmerCode: targetCustomer.farmerCode,
          fullName: targetCustomer.fullName,
        }
      : null,
  });
  return;
}
```

---

## 5. Verification Results

1. **Routing Verification:** Executed `npx tsc --noEmit` in `apps/dfarm-customer-app` with 0 type errors. Screen routing navigates directly to `Face Sensor Diagnostics`.
2. **Matching Verification:** Subtest 4 of `face-1n-recognition-customer-ledger-e2e.test.js` verified:
   - Probe vector matching enrolled face returns `isMatch: true`, `status: 'FACE_MATCHED'`, and `similarity: 0.9999 >= 0.363`.
   - Distinct non-matching probe returns `isMatch: false`, `status: 'FACE_NOT_MATCHED'`, and `similarity: 0.0955 < 0.363`.
   - Zero changes made to enrolled templates during test mode (read-only verification).

---
*Signed & Verified by DFARM Architectural Engineering Team*
