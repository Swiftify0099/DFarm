# DFARM — ROOT CAUSE ISSUE CLOSURE MATRIX

**Document Identifier:** `12_ROOT_CAUSE_ISSUE_CLOSURE_MATRIX.md`  
**Execution Reference:** `DFARM-CUSTOMER-REGISTRATION-BIOMETRIC-PAYOUT-FIX`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Scope:** Matrix mapping reported problems, confirmed root causes, applied remediations, and verification tests.

---

## 1. COMPREHENSIVE CLOSURE MATRIX

| Issue ID | Reported Problem | Confirmed Root Cause | Applied Remediation | Verification Method | Status |
|---|---|---|---|---|---|
| **ISSUE-A1** | Customer Bank Details not collected in Mobile App | Form fields omitted from `register.tsx` and schema during Phase 06 data minimization pass. | Restored Clay inputs for Account Holder Name, Bank Account Number, Confirm Number, and IFSC in `register.tsx`; updated `types/customer.ts`. | `dfarm-customer-app` typecheck passed; form forwards bank payload. | **CLOSED** |
| **ISSUE-A2** | Bank details not available to Dairy Admin for Payout | Registrations lacked bank details, resulting in `NULL` bank fields in tenant DB. | Forwarded `bankDetails` in registration payload; updated Dairy Admin UI and API responses to securely present masked accounts. | `PendingApprovals.tsx` and `CustomerDetail.tsx` render bank credentials. | **CLOSED** |
| **ISSUE-B1** | Face Biometric Enrollment Fails with "Unexpected Server Error" | Multi-command prepared statement error in `PostgresCustomerRepository.save()` prevented `customer_tenant_lookup` creation; `BiometricUseCases` lacked `organizationId`. | Split DDL and DML in `save()`; passed `organizationId` across use cases and routes; added central membership resolution fallback. | Backend compiled cleanly; registration with biometric completes without 500 error. | **CLOSED** |
| **ISSUE-B2** | Face Biometric Compatibility between Mobile & Kiosk | Risk of embedding dimension mismatch or unnormalized vectors between React Native and Browser Vite. | Verified both platforms utilize OpenCV SFace INT8, 128-D vectors, L2 unit-length normalization, and $0.363$ threshold. | `dfarm-collection-app` built with Code 0; verified against canonical fixture. | **CLOSED** |
| **ISSUE-C1** | Maker–Checker Payout Batch Creation & Self-Approval Prevention | Need to verify end-to-end SOD workflow and prevent creator from approving own batch. | Enforced in `BatchService.approveBatch`; verified HTTP 403 `MAKER_CHECKER_SELF_APPROVAL_PROHIBITED`. | Phase 09 Test 15 passes. | **CLOSED** |
| **ISSUE-C2** | Bank Bulk File Export (NEFT / SBI CMP) | Need to ensure bank exports do not mutate ledger and stream with strict no-store headers. | Implemented in `BankFileService`; verified ephemeral single-use tokens and SHA-256 header. | Phase 09 Tests 17, 18, 19, 20 pass. | **CLOSED** |
| **ISSUE-C3** | Batch Item Deterministic Ordering & Ledger Settlement Sync | Batch items query lacked deterministic `ORDER BY`, causing reconciliation item index mismatch; tenant DB ledger needed sync. | Added `ORDER BY c.farmer_code ASC` in `createBatch` and `getBatchById`; added tenant DB ledger debit sync in `payout.service.ts`. | Code compiled cleanly and tested. | **CLOSED** |
| **ISSUE-C4** | Passbook Reflection & Real-time UTR Visibility | Farmer passbook must reflect settled payouts as DEBIT with genuine UTR reference. | Implemented in `LedgerService.getFarmerPassbookEntries` and mobile passbook UI. | Phase 09 Test 25 passes. | **CLOSED** |
