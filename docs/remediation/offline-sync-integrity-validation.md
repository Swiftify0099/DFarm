# Offline Synchronization & Edge Security Validation
**DFarm — Smart Dairy Management System**  
**Remediation Deliverable 07**  

---

## 1. Unified Synchronization Architecture

Prior to remediation, sync table references were fragmented between `sync_queue` (Migration 011), `sync_events` (P04/P09), and `device_sync_state`.
Remediation reconciled this into **one consistent event-driven outbox architecture**:

```
+-------------------------------------------------------------+
|                     PostgreSQL Database                     |
|  +--------------------+             +--------------------+  |
|  |    sync_events     | <---------  |  Lifecycle RPCs    |  |
|  |  (Monotonic Seq)   |             |  & Direct Mutations|  |
|  +--------------------+             +--------------------+  |
|           |                                                 |
|           v                                                 |
|  +--------------------+             +--------------------+  |
|  |  sync_tombstones   |             |  device_sync_state |  |
|  |  (Entity Purges)   |             |  (High-Water Mark) |  |
|  +--------------------+             +--------------------+  |
+-------------------------------------------------------------+
                            ^
                            | Pull / Push Sync (JSON Batch)
                            v
+-------------------------------------------------------------+
|                  Android Edge Tablets                       |
|  +--------------------+             +--------------------+  |
|  |  Local SQLite DB   |             | Outbox Event Queue |  |
|  +--------------------+             +--------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Table-Name Reconciliation

1. **`public.sync_events`**: Primary append-only transaction log for delta replication. Uses `sequence_number BIGSERIAL` to provide strict monotonically increasing cursor ordering.
2. **`public.sync_tombstones`**: Durable registry of deleted or revoked entities (`customers`, `face_enrollments`, `rfid_card_assignments`). Prevents revived zombie records on edge devices.
3. **`public.sync_conflict_records`**: Logs rejected push mutations or deterministic resolution outcomes.
4. **`public.device_sync_state`**: Tracks last acknowledged sequence number (`last_synced_sequence`) per authorized device.

---

## 3. Device Authorization & Security Hardening

- **Device Registration (`POST /api/v1/devices/register`)**:
  - Remediated from an open unauthenticated endpoint to a strictly protected route.
  - Requires valid JWT authentication and RBAC role: `SUPER_ADMIN`, `DAIRY_OWNER`, or `CENTER_MANAGER`.
  - Binds device certificate, hardware UUID, and center assignment.
- **Center Offline Policy (`center_settings`)**:
  - Enforces `max_offline_hours` (default 72h). Devices exceeding offline window are locked until server re-authentication.
  - Requires approved offline policy (`limits_approved = true`).

---

## 4. 22 Offline Synchronization Scenarios

All 22 edge sync scenarios were validated in `offline-sync-22-scenarios.test.js`:

| Scenario ID | Test Case | Expected Behavior | Verification Status |
|---|---|---|---|
| SC-01 | Fresh Device Initial Pull | Full snapshot hydrated with high-water sequence | PASS |
| SC-02 | Incremental Delta Pull | Only new events returned since cursor | PASS |
| SC-03 | Customer Creation Push | Edge offline draft merged atomically | PASS |
| SC-04 | Soft Deletion Tombstone Pull | Deleted customer purged from edge Room DB | PASS |
| SC-05 | Customer Restore Push | Re-activates customer with correct pending state | PASS |
| SC-06 | RFID Assignment Push | Links card UID; marks card ACTIVE | PASS |
| SC-07 | RFID Card Revocation Push | Revokes card on edge; invalidates immediate tap | PASS |
| SC-08 | Biometric Consent Revocation | Emits tombstone; purges edge face vector | PASS |
| SC-09 | New Face Model Deployment | Edge updates model version ID | PASS |
| SC-10 | Milk Intake Session Push | Intake batch committed into central ledger | PASS |
| SC-11 | Idempotent Session Re-Push | Duplicate payload rejected; returns original receipt | PASS |
| SC-12 | Weight/Quality Out-of-Bounds Push| Marked INVALID on server if limits exceeded | PASS |
| SC-13 | Supervisor Override Push | Preserves supervisor credential in audit trail | PASS |
| SC-14 | Center Limits Push Sync | Updates center validation boundaries on edge | PASS |
| SC-15 | Rate Chart Version Push | Pulls latest grid prices; verifies checksum | PASS |
| SC-16 | Clock Skew Mitigation | Server timestamps override edge skew (> 5 min) | PASS |
| SC-17 | Device Revocation Push | Revoked device immediately rejected (403 Forbidden)| PASS |
| SC-18 | Network Interruption Mid-Batch | Partial batch rollback; cursor unchanged | PASS |
| SC-19 | Conflicting Customer Edit | Last-Write-Wins based on authoritative server clock| PASS |
| SC-20 | Exceeded Max Offline Window | Device forced to re-authenticate with server | PASS |
| SC-21 | Unassigned Center Isolation | Tablet cannot pull data belonging to other centers | PASS |
| SC-22 | Large Batch Pagination | Sync stream chunks 500 events per page | PASS |
