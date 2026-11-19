# DFarm — Tenant Database Isolation Test Report

**Document ID:** DFARM-REPORT-003  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** COMPLETED & VERIFIED  
**Date:** 2026-11-17  
**Test Suite:** `services/backend/tests/tenant-database-isolation.test.js`

---

## 1. Test Overview

The tenant database isolation test suite validates that:
1. Every dairy tenant operates inside an isolated PostgreSQL database.
2. Records inserted into Dairy A are completely invisible to Dairy B.
3. Cross-tenant queries without valid authorization fail closed with HTTP 403 Forbidden.
4. Tenant pool creation, bounded limits, and eviction function reliably.

---

## 2. Test Execution Results (TAP Output)

```text
TAP version 13
# Subtest: DFarm Multi-Tenant Isolation & Provisioning Test Suite
    # Subtest: Test A: Migration Manifest & Quarantined Migration Exclusion
    ok 1 - Test A: Migration Manifest & Quarantined Migration Exclusion
      ---
      duration_ms: 1.6112
      type: 'test'
      ...
    # Subtest: Test B: AES-256-GCM Envelope Credential Encryption
    ok 2 - Test B: AES-256-GCM Envelope Credential Encryption
      ---
      duration_ms: 3.1428
      type: 'test'
      ...
    # Subtest: Test C: Tenant Database Provisioning State Machine & Naming Convention
    ok 3 - Test C: Tenant Database Provisioning State Machine & Naming Convention
      ---
      duration_ms: 726.8285
      type: 'test'
      ...
    # Subtest: Test D: Strict Tenant Data Isolation (Tenant A vs Tenant B)
    ok 4 - Test D: Strict Tenant Data Isolation (Tenant A vs Tenant B)
      ---
      duration_ms: 263.9362
      type: 'test'
      ...
    # Subtest: Test E: Cross-Tenant Protection & IDOR Rejection Middleware
    ok 5 - Test E: Cross-Tenant Protection & IDOR Rejection Middleware
      ---
      duration_ms: 56.063
      type: 'test'
      ...
    # Subtest: Test F: Tenant Pool Eviction & Clean Lifecycle Management
    ok 6 - Test F: Tenant Pool Eviction & Clean Lifecycle Management
      ---
      duration_ms: 95.2498
      type: 'test'
      ...
    1..6
ok 1 - DFarm Multi-Tenant Isolation & Provisioning Test Suite
  ---
  duration_ms: 1151.8947
  type: 'test'
  ...
1..1
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

---

## 3. Detailed Test Analysis

### 3.1 Test C: Provisioning State Machine & Idempotency
- **Provisioned Tenant A:**
  - `dairyId`: `a0000000-0000-0000-0000-000000000001`
  - `dairyCode`: `GOKUL_KOLHAPUR`
  - Generated DB Name: `dfarm_tenant_gokul_kolhapur_a00000000000` (length: 40 chars <= 63 chars)
  - Resulting Status: `ACTIVE`
- **Idempotency Verification:** Re-calling `provisionTenantDatabase` on an active dairy returns the existing active mapping without duplicate database creation or migration re-execution.

### 3.2 Test D: Strict Cross-Tenant Data Isolation
- Created customer `Anand Gopalrao Patil` in Dairy A.
- Direct query against Dairy A database: **Returned 1 row**.
- Direct query against Dairy B database: **Returned 0 rows** (`assert.strictEqual(directResB.rows.length, 0)`).
- Querying customer ID with Dairy B context: **Returned `null`**.
- **Verdict:** Strict multi-tenant data isolation verified at both database and application repository layers.

### 3.3 Test E: Cross-Tenant Protection & IDOR Rejection
- Header `x-dairy-tenant-id: a0000000-0000-0000-0000-000000000001` with Query Param `organizationId: b0000000-0000-0000-0000-000000000002`:
  - Result: **HTTP 403 Forbidden** (`Cross-dairy query blocked`).
- Request without tenant context:
  - Result: **HTTP 400 Bad Request** (`Dairy context (organizationId) is required`).
- **Verdict:** IDOR vectors and forged tenant headers are strictly blocked.

### 3.4 Test F: Connection Pool Eviction & Clean Lifecycle
- Called `tenantManager.evictTenantPool(dairyAId)`.
- Verified internal pool socket termination and memory map clearance.
- Re-accessing Dairy A re-initialized a bounded connection pool and executed query successfully.
- **Verdict:** Connection lifecycle clean, bounded, and resource-leak free.
