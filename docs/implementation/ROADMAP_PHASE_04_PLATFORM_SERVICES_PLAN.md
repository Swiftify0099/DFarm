# DFARM IMPLEMENTATION PLAN: ROADMAP PHASE 04 PLATFORM SERVICES
**Document ID:** `DFARM-IMP-R04-PLAN-001`  
**Phase:** Roadmap Phase 04 — Super Admin Platform Services  
**Author:** DFarm Principal Solution Architect & Systems Engineer  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Implementation Objectives

1. **Hardware Master Governance:** Central registration, serial uniqueness, deployment to cooperative organizations, lifecycle transitions (`AVAILABLE`, `ASSIGNED`, `MAINTENANCE`, `FAULTY`, `RETIRED`), and assignment audit logging.
2. **AMC Subscription Management:** Multi-tier maintenance plans, subscription tracking, and Razorpay payment verification strictly quarantined to AMC.
3. **Durable Diagnostic Support Sessions:** Move session token generation, scoping (`READ_ONLY`, `OPERATIONAL_DIAGNOSTIC`, `EMERGENCY_SUPPORT`), and revocation into PostgreSQL `support_diagnostic_sessions`.
4. **Central Global Rate Policy Engine:** Provide central price guidelines, version drafting, SHA-256 integrity calculation, and publication workflow without altering local tenant rate charts.
5. **Central Global FAT/SNF Adjustment Policy Engine:** Formalize temperature and quality deduction brackets, rounding rules (`NEAREST_TWO_DECIMALS`), and eliminate guessed deduction values.
6. **Platform Operator Least Privilege:** Restrict `PLATFORM_OPERATOR` accounts strictly to read operations (`GET`), denying all mutations (`403 Forbidden`).

---

## 2. Execution Steps Completed

```
Step 1: Database Migration (033_central_platform_policies_and_support.sql)
  ├── Added support_diagnostic_sessions
  ├── Added global_rate_policies & global_rate_policy_versions
  └── Added global_fat_snf_adjustment_policies & global_fat_snf_adjustment_policy_versions

Step 2: Repository Layer Implementation (PostgresSuperAdminRepository.ts)
  ├── Durable PostgreSQL support session creation & queries
  ├── Global Rate Policy CRUD & version publishing
  └── Global FAT/SNF Policy CRUD & version publishing

Step 3: Route & Security Middleware (super-admin.routes.ts)
  ├── Gated POST/PATCH/DELETE behind requireSuperAdminRole
  ├── Permitted GET for requirePlatformStaffRole
  └── Wired REST endpoints for policies and sessions

Step 4: Verification & Test Automation (roadmap-phase-04-platform-services.test.js)
  └── 34 tests covering all 6 functional groups (100% pass)
```

---

## 3. Risk Mitigation & Verification Matrix

| Risk | Mitigation | Test Verification |
|---|---|---|
| Policy alters live dairy rate charts | Policies are central metadata; dairies pull or benchmark via separate workflows | Test Group 3 & 4 |
| Arbitrary deduction values at kiosk | Global policies enforce structured JSON brackets and rounding rules | Test Group 4 |
| Support sessions lost on restart | Durable persistence in PostgreSQL table | Test Group 5 |
| Operator escalates to Super Admin | Server-side 403 enforcement | Test Group 6 |
