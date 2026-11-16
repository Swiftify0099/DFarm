# DFarm Dairy Admin Web — Known Limitations & Unresolved Business Decisions

In accordance with Section 21 and Section 26 of the master product specification, this report documents unresolved business policies, open governance decisions, and operational constraints that await final board alignment.

---

## 1. Unresolved Business Decisions

### 1.1 Shift Supervisor & Operator Hierarchy
- **Specification Status:** The exact organizational hierarchy between Shift Supervisors, Collection Operators, and Accountants has not yet been finalized by the platform leadership.
- **Current Implementation:** The application implements a flexible **Permission Matrix** (`StaffMember.permissions`) rather than a hardcoded role enum. Any operational account can be granted or restricted from individual actions (e.g. `MANAGE_COLLECTIONS`, `PERFORM_ADJUSTMENTS`, `GENERATE_BILLS`) dynamically via the backend.
- **Open Decision:** Whether Shift Supervisors should be allowed to perform collection weight corrections under ₹500 without Primary Dairy Admin two-factor confirmation.

### 1.2 Milk Pricing Formula Variations
- **Specification Status:** Different states and cooperative federations utilize differing pricing formulas (e.g., Two-Axis Fat/SNF Matrix vs. Pure Fat with SNF minimum benchmark vs. Total Solids formula).
- **Current Implementation:** The rate chart module supports the standard two-axis incremental matrix with strict versioning and immutable historical preservation.
- **Open Decision:** Confirmation of whether future multi-tier seasonal bonuses (e.g. Clean Milk Production bonus, cold-chain chilling bonus) will be modeled inside the rate matrix or as separate post-collection ledger adjustments.

### 1.3 Offline Sync Conflict Resolution Policy
- **Specification Status:** Collection kiosks can record milk collections while offline. If a farmer makes two deliveries at two separate kiosks before synchronization occurs, conflict resolution rules must apply.
- **Current Implementation:** Transactions use client-generated UUIDs and monotonic sequence numbers, which are merged chronologically based on hardware timestamp and signed device ID.
- **Open Decision:** Platform policy on how to handle anomalous duplicate timestamps if kiosk clocks drift.

---

## 2. Technical Scope Limitations in Phase 1

1. **Hardware Communication Protocol:** The physical RS-232 / USB / Bluetooth serial protocols connecting weighing balances and optical lactometers to the local kiosks are implemented on the kiosk hardware sidecar; this web application communicates with the kiosk via secure HTTPS/WebSocket cloud telemetry APIs.
2. **Thermal Receipt Printing:** Receipt generation renders clean printable layouts; direct raw ESC/POS thermal printer byte streaming requires the local kiosk driver daemon.
3. **Multi-Admin Delegation:** Following the platform rule, exactly one Primary Dairy Admin account exists per dairy. Sub-accounts are operational operators, not co-owners.
