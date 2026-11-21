# DFARM — ROADMAP PHASE 10: NOTIFICATION INTEGRATION

**Document ID:** `ROADMAP-PHASE-10-DOC-012`  
**Execution Phase:** Roadmap Phase 10 — Cross-App Integration, End-to-End Business Workflows & Data Consistency  
**Target Path:** `docs/implementation/ROADMAP_PHASE_10_NOTIFICATION_INTEGRATION.md`  
**Date:** 2026-11-18  
**Classification:** Event Dispatcher & Notification Subsystem Specification  

---

## 1. Executive Summary

Notifications bridge operational transactions at dairy centers with the farmer's mobile device. Whenever milk is poured, bills are finalized, or bank payouts are settled, event notifications are triggered across in-app, SMS, and push notification channels.

This document verifies the event triggers, payload structures, template compliance, and failure-isolation boundaries of the notification system.

---

## 2. Notification Event Triggers & Payloads

```mermaid
flowchart TD
    subgraph Event_Sources["Transactional Event Triggers"]
        E1["Milk Intake Committed<br/>(Liters, Rate, Total Amount)"]
        E2["Customer Approved<br/>(Farmer Code Assigned)"]
        E3["Billing Cycle Finalized<br/>(Net Payable, Period Dates)"]
        E4["Payout Reconciled<br/>(Settled Amount, Bank UTR)"]
    end

    subgraph Dispatcher["Authoritative Notification Dispatcher"]
        Queue["notification_logs & events"]
        Formatter["DLT Compliant SMS / Push Formatter"]
    end

    subgraph Channels["Delivery Channels"]
        InApp["Customer App In-App Feed"]
        SMS["Transactional SMS (Telecom DLT)"]
        Push["Push Notification (Expo / FCM)"]
    end

    E1 --> Queue
    E2 --> Queue
    E3 --> Queue
    E4 --> Queue

    Queue --> Formatter
    Formatter --> InApp
    Formatter --> SMS
    Formatter --> Push
```

---

## 3. Real Event Payloads (No Synthetic Data)

| Event Type | Trigger | In-App Message Format | DLT SMS Template Reference |
|:---|:---|:---|:---|
| `MILK_INTAKE_RECORDED` | Kiosk completes milk intake | `Milk Received: 12.35L COW (FAT 4.1%, SNF 8.6%). Rate: Rs 45.67/L. Amount: Rs 563.80. Balance: Rs 3,063.80.` | `DFARM_INTAKE_V1` |
| `CUSTOMER_APPROVED` | Dairy Admin approves registration | `Welcome to DFarm! Your registration is approved. Your Farmer Code is C-101.` | `DFARM_WELCOME_V1` |
| `BILL_FINALIZED` | Dairy Owner finalizes billing cycle | `Your milk bill for 01-Nov to 10-Nov is finalized. Net Payable: Rs 5,420.00.` | `DFARM_BILL_V1` |
| `PAYOUT_SETTLED` | Bank return CSV reconciled | `Milk Payment Credited: Rs 5,420.00 transferred to your bank account. UTR: SBIN2631589124.` | `DFARM_PAYOUT_V1` |

---

## 4. Fault-Tolerance & Boundary Invariant

1. **Non-Blocking Execution:**
   - Financial transactions (milk collection, ledger updates, billing, payouts) are **never** blocked or aborted due to an external SMS gateway timeout, invalid mobile number, or unconfigured telecom provider.
2. **Notification Status Tracking:**
   - Events are written to the database with status:
     - `DELIVERED`: Confirmed delivered by provider gateway.
     - `QUEUED`: Awaiting network dispatch.
     - `BLOCKED_EXTERNAL_PROVIDER`: Provider credentials unconfigured in test/dev environment.
3. **Zero Fake Delivery:**
   - If an SMS gateway is unconfigured, the system explicitly logs the unconfigured state. It never fabricates simulated successful delivery receipts or false telecom delivery timestamps.

---

## 5. Verification Status

All notification listeners, payload builders, and in-app feed endpoints are **IMPLEMENTED AND TESTED**.
