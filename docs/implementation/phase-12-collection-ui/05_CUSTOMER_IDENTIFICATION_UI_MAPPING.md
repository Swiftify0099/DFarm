# DFARM PHASE 12 — CUSTOMER IDENTIFICATION UI MAPPING
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** SPECIFICATION & BINDING CONTRACT  
**Date:** 2026-11-18  

---

## 1. Unified Customer Identification Strategy

The new single-screen collection counter unifies all four identification methods supported by DFarm into a single cohesive UI panel:

1. **Farmer Code / Identifier Typing**: Quick keyboard input with `Enter` resolution.
2. **Mobile Number Lookup**: 10-digit mobile number lookup.
3. **Contactless RFID Card**: Automatic detection via USB wedge reader or Web Serial.
4. **Biometric Face Recognition**: Live OpenCV YuNet face detection with 128-D SFace INT8 embedding matching.

---

## 2. Customer Identification States Matrix

| State # | Identity State | Visual Badge / Indicator | Action / Feedback | Counter Lock State | Audio Announcer |
|---|---|---|---|---|---|
| **1** | `WAITING_FOR_PATRON` | `Waiting for Patron` (Amber badge) | Farmer code input focused; camera in standby or ready | Intake Locked: "Identify patron first" | None |
| **2** | `CAMERA_STARTING` | `Camera Starting` (Cyan spinner) | MediaDevices stream initializing | Intake Locked | None |
| **3** | `FACE_DETECTED` | `Face Detected` (Cyan badge) | YuNet bounding box & landmarks drawn on canvas | Intake Locked | None |
| **4** | `FACE_MATCHED` | `Matched (98%)` (Emerald badge) | Patron loaded into Dossier card; preferred milk category set | Intake Unlocked (if measurements valid) | "Patron identified: <FullName>" |
| **5** | `RFID_DETECTED` | `Reading Card...` (Orange pulse) | UID captured from card wedge | Intake Locked | None |
| **6** | `RFID_MATCHED` | `RFID Matched` (Emerald badge) | Patron loaded into Dossier card; preferred milk category set | Intake Unlocked (if measurements valid) | "Patron identified: <FullName>" |
| **7** | `FARMER_LOADED_KEYBOARD` | `Loaded via Code` (Emerald badge) | Patron loaded directly via keyboard code/mobile lookup | Intake Unlocked (if measurements valid) | "Patron identified: <FullName>" |
| **8** | `FARMER_NOT_FOUND` | `Farmer Not Found` (Rose badge) | Inline error message: "No active patron with code X" | Intake Locked | "Farmer not found" |
| **9** | `FACE_RFID_MISMATCH` | `Identity Conflict` (Red Alert Banner) | Camera patron != RFID patron. Intake hard locked | Intake Hard Locked | Conflict warning; Supervisor override required |
| **10** | `CUSTOMER_SUSPENDED` | `Suspended / Inactive` (Red badge) | Warning banner: "Patron account suspended by dairy admin" | Intake Hard Locked | None |
| **11** | `MANUAL_OVERRIDE` | `Supervisor Override` (Blue badge) | Manual selection via F2 directory overrides hardware conflict | Intake Unlocked (if measurements valid) | "Supervisor override accepted" |
| **12** | `IDENTIFICATION_RESET` | `Ready for Next Patron` | Resets active patron, tares scale, ready for next intake | Intake Locked | None |

---

## 3. Data Privacy & Projection Rules

In accordance with strict security and privacy standards:
1. **Masked Mobile Numbers**: Displayed as `+91 9822******` or `+91 ******1234` in the counter interface. Full 10 digits are never displayed on public kiosk screens.
2. **Hidden Biometric Embeddings**: Raw 128-D vector arrays are strictly confined to WASM memory and never exposed in DOM attributes or text.
3. **No Bank / Sensitive Credentials**: Bank account numbers, IFSC codes, and passwords are not returned to the counter client.
4. **Permitted Category Enforcement**: If a customer is registered only for `COW` milk, selecting `BUFFALO` triggers an advisory warning.

---
**Identification Mapping Complete.**
