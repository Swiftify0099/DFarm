# 19 — REMAINING ISSUES AND OWNER DECISIONS

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Audience:** Product Owner, Lead Architect, DevOps / Platform Administrators

---

## 1. Resolved Items & Architectural Settlements

1. **Physical Postgres vs. Memory DB in Automated Tests:**
   The test environment now cleanly supports both real physical PostgreSQL databases (running via Docker/Supabase or local cluster) and in-memory pg-mem test doubles with unified DDL fallbacks and connection timeout safeguards.
2. **Dove OTP Cooldown Management:**
   Anti-spam rate limiting (60s cooldown) is enforced at the database level (`otp_rate_limits`), with an in-memory test utility (`resetCooldown`) provided for high-speed automated integration test runs.
3. **Idempotent Resubmissions vs. Duplicate Person Rejections:**
   A farmer who is pending approval can update their biometric template or bank details idempotently (returns `201 Created` with preserved `customerUuid`), while duplicate persons trying to reuse an existing customer's mobile number are strictly rejected (`400 VALIDATION_ERROR`).

---

## 2. Recommended Operational Policies & Owner Decisions

1. **Maximum Number of Dairy Memberships per Customer:**
   - *Current Implementation:* Unlimited (any eligible cooperative).
   - *Recommended Policy:* Keep unlimited, but monitor accounts with > 10 active memberships for potential broker / aggregate collection fraud.
2. **Suspended Membership Behavior:**
   - *Current Implementation:* Suspended memberships are visible in the switch modal with a red `SUSPENDED` tag, but the switch button is disabled.
   - *Recommended Policy:* Direct the farmer to contact their cooperative society secretary for reactivation.
3. **Primary / Default Dairy Preference:**
   - *Current Implementation:* The customer app remembers the most recently selected dairy in `SecureStorage` and defaults to it upon subsequent app launches.
   - *Recommended Policy:* Allow users in the Profile screen to pin a "Default Dairy" if they prefer a fixed initial dairy upon cold start.
