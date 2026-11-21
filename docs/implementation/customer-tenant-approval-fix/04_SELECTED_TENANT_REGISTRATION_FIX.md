# Selected Tenant Database Customer Registration Repair

**Document Reference:** `docs/implementation/customer-tenant-approval-fix/04_SELECTED_TENANT_REGISTRATION_FIX.md`  
**Execution Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Problem Statement

Previously, customer registrations submitted through `apps/dfarm-customer-app` did not guarantee storage into the authoritative physical database of the selected dairy. In development mode, `TenantDatabaseManager` fell back to `getControlPlaneDb()`, causing customer records to be written into the control plane rather than the isolated tenant database.

Furthermore, if the selected dairy's database provisioning status was `FAILED`, the registration route silently ignored the failure, leaving the farmer in limbo on `PENDING_APPROVAL` with no physical tenant record.

---

## 2. Key Code Modifications

### 2.1 Backend Route Hardening (`services/backend/src/presentation/routes/customers.routes.ts`)

Added proactive pre-flight check for tenant database status:

```typescript
// Strict Tenant Database Availability Verification
const tenantMapping = tenantDbManager.getTenantMapping(targetOrgId);
if (tenantMapping && tenantMapping.provisioningStatus === 'FAILED') {
  res.status(503).json({
    success: false,
    code: 'TENANT_DATABASE_UNAVAILABLE',
    error: `Selected dairy tenant database (${tenantMapping.dairyCode}) is unavailable (provisioning status: FAILED). Customer registration cannot proceed until database provisioning is resolved.`,
    data: {
      dairyId: targetOrgId,
      dairyCode: tenantMapping.dairyCode,
      provisioningStatus: tenantMapping.provisioningStatus,
      provisioningError: tenantMapping.provisioningError,
    },
  });
  return;
}
```

And in the catch block:
```typescript
} catch (err: any) {
  if (err?.name === 'TenantDatabaseUnavailableError' || err?.message?.includes('Tenant database')) {
    res.status(503).json({
      success: false,
      code: 'TENANT_DATABASE_UNAVAILABLE',
      error: err.message || 'The selected dairy tenant database is unavailable.',
    });
    return;
  }
  next(err);
}
```

### 2.2 Removal of Unsafe Fallback (`TenantDatabaseManager.ts`)

In `TenantDatabaseManager.getTenantDb(dairyId)`:
```typescript
if (mapping && mapping.provisioningStatus === 'FAILED') {
  throw new TenantDatabaseUnavailableError(
    dairyId,
    'FAILED',
    mapping.provisioningError || 'Tenant database provisioning failed'
  );
}

if (!mapping || mapping.provisioningStatus !== 'ACTIVE') {
  if (mapping?.provisioningStatus === 'PROVISIONING' || mapping?.provisioningStatus === 'MIGRATING' || mapping?.provisioningStatus === 'VERIFYING') {
    throw new TenantDatabaseUnavailableError(dairyId, mapping.provisioningStatus, 'Tenant database is currently being provisioned');
  }
  // Control plane fallback strictly blocked for operational customer data
  throw new Error(`No active persistent database mapping found for dairy: ${dairyId}`);
}
```

### 2.3 Customer App Error Handling (`apps/dfarm-customer-app`)

In `apps/dfarm-customer-app/src/app/(onboarding)/face-enroll.tsx`:
- When backend returns `TENANT_DATABASE_UNAVAILABLE` (HTTP 503), the error is caught by `face-enroll.tsx`.
- Form state, personal details, and captured vectors are retained in form state.
- User is alerted via `Alert.alert('Registration Error', msg)` and navigation to `/pending-approval` is blocked.
- Farmer can safely retry without losing typed data once the dairy database is recovered.

---

## 3. Verification & Proof

- Subtest 1 in `customer-tenant-approval-e2e.test.js` verified that when Warna Milk's tenant database is in `FAILED` state, `POST /customers/register` returns:
  - `status: 503`
  - `code: TENANT_DATABASE_UNAVAILABLE`
  - Zero records inserted into any database.
- Subtest 3 verified that once the database transitions to `ACTIVE`, registration succeeds (`HTTP 201 Created`), customer record is created strictly in `dfarm_tenant_df_san_2395_389186304fee`, and `customer_dairy_memberships` is synchronized.
