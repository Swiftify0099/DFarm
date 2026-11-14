# DFarm Customer Mobile Application — Architecture Document

## 1. Executive Architecture Summary
The **DFarm Customer Mobile Application** operates as an untrusted, client-side self-service interface to the authoritative DFarm backend. It implements a strict unidirectional data flow, server-authoritative double-entry accounting reconciliation, and zero client-side financial calculations.

```
+-------------------------------------------------------------------------+
|                       Customer Mobile App (Expo / React Native)        |
+-------------------------------------------------------------------------+
|  [AppNavigator]                                                         |
|     ├── [AuthNavigator] (LoginScreen, OtpVerificationScreen)            |
|     └── [MainTabNavigator]                                             |
|           ├── DashboardTab  -> [DashboardScreen]                        |
|           ├── MilkTab       -> [MilkHistoryScreen, CollectionDetail]    |
|           ├── LedgerTab     -> [CustomerLedgerScreen]                   |
|           ├── BillsTab      -> [MonthlyBillsScreen, PdfViewerScreen]    |
|           ├── FeedTab       -> [FeedHistoryScreen, FeedSaleDetail]      |
|           ├── PaymentsTab   -> [PaymentsScreen, PaymentDetailScreen]    |
|           ├── NotifsTab     -> [NotificationsScreen]                    |
|           └── ProfileTab    -> [ProfileScreen, EditProfile, Settings]   |
+-------------------------------------------------------------------------+
       |                                           ^
       | HTTP / TLS 1.3 (Bearer JWT)               | Read-Only Offline Cache
       v                                           v
+-------------------------------+       +---------------------------------+
|  Backend Gateway & Auth (P05) |       |  Secure Local Storage (Device)  |
|  - authenticate.ts            |       |  - expo-secure-store (JWT Token)|
|  - requireCustomerOwnership   |       |  - async-storage (TTL Cache)    |
|  - Rate Limiting & Helmet     |       +---------------------------------+
+-------------------------------+
       |
       +---> [PostgreSQL Authoritative Database (P12/P13/P10)]
             - Server-calculated ledger balances
             - Strict measurement units (KG preserved)
             - Masked banking details & zero biometrics
```

---

## 2. Navigation & Screen Hierarchy
The application uses React Navigation v7 with a structured, strongly-typed router:
1. **Root Coordinator (`AppNavigator`)**:
   - Listens to `AuthContext.isAuthenticated` and `AuthContext.isLoading`.
   - Displays a branded full-screen loading spinner while restoring credentials from hardware-backed `SecureStore`.
   - Transitions between `AuthNavigator` and `MainTabNavigator` without flashing unauthenticated screens.
2. **Authentication Flow (`AuthNavigator`)**:
   - `LoginScreen`: Allows mobile number entry for genuine Supabase OTP dispatch or developer quick-switching token input for authenticated staging.
   - `OtpVerificationScreen`: Accepts the 6-digit OTP, verifies it against the authentication provider, and establishes a trusted customer session.
3. **Core Application Shell (`MainTabNavigator`)**:
   - Uses an ergonomic bottom tab bar with 5 primary tabs: **Home**, **Milk**, **Ledger**, **Bills**, and **More**.
   - Nested stack navigators allow deep-linking into:
     - Milk collection thermal slips (`CollectionDetailScreen`).
     - Monthly statement PDF download & viewer (`PdfViewerScreen`).
     - Cattle feed purchase receipts (`FeedSaleDetailScreen`).
     - Disbursement payout receipts (`PaymentDetailScreen`).
     - Profile self-service settings & support contacts (`ProfileScreen`, `EditProfileScreen`, `SettingsScreen`, `SupportScreen`).
     - In-app notification inbox (`NotificationsScreen`).

---

## 3. Server-Authoritative Balance & Financial Contracts
In strict compliance with DFarm accounting rules:
- **No Client Calculations**: The mobile app never computes opening/closing balances or performs JavaScript floating-point arithmetic.
- **Server Authority**: The backend PostgreSQL double-entry engine (`ledger_transactions`) is the sole authority for:
  - `openingBalance`
  - `totalCredits` (Milk collections)
  - `totalDebits` (Feed purchases, advances, deductions)
  - `netPayments` (Payout disbursements)
  - `closingBalance`
  - `balanceStatus`:
    - `DAIRY_OWES_CUSTOMER`: Closing balance > 0 (Green indicator).
    - `CUSTOMER_OWES_DAIRY`: Closing balance < 0 (Red indicator).
    - `SETTLED`: Closing balance == 0 (Neutral grey indicator).

---

## 4. Strict Measurement Unit Preservation
- **Preserve Recorded Unit**: All milk intake sessions are recorded in **KG** at collection centers using certified weighing scales.
- **Zero Silent Conversion**: The customer mobile application strictly displays the recorded unit (`KG`) and never silently converts kilograms to liters using estimated specific gravity values (1.028–1.032).
- **Unit Formatting**: The utility `formatWeightKg(weight, unit)` ensures that whatever unit was captured at the intake scale is explicitly printed alongside the quantity.

---

## 5. Offline-First Read-Only Architecture
```
[User Navigates to Screen]
          |
          v
[Check Network Connectivity (NetInfo)]
          |
    +-----+-----+
    |           |
[Online]    [Offline]
    |           |
    v           v
[Fetch API]  [Read Local Cache (AsyncStorage)]
    |           |
  Success?      +--> Cache Exists?
  /      \              /         \
Yes       No          Yes          No
 |         |           |            |
 v         v           v            v
[Save]  [Fallback]  [Show Data]  [EmptyState]
to Cache  to Cache   (Banner:     (Banner:
 |         |         "Cached")    "Offline")
 v         v
[Show Fresh Data]
(Banner: "Online")
```

1. **Active Online Fetch**: When network connectivity is available, fresh data is retrieved from the backend API and saved to local storage with a timestamp.
2. **Graceful Offline Fallback**: If network fails or the device is disconnected, cached records are rendered immediately.
3. **Transparency**: The `OfflineBanner` informs the farmer whether the data is freshly synchronized or loaded from cache with the exact timestamp.
4. **No Offline Mutability**: Customers cannot initiate ledger edits, create collections, or alter balances while offline.

---

## 6. Notifications Inbox Integration
- In-app notification messages are retrieved directly from the backend `customer_notifications` table.
- Farmers receive instant operational updates regarding:
  - Completed milk collections with shift, fat%, SNF%, and credited amounts.
  - Monthly bill generation announcements.
  - Payout disbursements and bank reference numbers.
  - General dairy center announcements.
- Farmers can acknowledge notifications individually (`PATCH /customers/:id/notifications/:notificationId/read`) or mark all read (`PATCH /customers/:id/notifications/read-all`).
