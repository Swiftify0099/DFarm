# DATABASE OWNERSHIP MAP

**Audit Document Reference:** `DFARM-ARCH-007`  
**Version:** `1.0.0-PROMPT0-AUDIT`  
**Status:** `READ-ONLY TECHNICAL BASELINE`  
**Classification:** `Database Schema Ownership & Partitioning Matrix`  

---

## 1. Schema Partitioning Invariant

To achieve high scalability and legal compliance, every database table must belong strictly to either the **Central Control Plane Database** (`dfarm_central`) or a **Dedicated Tenant Operational Database** (`dfarm_tenant_[code]_[uuid8]`). No table may exist ambiguously across both contexts.

---

## 2. Exhaustive Table Ownership Mapping

| Table Name | Target DB Ownership | Defining Migration File | Primary Key | Key Foreign Keys & Relationships | Ownership Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `organizations` | **CENTRAL CONTROL PLANE** | `002_organizations_and_centers.sql` | `id` (UUID) | None | System-wide registry of all cooperative dairy tenants. |
| `dairy_centers` | **CENTRAL & TENANT PROFILE** | `002_organizations_and_centers.sql` | `id` (UUID) | `organization_id -> organizations(id)` | Central directory stores center locations; Tenant DB stores local centers. |
| `users` (Super Admin) | **CENTRAL CONTROL PLANE** | `003_user_identity_foundation.sql` | `id` (UUID) | `organization_id -> organizations(id)` | Root platform operators and Primary Dairy Admin root identities. |
| `dairy_database_mappings`| **CENTRAL CONTROL PLANE** | `031_dairy_database_mappings.sql` | `id` (UUID) | `dairy_id -> organizations(id)` | Master routing directory mapping each Dairy to its dedicated PostgreSQL DB. |
| `dairy_admin_invitations`| **CENTRAL CONTROL PLANE** | `029_dairy_admin_activation_tokens.sql` | `id` (UUID) | `dairy_id -> organizations(id)`, `admin_id -> users(id)` | Manages cryptographic activation tokens & email delivery status. |
| `hardware_master_inventory`| **CENTRAL CONTROL PLANE** | *Missing from current DDL* | `id` (UUID) | `assigned_dairy_id -> organizations(id)` | Central stock of analyzers, scales, and RFID readers across all dairies. |
| `dairy_amc_subscriptions`| **CENTRAL CONTROL PLANE** | *Missing from current DDL* | `id` (UUID) | `dairy_id -> organizations(id)` | Platform AMC subscription terms, Razorpay order IDs, renewal status. |
| `platform_alerts` | **CENTRAL CONTROL PLANE** | *Missing from current DDL* | `id` (UUID) | `dairy_id -> organizations(id)` | Platform-wide operational incidents, degraded sync states, and hardware alerts. |
| `platform_telemetry_events`| **CENTRAL CONTROL PLANE**| *Missing from current DDL* | `id` (UUID) | `dairy_id -> organizations(id)` | Real-time health metrics, query latencies, queue depths, AI anomaly logs. |
| `system_audit_logs` | **CENTRAL CONTROL PLANE** | `010_devices_sync_and_audit.sql` | `id` (UUID) | `actor_id -> users(id)` | Immutable platform-level audit ledger for Super Admin actions. |
| `controlled_support_sessions`| **CENTRAL CONTROL PLANE**| *Missing from current DDL* | `id` (UUID) | `dairy_id -> organizations(id)`, `operator_id -> users(id)`| Time-bounded, ticket-justified diagnostic access grants. |
| `customers` | **TENANT OPERATIONAL DB** | `004_customer_identity.sql` | `id` (UUID) | `organization_id -> organizations(id)`, `primary_center_id` | Farmer master directory under this specific dairy. Bank details stored here. |
| `customer_addresses` | **TENANT OPERATIONAL DB** | `004_customer_identity.sql` | `id` (UUID) | `customer_id -> customers(id)` | Farmer residential address, village, taluka, pincode. |
| `customer_milk_categories`| **TENANT OPERATIONAL DB**| `004_customer_identity.sql` | `id` (UUID) | `customer_id -> customers(id)` | Supply authorization for COW and/or BUFFALO milk. |
| `customer_consent_records`| **TENANT OPERATIONAL DB**| `004_customer_identity.sql` | `id` (UUID) | `customer_id -> customers(id)` | Explicit biometric consent audit trail. |
| `face_model_versions` | **TENANT OPERATIONAL DB** | `005_face_and_rfid.sql`, `013` | `id` (UUID) | None | Descriptor metadata for OpenCV YuNet and SFace INT8 (128-D vectors). |
| `face_enrollments` | **TENANT OPERATIONAL DB** | `005_face_and_rfid.sql` | `id` (UUID) | `customer_id -> customers(id)`, `model_version_id` | Encrypted 128-D face embeddings (AES-256-GCM), IV, auth tag, quality score. |
| `rfid_cards` | **TENANT OPERATIONAL DB** | `005_face_and_rfid.sql` | `id` (UUID) | None | RFID cards registered to this dairy. |
| `rfid_card_assignments` | **TENANT OPERATIONAL DB** | `005_face_and_rfid.sql` | `id` (UUID) | `customer_id -> customers(id)`, `rfid_card_id` | Assignment history linking RFID cards to farmers. |
| `rate_charts` | **TENANT OPERATIONAL DB** | `007_rate_management.sql`, `018` | `id` (UUID) | None | Dairy-specific milk rate charts with effective start/end timestamps. |
| `rate_chart_grids` | **TENANT OPERATIONAL DB** | `007_rate_management.sql`, `018` | `id` (UUID) | `rate_chart_id -> rate_charts(id)` | FAT/SNF rate matrix grid (2D step matrix). |
| `shift_sessions` | **TENANT OPERATIONAL DB** | `008_collection_sessions.sql`, `027` | `id` (UUID) | `center_id -> dairy_centers(id)`, `operator_id -> users(id)` | Morning / Evening milk intake shifts tied to kiosks. |
| `milk_collection_transactions`| **TENANT OPERATIONAL DB**| `008`, `017` | `id` (UUID) | `session_id`, `customer_id`, `rate_chart_id` | Immutable collection transaction (Weight, FAT, SNF, CLR, Amount, Sample Code).|
| `customer_ledger_accounts`| **TENANT OPERATIONAL DB**| `009_customer_ledger.sql`, `019` | `id` (UUID) | `customer_id -> customers(id)` | Financial accumulator maintaining current net balance due. |
| `ledger_entries` | **TENANT OPERATIONAL DB** | `009_customer_ledger.sql`, `019` | `id` (UUID) | `customer_id`, `account_id`, `transaction_id` | Double-entry journal entries (DEBIT/CREDIT) for milk credits and feed debits. |
| `monthly_billing_cycles` | **TENANT OPERATIONAL DB** | `020_automated_monthly_billing.sql`| `id` (UUID) | `center_id -> dairy_centers(id)` | Finalized billing cycle intervals (e.g. 1st-15th, 16th-end). |
| `customer_bills` | **TENANT OPERATIONAL DB** | `020_automated_monthly_billing.sql`| `id` (UUID) | `billing_cycle_id`, `customer_id` | Itemized bills with gross earnings, feed deductions, and net payable. |
| `payment_batches` | **TENANT OPERATIONAL DB** | `021_customer_payouts_batches.sql` | `id` (UUID) | `billing_cycle_id` | Bulk payment batch headers for NEFT/SBI corporate portal upload. |
| `customer_payouts` | **TENANT OPERATIONAL DB** | `021_customer_payouts_batches.sql` | `id` (UUID) | `batch_id`, `customer_id`, `bill_id` | Individual payout line items with bank details, UTR, and settlement state. |
| `feed_products` | **TENANT OPERATIONAL DB** | `014_feed_inventory.sql` | `id` (UUID) | None | Cattle feed inventory items (brand, bag size, sale price). |
| `feed_inventory_movements`| **TENANT OPERATIONAL DB**| `014_feed_inventory.sql` | `id` (UUID) | `product_id -> feed_products(id)` | Inward stock purchases, returns, and inventory counts. |
| `customer_feed_sales` | **TENANT OPERATIONAL DB** | `014_feed_inventory.sql` | `id` (UUID) | `product_id`, `customer_id` | Cattle feed sales charged to farmer ledger accounts. |
| `devices` | **TENANT OPERATIONAL DB** | `010_devices_sync_and_audit.sql` | `id` (UUID) | `center_id -> dairy_centers(id)` | Devices assigned to this dairy (analyzers, scales, RFID readers). |
| `sync_events` | **TENANT OPERATIONAL DB** | `010_devices_sync_and_audit.sql` | `id` (UUID) | `device_id -> devices(id)` | Offline intake transaction synchronization queue. |
| `audit_logs` | **TENANT OPERATIONAL DB** | `010_devices_sync_and_audit.sql` | `id` (UUID) | `user_id -> users(id)` | Append-only operational audit trail for tenant actions. |

---

## 3. Identification of Missing Tables in Migrations

The following tables are required by the business specification but **currently missing from PostgreSQL migrations**:
1. `hardware_master_inventory` (Platform-wide hardware inventory and warranty tracker).
2. `dairy_amc_subscriptions` (AMC subscription periods and Razorpay transaction records).
3. `controlled_support_sessions` (Audit and authorization for Super Admin temporary tenant access).
4. `platform_alerts` (System-wide alert lifecycle and acknowledgement records).
5. `platform_telemetry_events` (Time-series platform performance metrics and AI anomaly logs).
6. `platform_operators` (Granular capability mappings for Super Admin staff).

These tables must be introduced in Prompt 1 and Prompt 4 into the central control-plane database schema.
