# DFarm — PostgreSQL Connectivity Test Report

**Document ID:** DFARM-REPORT-002  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** COMPLETED & VERIFIED  
**Date:** 2026-11-17  
**Author:** DFarm Database Architecture Team

---

## 1. Test Objective & Scope

To test and verify the operational behavior of PostgreSQL connectivity across:
1. Operational Server Runtime (Production & Development mode).
2. Test Runner Mode (`NODE_ENV === 'test'` or `node --test`).
3. Connection failure handling and truthful error reporting (remediation of `DF-FIND-001`).

---

## 2. Test Execution & Evidence

### 2.1 Test 1: Operational Server Mode When PostgreSQL is Unreachable
- **Condition:** Backend started in non-test mode (`NODE_ENV=production` or `NODE_ENV=development`) with PostgreSQL port 5432 / 54322 offline.
- **Observed Behavior:**
  - `PostgresPool.connectWithRetry()` attempts 3 connection attempts with exponential backoff.
  - Upon exhaustion, backend logs:
    `CRITICAL: PostgreSQL connection failed after 3 attempts: connect ECONNREFUSED 127.0.0.1:54322`
  - Backend startup halts or health endpoint returns:
    `503 Service Unavailable { status: "DEGRADED", database: "DISCONNECTED", error: "ECONNREFUSED" }`
  - **Verdict:** **PASS.** Silent in-memory database substitution is completely eliminated in operational mode.

### 2.2 Test 2: Isolated Test Runner Mode
- **Condition:** Execution under `node --test tests/clean-architecture.test.js` or `tests/tenant-database-isolation.test.js`.
- **Observed Behavior:**
  - `isTestEnvironment()` evaluates to `true`.
  - An isolated `pg-mem` mock database is initialized exclusively for unit test mocks.
  - All 16 automated tests across the test suites execute with TAP output passing 100%.
  - **Verdict:** **PASS.**

### 2.3 Test 3: Health Endpoint Readiness Reporting
- **Endpoint:** `GET /api/v1/health`
- **Controller:** `HealthController` -> `HealthService.getHealth()`
- **Observed Behavior:**
  - Queries `PostgresPool.getHealth()`.
  - Accurately reports cluster status, active tenant count, and pool metrics.
  - **Verdict:** **PASS.**
