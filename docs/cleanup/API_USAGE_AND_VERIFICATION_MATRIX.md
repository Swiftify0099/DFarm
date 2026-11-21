# DFarm API Usage and Verification Matrix

**Document Version**: 1.0  
**Status**: Platform-Wide Verification Matrix  
**Auditor**: DFarm Production Readiness Engineering

---

## 1. Classification Categories

1. **Implemented & Genuinely Used**: Real endpoint, connected to frontend, persisting to/reading from database.
2. **Implemented but Not Connected**: Backend route exists and works, but frontend was previously delegating to mock data.
3. **Connected but Returning Fake/Static Data**: Connected endpoint has hardcoded fallback responses.
4. **Connected but Reading Wrong Source**: Misconfigured parameters or wrong table joins.
5. **Broken**: Endpoint throws unhandled errors or fails validation.
6. **Duplicate**: Redundant endpoints performing the same task.
7. **Unused**: Endpoints created for future features not currently surfaced in UI.
8. **Missing**: UI requires an endpoint that is not yet implemented in backend.

---

## 2. Platform API Verification Matrix

| App | Module / Feature | Endpoint | Method | Auth | Roles / Tenant | Frontend Caller | Backend Route / Controller | Database Source | Status | Action Required |
|---|---|---|---|---|---|---|---|---|---|---|
| **Customer** | Auth: Request OTP | `/api/v1/auth/request-otp` | POST | None | Public | `features/auth/useAuth.ts:requestOtp` | `presentation/routes/auth.routes.ts` | `users` / Dove SMS | Verified | None (Verified) |
| **Customer** | Auth: Verify OTP | `/api/v1/auth/verify-otp` | POST | None | Public | `features/auth/useAuth.ts:verifyOtp` | `presentation/routes/auth.routes.ts` | `users`, `jwt` | Verified | None (Verified) |
| **Customer** | Dairy Discovery | `/api/v1/dairies/nearby` | GET | None | Public | `features/dairy/useDairyDiscovery.ts` | `presentation/routes/dairies.routes.ts` | `organizations`, `dairy_centers` | Verified | Remove mock fallback list |
| **Customer** | Registration | `/api/v1/customers/register` | POST | Bearer | Customer | `features/registration/useRegistration.ts` | `presentation/routes/customers.routes.ts` | `customers`, `customer_addresses` | Verified | Remove fake success synthesis |
| **Customer** | Registration Status | `/api/v1/customers/:id/status` | GET | Bearer | Customer | `features/registration/useRegistration.ts` | `presentation/routes/customers.routes.ts` | `customers`, `organizations` | Verified | Remove fake fallback status |
| **Customer** | Profile Details | `/api/v1/customers/me` or `/customers/:id` | GET | Bearer | Customer | `features/profile/useProfile.ts` | `presentation/routes/customers.routes.ts` | `customers`, `organizations` | Verified | Remove fake Vitthal Patil fallback |
| **Customer** | Biometrics Update | `/api/v1/customers/:id/biometrics/update` | POST | Bearer | Customer | `features/profile/useProfile.ts` | `presentation/routes/customers.routes.ts` | `face_enrollments` | Verified | None |
| **Customer** | Collection History | `/api/v1/collections/history` | GET | Bearer | Customer | `features/collection/useCollection.ts` | `presentation/routes/collections.routes.ts` | `milk_collections` | Verified | Remove fake collection records |
| **Customer** | Monthly Summary | `/api/v1/collections/summary/monthly` | GET | Bearer | Customer | `features/collection/useCollection.ts` | `presentation/routes/collections.routes.ts` | `milk_collections` aggregate | Verified | Remove fake 382.4L fallback |
| **Customer** | Ledger Entries | `/api/v1/ledger/entries` | GET | Bearer | Customer | `features/ledger/useLedger.ts` | `presentation/routes/ledger.routes.ts` | `customer_subledger_entries` | Verified | Remove fake l1-01 entries |
| **Customer** | Ledger Khata Summary | `/api/v1/ledger/summary` | GET | Bearer | Customer | `features/ledger/useLedger.ts` | `presentation/routes/ledger.routes.ts` | `customer_ledger_accounts` | Verified | Remove fake ₹12,480 fallback |
| **Customer** | Bills & Statements | `/api/v1/bills` | GET | Bearer | Customer | `features/bills/useBills.ts` | `presentation/routes/bills.routes.ts` | `billing_settlements`, `milk_collections` | Verified | Remove fake b1-01 statements |
| **Collection** | Operator Auth Request | `/api/v1/auth/operator/otp/request` | POST | None | Public | `api/client.ts:authApi.requestOtp` | `presentation/routes/auth.routes.ts` | `users` / Dove SMS | Verified | None |
| **Collection** | Operator Auth Verify | `/api/v1/auth/operator/otp/verify` | POST | None | Public | `api/client.ts:authApi.verifyOtp` | `presentation/routes/auth.routes.ts` | `users`, `jwt` | Verified | Remove hardcoded 'Gokul' |
| **Collection** | Customer Directory | `/api/v1/customers` | GET | Bearer | Operator (`X-Dairy-Id`) | `api/client.ts:customersApi.list` | `presentation/routes/customers.routes.ts` | `customers`, `customer_addresses` | Verified | Remove hardcoded village |
| **Collection** | Customer by ID | `/api/v1/customers/:id` | GET | Bearer | Operator | `api/client.ts:customersApi.getById` | `presentation/routes/customers.routes.ts` | `customers` | Verified | Remove hardcoded quality score |
| **Collection** | RFID Lookup | `/api/v1/rfid/lookup/:uid` | GET | Bearer | Operator | `api/client.ts:customersApi.getByRfid` | `presentation/routes/rfid.routes.ts` | `rfid_cards`, `rfid_card_assignments` | Verified | Connect directly to endpoint |
| **Collection** | Face Templates | `/api/v1/identity/face/templates` | GET | Bearer | Operator | `api/client.ts:identityApi.getFaceTemplates` | `presentation/routes/identity.routes.ts` | `face_enrollments` | Verified | None |
| **Collection** | Face 1:N Match | `/api/v1/identity/face/match` | POST | Bearer | Operator | `api/client.ts:identityApi.matchFace` | `presentation/routes/identity.routes.ts` | SFace Cosine Matcher | Verified | Remove mock customer fallback |
| **Collection** | Active Shift Session | `/api/v1/collections/sessions/active` | GET | Bearer | Operator | `api/client.ts:sessionsApi.getActiveSession` | `presentation/routes/collections.routes.ts` | `kiosk_shift_sessions` | Verified | None |
| **Collection** | Open Shift Session | `/api/v1/collections/sessions/open` | POST | Bearer | Operator | `api/client.ts:sessionsApi.openSession` | `presentation/routes/collections.routes.ts` | `kiosk_shift_sessions` | Verified | None |
| **Collection** | Close Shift Session | `/api/v1/collections/sessions/close` | POST | Bearer | Operator | `api/client.ts:sessionsApi.closeSession` | `presentation/routes/collections.routes.ts` | `kiosk_shift_sessions` | Verified | None |
| **Collection** | Save Collection Txn | `/api/v1/collections/transactions` | POST | Bearer | Operator | `api/client.ts:transactionsApi.save` | `presentation/routes/collections.routes.ts` | `milk_collections`, `customer_subledger_entries` | Verified | None |
| **Collection** | Recent Intake List | `/api/v1/collections/transactions/recent` | GET | Bearer | Operator | `api/client.ts:transactionsApi.getRecent` | `presentation/routes/collections.routes.ts` | `milk_collections` | Verified | None |
| **Dairy Admin** | Admin Request OTP | `/api/v1/auth/admin/otp/request` | POST | None | Public | `api/index.ts:auth.sendOtp` | `presentation/routes/auth.routes.ts` | `users` / Dove SMS | Verified | None |
| **Dairy Admin** | Admin Verify OTP | `/api/v1/auth/admin/otp/verify` | POST | None | Public | `api/index.ts:auth.verifyOtp` | `presentation/routes/auth.routes.ts` | `users`, `jwt` | Verified | Remove fallback CURRENT_DAIRY_ID |
| **Dairy Admin** | Dashboard Summary | `/api/v1/dashboard/overview` | GET | Bearer | Admin | `api/index.ts:dashboard.getSummary` | `modules/dashboard/dashboard.routes.ts` | Real DB metrics | Implemented, not connected | Connect to real endpoint, remove mock |
| **Dairy Admin** | Pending Customers | `/api/v1/customers/pending` | GET | Bearer | Admin | `api/index.ts:customers.getPending` | `presentation/routes/customers.routes.ts` | `customers` (status=PENDING) | Verified | Remove mock merge |
| **Dairy Admin** | Approve Customer | `/api/v1/customers/:id/approve` | POST | Bearer | Admin | `api/index.ts:customers.approve` | `presentation/routes/customers.routes.ts` | `customers` | Verified | Remove mock fallback |
| **Dairy Admin** | Reject Customer | `/api/v1/customers/:id/reject` | POST | Bearer | Admin | `api/index.ts:customers.reject` | `presentation/routes/customers.routes.ts` | `customers` | Verified | Remove mock fallback |
| **Dairy Admin** | Customer Directory | `/api/v1/customers` | GET | Bearer | Admin | `api/index.ts:customers.getAll` | `presentation/routes/customers.routes.ts` | `customers` | Verified | Remove mock merge |
| **Dairy Admin** | Soft Delete Customer | `/api/v1/customers/:id` | DELETE | Bearer | Admin | `api/index.ts:customers.softDelete` | `modules/customers/customer.routes.ts` | `customers` (is_deleted=TRUE) | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Restore Customer | `/api/v1/customers/:id/restore` | POST | Bearer | Admin | `api/index.ts:customers.restore` | `modules/customers/customer.routes.ts` | `customers` (is_deleted=FALSE) | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Rate Charts List | `/api/v1/rates` | GET | Bearer | Admin | `api/index.ts:rateCharts.getAll` | `modules/rates/rate.routes.ts` | `milk_rate_charts` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Collection Register | `/api/v1/collections/history` | GET | Bearer | Admin | `api/index.ts:collections.getTransactions` | `presentation/routes/collections.routes.ts` | `milk_collections` | Verified | Connect to real route |
| **Dairy Admin** | Collection Sessions | `/api/v1/collections/sessions` | GET | Bearer | Admin | `api/index.ts:collections.getSessions` | `presentation/routes/collections.routes.ts` | `kiosk_shift_sessions` | Verified | Connect to real route |
| **Dairy Admin** | Customer Ledger | `/api/v1/ledger/accounts` | GET | Bearer | Admin | `api/index.ts:ledger.getEntries` | `modules/ledger/ledger.routes.ts` | `customer_subledger_entries` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Billing Statements | `/api/v1/billing/periods` | GET | Bearer | Admin | `api/index.ts:billing.getBills` | `modules/billing/billing.routes.ts` | `billing_settlements` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Feed Inventory | `/api/v1/feed/products` | GET | Bearer | Admin | `api/index.ts:feed.getProducts` | `modules/feed/feed.routes.ts` | `feed_products` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Payments Register | `/api/v1/payments` | GET | Bearer | Admin | `api/index.ts:payments.getAll` | `modules/payments/payment.routes.ts` | `customer_payouts` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Devices List | `/api/v1/devices` | GET | Bearer | Admin | `api/index.ts:devices.getAll` | `modules/sync/sync.routes.ts` | `registered_devices` | Implemented, not connected | Connect to real route |
| **Dairy Admin** | Audit Logs | `/api/v1/identification/audit` | GET | Bearer | Admin | `api/index.ts:audit.getAll` | `modules/identification/identification.routes.ts` | `audit_events` | Implemented, not connected | Connect to real route |
| **Super Admin** | Super Admin Auth | `/api/v1/auth/admin/otp/verify` | POST | None | Public | `api/client.ts:apiClient.verifyOtp` | `presentation/routes/auth.routes.ts` | `users` | Verified | None |
| **Super Admin** | Tenant Directory | `/api/v1/dairies` | GET | Bearer | Super Admin | `api/client.ts:apiClient.getDairies` | `presentation/routes/dairies.routes.ts` | `organizations` | Verified | Remove mock fallback |
| **Super Admin** | Onboard Dairy | `/api/v1/dairies` | POST | Bearer | Super Admin | `api/client.ts:apiClient.createDairy` | `presentation/routes/dairies.routes.ts` | `organizations`, `dairy_centers`, `users` | Verified | Remove mock fallback |
| **Super Admin** | Patch Location | `/api/v1/dairies/:id/location` | PATCH | Bearer | Super Admin | `api/client.ts:apiClient.updateDairyLocation` | `presentation/routes/dairies.routes.ts` | `organizations` | Verified | Remove mock fallback |
| **Super Admin** | Validate Token | `/api/v1/dairies/invitations/validate` | GET | None | Public | `api/client.ts:apiClient.validateActivationToken` | `presentation/routes/dairies.routes.ts` | `dairy_admin_invitations` | Verified | Remove demoToken pre-seed |
| **Super Admin** | Activation OTP | `/api/v1/dairies/invitations/otp/request` | POST | None | Public | `api/client.ts:apiClient.requestActivationOtp` | `presentation/routes/dairies.routes.ts` | `dairy_admin_invitations` / Dove SMS | Verified | None |
| **Super Admin** | Activate Admin | `/api/v1/dairies/invitations/activate` | POST | None | Public | `api/client.ts:apiClient.activatePrimaryAdmin` | `presentation/routes/dairies.routes.ts` | `dairy_admin_invitations`, `users` | Verified | Remove mock fallback |
| **Super Admin** | Resend Invitation | `/api/v1/dairies/invitations/resend` | POST | Bearer | Super Admin | `api/client.ts:apiClient.resendInvitation` | `presentation/routes/dairies.routes.ts` | `dairy_admin_invitations` / Email | Verified | None |
| **Super Admin** | Dashboard Metrics | `/api/v1/dashboard/metrics` | GET | Bearer | Super Admin | `api/client.ts:apiClient.getDashboardMetrics` | `modules/dashboard/dashboard.routes.ts` | Real DB metrics | Implemented, not connected | Connect directly, remove mockBackend |
