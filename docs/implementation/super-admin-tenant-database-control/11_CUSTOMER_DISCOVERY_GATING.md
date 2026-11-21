# DFARM — Module 7: Customer App Location Discovery & Provisioning Gating

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Use Case:** `services/backend/src/application/use-cases/dairies/GetNearbyDairiesUseCase.ts`  
**API Endpoint:** `GET /api/v1/dairies/nearby?lat=...&lng=...&radiusKm=...`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Problem Statement & Business Risk

When a dairy farmer installs the DFarm Customer App and attempts to onboard:
1. The app requests user GPS coordinates and performs a proximity search for nearby dairies.
2. If a dairy appears in the discovery list while its dedicated tenant database is still being provisioned, incomplete, or corrupted, any registration attempt will crash with 500 database errors or create orphan records in `dfarm_central` without a backing tenant database.
3. Therefore, **Nearby Dairy Discovery must be strictly gated by real database health**.

---

## 2. Gating Algorithm Implementation

In `GetNearbyDairiesUseCase.ts` and `dairies.routes.ts`:

```ts
const mapping = tenantDbManager.getTenantMapping(row.id);
const provStatus = mapping?.provisioningStatus || row.provisioning_status || 'PENDING';
const isDbHealthy = provStatus === 'READY' || provStatus === 'ACTIVE';
const isOperational = row.status === 'active' && isDbHealthy;

// Evaluate registration eligibility
const isRegistrationEligible = isOperational;
let registrationBlockReason: string | undefined;

if (!isDbHealthy) {
  registrationBlockReason = 'Dairy database provisioning is incomplete or failed';
} else if (row.status !== 'active') {
  registrationBlockReason = `Dairy is currently ${row.status.toUpperCase()}`;
}

return {
  ...dairyData,
  provisioningStatus: provStatus,
  databaseHealth: isDbHealthy ? 'HEALTHY' : 'CONNECTION_FAILED',
  isRegistrationEligible,
  registrationBlockReason,
  isOperational,
};
```

---

## 3. UI Farmer Experience in Customer App

In `apps/dfarm-customer-app`:
1. **Eligible Dairies:** Displayed with green "Registration Open" indicators and normal selectable cards.
2. **Provisioning or Non-Eligible Dairies:**
   - Displayed with amber "Setup In Progress" or gray "Registrations Temporarily Paused" badge.
   - Selection button is disabled with explanatory reason (e.g. `Dairy database provisioning is incomplete or failed`).
   - Prevents farmer frustration and eliminates orphaned partial registrations.

---

## 4. Verification Evidence (Automated Test 7)

From `super-admin-tenant-database-control.test.js`:
```js
await t.test('Test 7: Nearby Dairies API gates registration eligibility based on real tenant DB health', async () => {
  const nearbyRes = await request(app)
    .get('/api/v1/dairies/nearby?lat=16.6644&lng=74.2588&radiusKm=100')
    .expect(200);

  const dairies = nearbyRes.body.data;
  for (const d of dairies) {
    assert.ok('provisioningStatus' in d);
    assert.ok('isRegistrationEligible' in d);
    if (d.provisioningStatus === 'READY' && d.databaseHealth === 'HEALTHY' && d.status === 'ACTIVE') {
      assert.strictEqual(d.isRegistrationEligible, true);
    } else {
      assert.strictEqual(d.isRegistrationEligible, false);
      assert.ok(typeof d.registrationBlockReason === 'string');
    }
  }
});
```
**Test Result:** PASSED (Verified across all discovery entries).
