# DFARM IMPLEMENTATION: ROADMAP PHASE 04 PLATFORM SERVICES INSPECTION
**Document ID:** `DFARM-IMP-R04-INSPECT-001`  
**Phase:** Roadmap Phase 04 — Super Admin Platform Services  
**Author:** DFarm Senior Platform Engineer & Integration Auditor  
**Date:** 2026-11-18  
**Status:** COMPLETE  

---

## 1. Inspection Context & Scope

This inspection targeted the pre-existing state of DFarm Platform Services under Roadmap Phase 04:
- Central Hardware Inventory and allocation tracking (`central_hardware_inventory`, `hardware_assignment_history`).
- Annual Maintenance Contracts (AMC) and Razorpay integration boundary (`amc_plans`, `amc_subscriptions`).
- Diagnostic Support Sessions (`support_diagnostic_sessions`).
- Platform Alerts and Monitoring (`platform_alerts`).
- Central Global Rate and FAT/SNF Adjustment Policy Management.

---

## 2. Findings & Gap Baseline

| Subsystem | Existing State (Prompt 02 Baseline) | Deficiencies Identified | Remediation Required |
|---|---|---|---|
| **Hardware Master** | Table `central_hardware_inventory` defined in migration 032. | Endpoints lacked strict Super Admin enforcement; some routes allowed platform operator mutations. | Applied `requireSuperAdminRole` to registration, assignment, unassignment, and status updates. |
| **AMC Subscriptions** | AMC plans and subscriptions defined; mock Razorpay verification existed. | Verification was mixed with milk payments; status calculations did not handle edge cases like `RENEWAL_DUE`. | Quarantined Razorpay verification strictly to AMC subscriptions; implemented status calculation based on 30-day renewal threshold. |
| **Support Sessions** | Stored in an in-memory `Map` within `PostgresSuperAdminRepository`. | Multi-instance failure risk; diagnostic sessions disappeared on server restart; no persistent audit trail. | Migrated to PostgreSQL `support_diagnostic_sessions` table with SHA-256 session token hash and check constraints. |
| **Global Rate Policies** | Missing from platform control plane. | Platform lacked central versioned pricing guidelines for federations; no cryptographic checksumming. | Created migration 033 with `global_rate_policies` and `global_rate_policy_versions` with SHA-256 checksums and state machine. |
| **Global FAT/SNF Policies** | Missing from platform control plane. | No centralized deduction guidelines; risk of arbitrary deduction rules at kiosk level. | Created migration 033 with `global_fat_snf_adjustment_policies` and `global_fat_snf_adjustment_policy_versions`. |
| **Platform Operator Boundary** | Operator had identical access to Super Admin in many routes. | Violation of least-privilege principle; operators could delete/mutate critical hardware or policies. | Split middleware into `requirePlatformStaffRole` (read-only) vs `requireSuperAdminRole` (mutations). |

---

## 3. Conclusion

All inspected gaps have been mapped into the implementation plan (`ROADMAP_PHASE_04_PLATFORM_SERVICES_PLAN.md`) and successfully resolved with 100% test verification.
