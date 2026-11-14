# DFarm: 20-Phase Master Development Roadmap

This document outlines the systematic, phased execution plan for the DFarm Smart Dairy Management System, establishing clear objectives, deliverables, and acceptance criteria for each phase.

---

## 1. 20-Phase Roadmap Summary

| Phase # | Phase Name | Focus Domain | Status |
| :---: | :--- | :--- | :---: |
| **01** | **Complete Project Audit** | Inspection of workspace, tools, and requirements | **COMPLETED** |
| **02** | **Project Foundation & Architecture** | Git isolation, monorepo scaffold, complete architecture specs | **ACTIVE (Phase 02)** |
| **03** | **Central Database Schema & Supabase RLS**| PostgreSQL tables, constraints, functions, RLS policies, migrations | Planned |
| **04** | **Backend Core Service & API Gateway** | Node.js/TypeScript REST API, Auth, RBAC, input validation | Planned |
| **05** | **Offline-First Local DB & Sync Protocol**| Client SQLite schemas, two-way sync journal, idempotency engine | Planned |
| **06** | **Registration App: KYC & Mobile Flow** | Android customer KYC, E.164 phone validation, canonical UUID | Planned |
| **07** | **Biometric Face Enrollment Module** | Camera pipeline, face pose/quality gates, ONNX embedding generation | Planned |
| **08** | **RFID Card Assignment Module** | Unique card binding, revocation handling, NFC/card reader interfaces | Planned |
| **09** | **Customer Identification Engine** | Triple identification chain: Face $\rightarrow$ RFID $\rightarrow$ Supervisor override | Planned |
| **10** | **Rate Chart & Pricing Engine** | Cow and Buffalo rate matrices, formula pricing, historical snapshots | Planned |
| **11** | **Milk Collection & Session Engine** | Morning/Evening shifts, Fat/SNF/Weight validation, transaction logic | Planned |
| **12** | **Customer Ledger & Double-Entry Accounting** | Atomic ledger credits/debits, balance tracking, idempotency | Planned |
| **13** | **Collection Counter Application UI** | Intake counter terminal, rapid workflow UI, thermal receipt slips | Planned |
| **14** | **Feed Inventory & Store Sales** | Cattle feed catalog, stock tracking, point-of-sale customer debiting | Planned |
| **15** | **Monthly Billing & Settlements** | 10-day/monthly billing generator, advances, deductions, payout vouchers| Planned |
| **16** | **Staff Management & Isolated Payroll** | Staff directory, shift attendance, payroll ledger (isolated from dairy) | Planned |
| **17** | **Admin Web Dashboard** | React + TypeScript web portal, analytics, configuration, oversight | Planned |
| **18** | **Customer Mobile Application** | React Native/Expo self-service app, passbook, daily slips, bills | Planned |
| **19** | **Notifications & WhatsApp Integration** | Instant intake slips via WhatsApp, push alerts, monthly statements | Planned |
| **20** | **Hardening, E2E Testing & Release** | Security audit, performance benchmarks, staging deployment | Planned |

---

## 2. Phase 02 Milestone & Phase 03 Transition

- **Current Milestone (Phase 02):** Secure Git isolation achieved, monorepo directory tree created, complete architectural specifications authored, environment variable templates configured, and technical decision records established.
- **Immediate Next Milestone (Phase 03):** Design, write, and verify the central Supabase PostgreSQL migration scripts, table schemas, foreign key relationships, database functions, triggers, and Row Level Security (RLS) policies under `packages/database/`.

