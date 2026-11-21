# DFarm Database Test Data Cleanup Report

**Document Version**: 1.0  
**Status**: Classification, Deletion Plan & Safety Protocol  
**Auditor**: DFarm Production Readiness Engineering

---

## 1. Classification of Discovered Test Data

Per user safety rules:
- Records are classified based on known seed scripts, controlled test IDs, and explicit code provenance.
- Confirmed test records will be removed from fallback initializers and test scripts.
- Ambiguous or real business records are preserved.

| Record / Dataset | Location / Provenance | Classification | Proposed Action |
|---|---|---|---|
| Dummy Customers (`Pandurang Patil`, `Sunita Shinde`, `Aniket Jadhav`, `Namdev Gaikwad`) | `PostgresPool.ts:265-270` | Confirmed Test Data | Remove seed statements from runtime fallback |
| Dummy Shift Sessions (`SH-20261115-M-GOKUL`, `SH-20261115-M-WARNA`) | `PostgresPool.ts:377-398` | Confirmed Test Data | Remove seed statements from runtime fallback |
| Demo Activation Token (`demo-activation-token`) | `dairies.routes.ts:1366-1385` | Confirmed Test Data | Delete demo token and in-memory pre-seed |
| Super Admin Seed Tenants | `apps/dfarm-super-admin/src/services/seedData.ts` | Confirmed Test Data | Decouple from production build |
| Dairy Admin Mock Server Store | `apps/dfarm-dairy-admin/src/api/mock-server.ts` | Confirmed Test Data | Decouple from production build |
| Collection App Mock Customers | `apps/dfarm-collection-app/src/api/mock-backend.ts` | Confirmed Test Data | Decouple from production build |
| Customer App Hardcoded Dairies Fallback | `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts:188-384` | Confirmed Test Data | Remove fallback array |
| Customer App Hardcoded Bills & Ledger | `apps/dfarm-customer-app/src/features/bills/useBills.ts`, `useLedger.ts` | Confirmed Test Data | Remove fake fallback arrays |
| Valid Super Admin Account (`Pankaj Popat Yewale`, `+917755995615`) | `030_super_admin_pankaj_popat_yewale.sql`, `.env` | Genuine Platform Identity | Preserve |
| Real Registered Tenant (`kalpna mlik's`, `DF-SAN-8897`, Sangli) | Real database migration `028` / Supabase | Genuine Business Record | Preserve |

---

## 2. Safety & Rollback Protocol

1. **Production Table Safety**:
   - Zero `TRUNCATE TABLE` commands will ever be run on production database tables.
   - Zero destructive `DROP TABLE` commands will be executed.
   - Referential integrity is protected via `ON DELETE RESTRICT` constraints on customer and transaction tables.
2. **Runtime Code Cleansing**:
   - The primary source of test records entering the running applications was frontend mock fallback catch-blocks and in-memory database seeders. Removing these eliminates synthetic records from ever appearing in operational screens.
3. **Empty State Fidelity**:
   - After cleanup, when a new dairy or farmer registers and has no historical collections, the applications will faithfully display empty state screens (`No collections recorded today`, `No bills generated yet`) rather than inventing mock records.
