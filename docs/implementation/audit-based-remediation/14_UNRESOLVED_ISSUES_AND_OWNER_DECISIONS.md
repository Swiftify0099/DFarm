# DFARM — UNRESOLVED ISSUES AND OWNER DECISIONS

**Document ID:** `14_UNRESOLVED_ISSUES_AND_OWNER_DECISIONS`  
**Scope:** Formal Inventory of Items Pending Field Data or Product Governance Decisions  
**Status:** COMPLETE & DOCUMENTED  
**Date:** 2026-11-18  

---

## 1. Governance Principles for Unresolved Findings

In strict compliance with the **Remediation Specification (Section 5.4)**:
> *"The transaction must not be silently treated as fully approved while its status still requires reconciliation. If approved policy does not clearly authorize a ledger credit before reconciliation, preserve the record and follow the controlled pending-reconciliation workflow. Do not invent a business rule."*

Biometric thresholds, security parameters, and business logic constants must not be arbitrarily altered without documented empirical evidence and formal owner sign-off.

---

## 2. Register of Pending / Unresolved Items

### Item 1: Biometric Face Cosine Similarity Threshold Field Calibration
- **Issue ID:** `DFARM-AUDIT-004`
- **Component:** `services/backend/src/infrastructure/biometrics/FaceModelService.ts`
- **Current Value:** `0.720` (Cosine distance threshold)
- **Status:** `PENDING_FIELD_CALIBRATION_DATASET`
- **Technical Context:**
  In Phase 10, the facial verification service used a baseline threshold of `0.720`. Audit finding `DFARM-AUDIT-004` questioned whether 0.720 was calibrated against real-world rural dairy conditions (variable sunlight, dust, low camera resolution on low-cost Android tablets, aging farmer faces).
- **Why Code Modification Was Withheld:**
  Modifying this threshold in code without an empirical field calibration dataset introduces serious risks:
  - Lowering threshold (e.g. to 0.60): Dramatically increases **False Accept Rate (FAR)**, allowing farmers to inadvertently record milk under another farmer's account.
  - Raising threshold (e.g. to 0.85): Dramatically increases **False Reject Rate (FRR)**, locking legitimate farmers out of biometric check-in during morning rush hours.
- **Owner Action Required:**
  1. Capture a benchmark validation dataset of at least 1,000 paired enrollment/verification images under representative collection center field conditions.
  2. Compute the ROC curve to identify the optimal threshold achieving FAR < 0.1% and FRR < 2.0%.
  3. Formal sign-off by Security Lead and Product Owner before updating the constant in `FaceModelService.ts`.
- **Interim Operational Mitigation:**
  The baseline threshold of `0.720` remains active. In the event of biometric verification failure at the collection center, the Collection App provides dual-factor fallback via SMS OTP or Supervisor PIN override, both of which generate immutable audit log records.

---

## 3. Register Summary

| Total Audit Issues | Resolved in Code & Verified | Pending Owner Decision / Data | False Positives |
|---|---|---|---|
| 10 | 9 | 1 (`DFARM-AUDIT-004`) | 0 |
