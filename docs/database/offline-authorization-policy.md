# Dynamic Offline Authorization Policy & Device Freshness

## 1. Problem Statement & Removal of Hardcoded Defaults

Previous design documents recorded an arbitrary hardcoded offline freshness window of **72 hours**. This duration had not received operational owner approval, introducing potential security and financial risk if stolen devices were allowed to capture milk collections indefinitely without central server authorization.

---

## 2. Dynamic Policy Configuration Architecture

In Phase 11, offline collection authorization is strictly dynamic and center/device-specific:

1. **Center Configuration**:
   - Stored in `center_settings.offline_max_hours` (integer hours) or `system_configurations.offline_authorization_policy`.
   - Permitted configuration values: between $4$ hours (single shift) and $48$ hours (weekend operations), requiring explicit `DAIRY_OWNER` approval.

2. **Device State & Expiry Tracking**:
   - Each POS / mobile device records its last successful central sync timestamp (`last_successful_sync_at`).
   - The device checks its offline validity against the configured policy:
     $$\Delta t = \text{Current Time} - \text{last\_successful\_sync\_at}$$
     $$\text{Authorized} \iff \Delta t \le \text{offline\_max\_hours}$$

3. **Strict Rejection of Missing Policy (`OFFLINE_POLICY_UNAPPROVED`)**:
   - If a device or center has no configured, approved offline policy in PostgreSQL or synced settings, the Android client and sync engine **refuse** to authorize offline collection sessions.
   - The system returns an explicit error: `OFFLINE_POLICY_UNAPPROVED`.
   - Never inject an arbitrary unapproved fallback default in production.

4. **Testing Protocol**:
   - Automated integration tests inject explicit test-only policies (`offlineMaxHours: 72`) via test setup mocks and clear them during teardown, ensuring production code never runs with fabricated defaults.

