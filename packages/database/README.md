# Database Migrations & Schemas (packages/database)

Central PostgreSQL database management:
- Supabase SQL migrations & schema definitions
- Row Level Security (RLS) policies for multi-center and customer isolation
- Relational tables: customers, face_enrollments, rfid_cards, rate_charts, milk_collections, customer_ledger, monthly_bills, feed_inventory, payroll
- Sync event journals, tombstones, and audit logs
- Track-partitioned migration catalog (`SHARED`, `CONTROL_PLANE`, `TENANT_OPERATIONAL`) through `049_customer_beneficiary_bank_encryption_and_mask.sql` (`TENANT_OPERATIONAL` customer bank ciphertext width, `bank_account_mask`, and `create_customer_payout` mask alignment)
- Seed datasets for development and testing

*Implementation scheduled for Phase 03.*

