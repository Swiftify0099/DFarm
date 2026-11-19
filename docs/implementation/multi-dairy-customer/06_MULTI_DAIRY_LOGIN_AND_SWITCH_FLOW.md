# 06 — MULTI-DAIRY LOGIN AND SWITCH FLOW

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `apps/dfarm-customer-app`, `verify-otp.tsx`, `select-dairy.tsx`, `DairySwitchModal.tsx`, `auth.routes.ts`

---

## 1. OTP Verification & Dynamic Routing Flow

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer Customer
    participant App as Customer Mobile App
    participant AuthAPI as /api/v1/auth
    participant CentralDB as dfarm_central
    participant TenantDB as Tenant Database

    Farmer->>App: Enters mobile number (9876543210)
    App->>AuthAPI: POST /request-otp { mobileNumber: "9876543210" }
    AuthAPI-->>Farmer: Real SMS via Dove SMS Gateway
    Farmer->>App: Submits 6-digit OTP
    App->>AuthAPI: POST /verify-otp { mobileNumber, otp }
    AuthAPI->>CentralDB: Upsert global_customer_identities
    AuthAPI->>CentralDB: Query customer_dairy_memberships
    CentralDB-->>AuthAPI: Return [Membership A (APPROVED), Membership B (APPROVED)]
    AuthAPI-->>App: { globalCustomerId, memberships: [...] }

    alt 0 Memberships
        App->>Farmer: Navigates to Screen D: Dairy Discovery (/dairy-discovery)
    else 1 Approved Membership
        App->>AuthAPI: POST /customer/select-dairy { dairyId, globalCustomerId }
        AuthAPI-->>App: { accessToken (scoped to Dairy A) }
        App->>Farmer: Navigates directly to Home Dashboard
    else >= 2 Memberships
        App->>Farmer: Displays Screen B: Select Dairy (/select-dairy)
        Farmer->>App: Taps target dairy
        App->>AuthAPI: POST /customer/select-dairy { dairyId, globalCustomerId }
        AuthAPI-->>App: { accessToken (scoped to selected dairy) }
        App->>Farmer: Navigates to Home Dashboard
    end
```

---

## 2. In-App Quick Dairy Switching (`DairySwitchModal`)

When a farmer is inside the active dashboard:
1. Top banner displays current dairy tag: `[🌿 Warna Dairy | C-WARNA-101 बदला ▾]`.
2. Tapping the tag triggers `DairySwitchModal` bottom sheet.
3. Modal displays all registered dairy accounts:
   - Current active dairy (highlighted in Green Claymorphism with "Active" badge).
   - Other approved dairies with 1-tap "स्विच करा" button.
   - Pending / Rejected dairies with informative non-clickable badges.
   - "+ Register with Another Dairy" discovery link.
4. When switching:
   - App calls `POST /api/v1/customers/switch-dairy` with target `dairyId`.
   - Backend issues a fresh HMAC-SHA256 JWT scoped exclusively to the target `organizationId`.
   - App updates `SecureStorage` (`token`, `dairyId`, `dairyName`).
   - App flushes the React Query cache via `queryClient.clear()`.
   - Home Dashboard reloads with fresh operational data from the newly selected dairy's physical tenant database.
