# 01 — MULTI-DAIRY IDENTITY ARCHITECTURE

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** Central Control Plane (`dfarm_central`), Tenant Databases (`dfarm_tenant_<code_hash>`), Customer App (`apps/dfarm-customer-app`), Backend API (`services/backend`)

---

## 1. Architectural Overview

DFarm employs a hybrid database-per-tenant architecture paired with a centralized control plane directory for identity discovery. A farmer customer uses a single verified phone number (E.164 canonical format) to access services across multiple independent dairy cooperatives without duplicating their global identity and without sharing operational records across cooperatives.

```mermaid
flowchart TD
    subgraph Central Control Plane ["dfarm_central (Central Database)"]
        GCI["global_customer_identities<br/>(id, normalized_mobile_number, phone_verified_at)"]
        CDM["customer_dairy_memberships<br/>(global_customer_id, organization_id, tenant_customer_id, status)"]
        ORGS["organizations<br/>(id, code, name, latitude, longitude)"]
        GCI -->|1:N| CDM
        ORGS -->|1:N| CDM
    end

    subgraph Client ["Customer Mobile App"]
        LOGIN["1. OTP Login (+919876543210)"]
        ROUTER{"Membership Discovery Router"}
        SCREEN_SINGLE["Direct Active Dashboard"]
        SCREEN_MULTI["Screen B: Select Dairy Membership"]
        SCREEN_NONE["Screen D: Location-Based Dairy Discovery"]
        SWITCH_MODAL["Screen C: Quick Dairy Switch Modal"]
        
        LOGIN --> ROUTER
        ROUTER -->|1 Approved| SCREEN_SINGLE
        ROUTER -->|>= 2 Accounts| SCREEN_MULTI
        ROUTER -->|0 Memberships| SCREEN_NONE
        SCREEN_SINGLE -.-> SWITCH_MODAL
        SWITCH_MODAL -->|Select Target Dairy| SCREEN_SINGLE
    end

    subgraph TenantA ["Dairy Tenant Database: Warna (dfarm_tenant_warna_...)"]
        CUST_A["customers<br/>(id, global_customer_id, farmer_code, status)"]
        COLL_A["milk_collections"]
        PASS_A["ledger_entries & transactions"]
        BILL_A["monthly_bills"]
        CUST_A --> COLL_A
        CUST_A --> PASS_A
        CUST_A --> BILL_A
    end

    subgraph TenantB ["Dairy Tenant Database: Krishna (dfarm_tenant_krishna_...)"]
        CUST_B["customers<br/>(id, global_customer_id, farmer_code, status)"]
        COLL_B["milk_collections"]
        PASS_B["ledger_entries & transactions"]
        BILL_B["monthly_bills"]
        CUST_B --> COLL_B
        CUST_B --> PASS_B
        CUST_B --> BILL_B
    end

    CDM -.->|Routes To| CUST_A
    CDM -.->|Routes To| CUST_B
```

---

## 2. Core Architectural Guarantees

1. **Rule 1 — Global Identity Canonicalization:**
   One verified mobile number (normalized to E.164 standard, e.g. `+919876543210`) maps to exactly one stable UUID record in `dfarm_central.global_customer_identities`.
2. **Rule 2 — Multi-Dairy Independent Memberships:**
   A customer identity can independently hold memberships across Dairy A, Dairy B, Dairy C, etc. Registration with Dairy A never blocks registration with Dairy B.
3. **Rule 3 — Per-Dairy Zero Duplication:**
   Within any single dairy tenant, a customer identity can have exactly one registration. Enforced by:
   - Central directory constraint: `CONSTRAINT uq_customer_dairy_membership UNIQUE (organization_id, global_customer_id)`.
   - Tenant database constraint: `CREATE UNIQUE INDEX uq_customer_global_identity_per_org ON customers(organization_id, global_customer_id)`.
4. **Rule 4 — Independent Membership Lifecycles:**
   Dairy A may be `APPROVED`, Dairy B `PENDING_APPROVAL`, and Dairy C `REJECTED`. Approvals or rejections in one dairy do not cascade to others.
5. **Rule 5 — Strict Operational Tenant Isolation:**
   Operational tables (`milk_collections`, `ledger_entries`, `monthly_bills`, `face_enrollments`) reside strictly inside the tenant database for that dairy. Central control plane stores only discovery routing metadata.

---

## 3. Component Interaction Matrix

| Flow | Initiator | Control Plane Operation | Tenant Database Operation | Result |
|---|---|---|---|---|
| OTP Request | Customer App | Rate limit check & cryptographic challenge generation | None | SMS dispatched via Dove SMS Gateway |
| OTP Verification | Customer App | Upsert `global_customer_identities`, lookup `customer_dairy_memberships` | None | Returns `globalCustomerId` & membership array |
| Dairy Selection | Customer App | Validate membership status = `APPROVED` | Resolve customer profile | Issues tenant-scoped HMAC-SHA256 JWT |
| Discovery | Customer App | Haversine distance search on `organizations` | Join user memberships to show "Already Registered" | Returns nearby active dairies |
| New Registration | Customer App | Check `uq_customer_dairy_membership`, insert `customer_dairy_memberships` | Insert `customers` with `global_customer_id` | Status `PENDING_APPROVAL` |
| Dairy Switch | Customer App | Invalidate token, issue new token for target dairy | Flush React Query cache, fetch new tenant data | Seamless switch |
