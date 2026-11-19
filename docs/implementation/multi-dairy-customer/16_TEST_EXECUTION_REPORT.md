# 16 — TEST EXECUTION REPORT

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Test Suite:** `services/backend/tests/multi-dairy-membership.test.js`  
**Test Engine:** Node.js native test runner (`node --test`)  
**Execution Timestamp:** 2026-11-19T00:14:00+05:30  
**Overall Outcome:** **100% PASS (9 / 9 Subtests Passed, 0 Failures)**

---

## 1. Test Execution Summary

```
TAP version 13
# Subtest: DFARM Multi-Dairy Customer Membership & Identity Verification Suite
    # Subtest: 0. Database Environment Pre-Flight & Provisioning
    ok 1 - 0. Database Environment Pre-Flight & Provisioning
      ---
      duration_ms: 3770.0946
      type: 'test'
      ...
    # Subtest: 1. Rule 1: One Global Customer Identity per verified mobile number
    ok 2 - 1. Rule 1: One Global Customer Identity per verified mobile number
      ---
      duration_ms: 1845.2104
      type: 'test'
      ...
    # Subtest: 2. Rule 2 & 3: Register in Dairy A (Success) & Duplicate within Dairy A (Rejected)
    ok 3 - 2. Rule 2 & 3: Register in Dairy A (Success) & Duplicate within Dairy A (Rejected)
      ---
      duration_ms: 512.4412
      type: 'test'
      ...
    # Subtest: 3. Rule 2: Same Customer Identity Registering in Dairy B is Allowed
    ok 4 - 3. Rule 2: Same Customer Identity Registering in Dairy B is Allowed
      ---
      duration_ms: 382.1120
      type: 'test'
      ...
    # Subtest: 4. Membership Discovery Directory returns all memberships with isolated statuses
    ok 5 - 4. Membership Discovery Directory returns all memberships with isolated statuses
      ---
      duration_ms: 41.5204
      type: 'test'
      ...
    # Subtest: 5. Rule 4: Independent Membership Lifecycle & Admin Approvals
    ok 6 - 5. Rule 4: Independent Membership Lifecycle & Admin Approvals
      ---
      duration_ms: 489.1550
      type: 'test'
      ...
    # Subtest: 6. Rule 5: Dairy Switching & Tenant Scoped JWT Generation
    ok 7 - 6. Rule 5: Dairy Switching & Tenant Scoped JWT Generation
      ---
      duration_ms: 52.8812
      type: 'test'
      ...
    # Subtest: 7. Rule 5: Strict Operational Tenant Isolation across Dairies
    ok 8 - 7. Rule 5: Strict Operational Tenant Isolation across Dairies
      ---
      duration_ms: 198.2348
      type: 'test'
      ...
    1..8
ok 1 - DFARM Multi-Dairy Customer Membership & Identity Verification Suite
  ---
  duration_ms: 8774.3347
  type: 'test'
  ...
1..1
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 41948.0614
```

---

## 2. Subtest Breakdown & Invariant Coverage

| Subtest # | Name | Invariant Tested | Status |
|---|---|---|---|
| **0** | Pre-Flight & Provisioning | Tables exist in control plane and isolated tenants; idempotent clean start | **PASS** |
| **1** | Rule 1: One Global Identity | Canonical E.164 normalization, real cryptographic OTP, idempotent re-login returning same UUID | **PASS** |
| **2** | Rule 2 & 3: Register Dairy A & Duplicate Rejection | Registration in Dairy A succeeds (201); duplicate registration in Dairy A rejected (400 VALIDATION_ERROR) | **PASS** |
| **3** | Rule 2: Multi-Dairy Allowed | Same global identity registers in Dairy B with status PENDING_APPROVAL (201) | **PASS** |
| **4** | Membership Discovery | `GET /api/v1/customers/memberships` returns both Dairy A & Dairy B with isolated statuses | **PASS** |
| **5** | Rule 4: Independent Lifecycle | Dairy Admin A approves customer (APPROVED); Dairy Admin B rejects customer (REJECTED) with mandatory audit reason | **PASS** |
| **6** | Rule 5: Dairy Switching | Switching to APPROVED Dairy A issues tenant-scoped JWT; switching to REJECTED Dairy B is strictly blocked (400) | **PASS** |
| **7** | Rule 5: Tenant Data Isolation | Dairy A token reads customer profile, collections history, ledger, and bills from Dairy A tenant DB with zero cross-tenant leakage | **PASS** |
