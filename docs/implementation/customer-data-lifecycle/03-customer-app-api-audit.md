# DFarm Customer App API Inventory & Contract Audit

**Document ID:** `CDL-API-03`  
**Date:** 2026-11-21  
**Status:** FORENSIC AUDIT COMPLETE  

---

## 1. Customer App API Endpoints & Contracts

### 1.1 Authentication & Session
- `POST /api/v1/auth/customer/request-otp`
  - **Body:** `{ mobileNumber: "+919876543210" }`
  - **Response:** `{ success: true, message: "OTP sent successfully" }`
- `POST /api/v1/auth/customer/verify-otp`
  - **Body:** `{ mobileNumber: "+919876543210", otp: "123456" }`
  - **Response:** `{ accessToken, refreshToken, expiresIn, isRegistered, globalCustomerId, memberships, user, customer }`
  - **Contract Fix:** `user.customerProfile.name` and `customer.fullName` must return customer's actual full name, NOT `dairyName`.
- `POST /api/v1/auth/customer/select-dairy`
  - **Body:** `{ dairyId: "uuid", globalCustomerId: "uuid" }`
  - **Response:** `{ accessToken, refreshToken, expiresIn, selectedDairy, user }`
  - **Contract Fix:** `user.customerProfile.name` must return customer's full name.

### 1.2 Customer Profile & Biometrics
- `GET /api/v1/customers/:id` (or `GET /api/v1/customers/me`)
  - **Headers:** `Authorization: Bearer <token>`, `x-dairy-tenant-id: <dairyId>`
  - **Response:** `{ success: true, id, fullName, farmerCode, mobileNumber, dairyId, dairyName, dairyCode, membershipStatus, isBiometricEnrolled, bankDetails: { accountNumberMask, bankName, ifscCode }, ... }`
  - **Contract Fix:** Backend must always populate `dairyName`, `dairyCode`, and `membershipStatus` on `maskedData`.
- `POST /api/v1/customers/:id/biometrics/update`
  - **Body:** `{ customerId, modelVersion: "sface_int8_2021dec", embedding: [...128 numbers...], confidence: 0.95 }`
  - **Response:** `{ success: true, message: "Biometrics updated successfully" }`
  - **Contract Fix:** Remove destructive test seed overwrite (`Pandurang Patil`) in development mode.
- `PUT /api/v1/customers/:id/bank-details`
  - **Body:** `{ bankName, accountNumber, ifscCode, accountHolderName }`
  - **Response:** `{ success: true, message: "Bank details updated" }`

### 1.3 Milk Collection Records
- `GET /api/v1/collection/history`
  - **Query Params:** `startDate`, `endDate`, `animalType`, `page`, `pageSize`, `limit`, `offset`
  - **Headers:** `Authorization: Bearer <token>`, `x-dairy-tenant-id: <dairyId>`
  - **Response:** `{ success: true, count, data: [ { id, date, shift, animalType, quantity, fat, snf, clr, ratePerUnit, totalAmount, status } ] }`
  - **Contract Fix:** Backend must support both `page`/`pageSize` and `limit`/`offset`.
- `GET /api/v1/collection/summary/monthly`
  - **Query Params:** `month`, `year`
  - **Response:** `{ success: true, data: { monthYear, totalLiters, cowLiters, buffaloLiters, avgFat, avgSnf, totalAmount, transactionCount } }`

### 1.4 Financial Ledger & Khata
- `GET /api/v1/ledger/entries`
  - **Query Params:** `page`, `pageSize`, `limit`, `offset`
  - **Response:** `{ success: true, count, data: [ { id, date, description, type, amount, balanceAfter, referenceType, referenceId } ] }`
- `GET /api/v1/ledger/summary`
  - **Response:** `{ success: true, data: { customerId, currentBalance, totalMilkEarnings, totalDeductions, lastUpdated } }`

### 1.5 Monthly Bills & Statements
- `GET /api/v1/bills`
  - **Query Params:** `limit`, `customerId`
  - **Response:** `{ success: true, count, data: [ { id, billNumber, cycleStartDate, cycleEndDate, totalLiters, grossAmount, deductionsAmount, netPayableAmount, status, paidAt, disbursedDate } ] }`
  - **Contract Fix:** Backend `POST /bills/generate` must write to tenant DB; `GET /bills` must query tenant DB and match on `(mb.customer_id = $1 OR c.global_customer_id = $1)`.

---

## 2. Customer App Query Cache Scoping & Invalidation

### Query Key Specifications
To eliminate cache collision and cross-dairy data persistence:

1. **Profile:** `['customers', 'profile', dairyId, customerId]`
2. **Collection List:** `['collection', 'list', dairyId, customerId, boundedFilters]`
3. **Collection Summary:** `['collection', 'monthly-summary', dairyId, customerId]`
4. **Ledger Entries:** `['ledger', 'entries', dairyId, customerId, boundedParams]`
5. **Ledger Summary:** `['ledger', 'summary', dairyId, customerId]`
6. **Bills List:** `['bills', 'list', dairyId, customerId]`

### Dairy Switching Protocol in `useAuth.ts`
Upon executing `switchDairy`:
```ts
queryClient.removeQueries({ queryKey: ['customers'] });
queryClient.removeQueries({ queryKey: ['collection'] });
queryClient.removeQueries({ queryKey: ['ledger'] });
queryClient.removeQueries({ queryKey: ['bills'] });
queryClient.invalidateQueries({ queryKey: ['customers', 'memberships'] });
```
This guarantees 100% tenant isolation in the React Native / Expo web client cache.
