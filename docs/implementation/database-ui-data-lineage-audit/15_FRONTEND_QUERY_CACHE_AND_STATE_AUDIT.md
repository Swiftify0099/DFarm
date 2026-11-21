# DFARM — FRONTEND QUERY CACHE AND STATE AUDIT
## REACT QUERY KEYS, STALE TIMES, LOCAL CACHE & STORAGE PURGING

**Audit Reference:** `DFARM-AUDIT-CACHE-STATE-001`  
**Date:** 2026-11-18  

---

### 1. React Query Key & Cache Scope Inventory

| Application | Query Key Pattern | Cache TTL (staleTime) | Invalidation Event | Sensitive Storage Location |
|---|---|---|---|---|
| **Customer App** | `['profile', customerId]` | 5 minutes | Profile Edit Mutation | Expo SecureStore (`accessToken`, `dairyId`) |
| **Customer App** | `['collection', 'history', limit]` | 30 seconds | Pull-to-refresh | None (In-memory React Query cache) |
| **Customer App** | `['ledger', 'statement']` | 30 seconds | Pull-to-refresh | None |
| **Customer App** | `['bills', 'my-bills']` | 10 minutes | Manual refresh | None |
| **Dairy Admin** | `['customers', 'pending']` | 10 seconds | Approve/Reject Mutation | Browser `localStorage` (`dfarm_admin_session_token`) |
| **Dairy Admin** | `['collection', 'sessions']` | 15 seconds | Session Open/Close | Browser `localStorage` |
| **Dairy Admin** | `['payment', 'batches']` | 30 seconds | Batch Creation/Approval | Browser `localStorage` |
| **Collection App**| `['customers', 'lookup']` | 1 hour | Sync Pulse | IndexedDB (`customers_cache`) |
| **Collection App**| `['offline_queue']` | Real-time | LocalDB Transaction Write | IndexedDB (`offline_queue`) |
| **Super Admin** | `['super-admin', 'dairies']` | 1 minute | Onboard Dairy Mutation | Browser `localStorage` (`dfarm_super_admin_session`) |

---

### 2. Cache Invalidation & Multi-Tenant Safety Invariants

1. **User Switching & Token Purging:**
   - When a user logs out in `dfarm-dairy-admin`, `clearStoredAuth()` immediately clears `dfarm_admin_session_token` and `dfarm_admin_tenant_id`.
   - Query client cache is explicitly cleared to prevent cross-account data leaks.
2. **Defect DFARM-AUDIT-009 (Customer Passbook Polling Lag):**
   - The Customer App uses passive polling and pull-to-refresh. It lacks an active WebSocket subscription to kiosk intake completions.
