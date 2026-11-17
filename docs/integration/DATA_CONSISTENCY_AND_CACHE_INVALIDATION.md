# DFARM — Data Consistency & Cache Invalidation Strategy

**Document Reference:** `docs/integration/DATA_CONSISTENCY_AND_CACHE_INVALIDATION.md`  
**Classification:** Distributed State & Synchronization Architecture  
**Status:** Landed & Verified  

---

## 1. Multi-Tier Cache Scoping

In a multi-tenant, multi-application platform like DFARM, cache pollution across different tenant sessions or stale state between mobile and web applications must be eliminated.

### 1.1 Tenant-Partitioned React Query Keys
In Dairy Admin Web, all React Query keys include the authenticated administrator's `dairyId`:

```tsx
// Pattern: [resourceDomain, user?.dairyId, ...optionalFilters]
queryKey: ['customers', user?.dairyId, showDeleted]
queryKey: ['pendingRegistrations', user?.dairyId]
queryKey: ['faceEnrollments', user?.dairyId]
queryKey: ['rfidCards', user?.dairyId]
queryKey: ['collectionSessions', user?.dairyId]
queryKey: ['collectionTransactions', user?.dairyId]
queryKey: ['dashboardSummary', user?.dairyId]
```

### 1.2 Logout & Tenant Transition Hook
When an administrator logs out or switches tenants, `clearStoredAuth()` purges the `localStorage` keys, and the application invalidates the complete React Query cache tree:
```ts
queryClient.clear();
```

---

## 2. Event-Driven Cache Invalidation Matrix

When an administrative or collection action is performed, affected queries across the system are atomically invalidated:

| Trigger Action | Primary Endpoint | Invalidated Query Keys | Resulting UI Refresh |
| :--- | :--- | :--- | :--- |
| **Approve Registration** | `POST /customers/:id/approve` | `['pendingRegistrations']`<br>`['customers']`<br>`['dashboardSummary']` | Pending request disappears; Customer appears in Directory; Dashboard pending count decrements and active count increments. |
| **Reject Registration** | `POST /customers/:id/reject` | `['pendingRegistrations']`<br>`['dashboardSummary']` | Request removed from pending list; Dashboard counter decrements. |
| **Assign RFID Card** | `POST /rfid/assign` | `['rfidCards']`<br>`['customers']` | Card marked `ACTIVE` with farmer name; Customer record reflects `rfidAssigned: true`. |
| **Mark RFID Lost** | `POST /rfid/mark-lost` | `['rfidCards']`<br>`['customers']` | Card status becomes `LOST`; Customer unlinked. |
| **Milk Intake Recorded** | `POST /collections/transactions` | `['collectionTransactions']`<br>`['collectionSessions']`<br>`['customerLedger']`<br>`['dashboardSummary']` | Transaction register updates; Shift session totals increment; Farmer khata reflects credit. |
| **Weight Adjustment** | `POST /collections/transactions/:id/adjust`| `['collectionTransactions']`<br>`['customerLedger']`<br>`['dashboardSummary']` | Transaction shows `ADJUSTED`; Ledger diff entry posted; Dashboard revenue adjusted. |
| **Close Shift Session** | `POST /collections/sessions/close` | `['collectionSessions']`<br>`['dashboardSummary']` | Session status transitions to `CLOSED`. |

---

## 3. Offline Synchronization & Idempotency Guarantee

Collection kiosks operate in rural environments where internet connectivity can be intermittent:
1. **Local Offline Queue:** Milk collections taken during offline periods are written to the browser's IndexedDB / Dexie offline queue.
2. **Deterministic Idempotency Key:** Each collection generates an idempotency key combining `deviceId`, `clientIntakeUuid`, and timestamp:
   ```
   idempotencyKey = "KIOSK01_f81d4fae-7dec-11d0-a765-00a0c91e6bf6"
   ```
3. **Database Unique Constraint:** `milk_collections` defines a unique constraint on `idempotency_key`. If the kiosk resubmits an already-committed transaction upon reconnection:
   - The backend catches constraint error `23505`.
   - Returns HTTP 200 with `isIdempotentReplay: true` and the existing receipt number.
   - Zero double-intake, zero duplicate credit to the farmer's khata.
