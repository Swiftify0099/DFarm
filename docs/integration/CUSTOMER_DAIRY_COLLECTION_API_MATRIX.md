# DFARM — COMPLETE CROSS-APPLICATION API MATRIX

**Authoritative Technical Specification**  
**Component Scope**: Customer App, Dairy Admin Web, Collection App Kiosk, Super Admin Control Plane, Backend API Routing  
**Database Routing Invariant**: Central Platform Control Plane vs Isolated Tenant Database clearly identified for every route.

---

## 1. Authentication & Tenant Resolution Endpoints

| Endpoint | HTTP Method | Initiating Client | Auth Required | Tenant Header / Scope | Target Database | Description & Payload |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/auth/request-otp` | `POST` | Customer App | No | None (Global) | **Central Platform DB** | Sends SMS OTP to mobile via Dove SMS Gateway. Payload: `{ mobile: "+9198..." }` |
| `/api/v1/auth/verify-otp` | `POST` | Customer App | No | None (Global) | **Central Platform DB** | Verifies OTP, creates/locates user, returns JWT. Payload: `{ mobile, otp }` |
| `/api/v1/auth/login` | `POST` | Dairy / Super Admin | No | None | **Central Platform DB** | Authenticates staff using email/password. Returns JWT with claims (`role`, `dairyId`). |
| `/api/v1/auth/operator/otp/request` | `POST` | Collection App | No | None | **Central Platform DB** | Dispatches kiosk operator OTP for terminal unlock. |
| `/api/v1/auth/operator/otp/verify` | `POST` | Collection App | No | None | **Central Platform DB** | Verifies operator OTP and issues kiosk session token. |
| `/api/v1/dairies/nearby` | `GET` | Customer App | Bearer (User) | None | **Central Platform DB** | Discovers open cooperative dairies for farmer registration. |

---

## 2. Customer Registration & Profile Lifecycle Endpoints

| Endpoint | HTTP Method | Initiating Client | Auth Required | Tenant Context | Target Database | Description & Payload |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/customers/register` | `POST` | Customer App | Bearer (User) | Header: `X-Dairy-Id` or Payload `dairyId` | **Selected Tenant DB** | Persists customer registration, consent, and face enrollment. Payload: `{ dairyId, fullName, village, milkType, faceEmbedding, consentGiven }` |
| `/api/v1/customers/status` | `GET` | Customer App | Bearer (User) | Header: `X-Dairy-Id` or Query `dairyId` | **Selected Tenant DB** | Polled by Customer App to display live approval state (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `farmerCode`). |
| `/api/v1/customers/pending` | `GET` | Dairy Admin | Bearer (Admin) | Inferred from Admin JWT (`dairyId`) | **Selected Tenant DB** | Lists pending registration applications for review. |
| `/api/v1/customers/:id/approve` | `POST` | Dairy Admin | Bearer (Admin) | Inferred from Admin JWT (`dairyId`) | **Selected Tenant DB** | Approves applicant, assigns official farmer code (e.g., `GOK-108`), activates face enrollment & ledger account. Payload: `{ farmerCode: "GOK-108" }` |
| `/api/v1/customers/:id/reject` | `POST` | Dairy Admin | Bearer (Admin) | Inferred from Admin JWT (`dairyId`) | **Selected Tenant DB** | Rejects applicant with reason. Payload: `{ reason: "..." }` |
| `/api/v1/customers` | `GET` | Dairy Admin / Kiosk | Bearer (Role) | Header: `X-Dairy-Id` or JWT claim | **Selected Tenant DB** | Retrieves customer directory filtered by status, village, or search string. |
| `/api/v1/customers/:id` | `GET` | Dairy Admin / Kiosk | Bearer (Role) | Header: `X-Dairy-Id` or JWT claim | **Selected Tenant DB** | Retrieves individual customer details and subledger summary. |

---

## 3. Biometric & Identity Endpoints

| Endpoint | HTTP Method | Initiating Client | Auth Required | Tenant Context | Target Database | Description & Payload |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/identity/face/enroll` | `POST` | Customer App / Admin | Bearer | Header: `X-Dairy-Id` | **Selected Tenant DB** | Stores AES-256-GCM encrypted 128-D SFace INT8 embedding with AAD binding. |
| `/api/v1/identity/face/templates` | `GET` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Fetches active encrypted face templates for the authenticated dairy to populate offline kiosk gallery. |
| `/api/v1/identity/face/verify` | `POST` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Server-side verification fallback (if edge matcher is bypassed). Computes cosine similarity. |
| `/api/v1/identity/rfid/assign` | `POST` | Dairy Admin / Kiosk | Bearer | Header: `X-Dairy-Id` | **Selected Tenant DB** | Binds physical 13.56 MHz RFID UID to customer record. |

---

## 4. Collection Kiosk & Milk Intake Endpoints

| Endpoint | HTTP Method | Initiating Client | Auth Required | Tenant Context | Target Database | Description & Payload |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/collections/sessions/open` | `POST` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Opens morning or evening shift session. Payload: `{ centerId, shiftType }` |
| `/api/v1/collections/sessions/active`| `GET` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Retrieves current open shift session details and accumulator totals. |
| `/api/v1/collections/sessions/:id/close`| `POST` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Closes shift session, generates dispatch summary, locks session. |
| `/api/v1/collections/transactions` | `POST` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` + `X-Idempotency-Key` | **Selected Tenant DB** | Atomic milk intake: weighs milk, computes rate, logs transaction, updates session, posts to ledger. |
| `/api/v1/collections/transactions/recent` | `GET` | Collection App | Bearer (Kiosk) | Header: `X-Dairy-Id` | **Selected Tenant DB** | Lists transactions recorded in the current active shift session. |
| `/api/v1/rates/active` | `GET` | Collection App / Admin | Bearer | Header: `X-Dairy-Id` | **Selected Tenant DB** | Retrieves current effective rate chart matrix for the dairy. |

---

## 5. Ledger & Billing Endpoints

| Endpoint | HTTP Method | Initiating Client | Auth Required | Tenant Context | Target Database | Description & Payload |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/ledger/accounts/:customerId` | `GET` | Customer App / Admin | Bearer | Header: `X-Dairy-Id` | **Selected Tenant DB** | Returns current ledger balance and passbook overview. |
| `/api/v1/ledger/transactions` | `GET` | Customer App / Admin | Bearer | Header: `X-Dairy-Id` | **Selected Tenant DB** | Paginated double-entry financial journal transactions for a customer. |
| `/api/v1/billing/cycles` | `GET` | Dairy Admin | Bearer (Admin) | Inferred from JWT | **Selected Tenant DB** | 10-day payment cycle generation and disbursement summaries. |
| `/api/v1/billing/cycles/:id/disburse` | `POST` | Dairy Admin | Bearer (Admin) | Inferred from JWT | **Selected Tenant DB** | Marks payment cycle disbursed, posts payout debits to customer ledgers. |
