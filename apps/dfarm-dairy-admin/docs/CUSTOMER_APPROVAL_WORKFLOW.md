# DFarm Dairy Admin Web — Customer Approval Workflow

## 1. Onboarding Journey & Tenant Selection

When an independent dairy farmer installs the DFarm Customer App and completes their self-registration, they select their registered local dairy cooperative (e.g. `DF-GOKUL-01`).

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer (Customer App)
    participant Backend as Authoritative Dairy Backend
    actor Admin as Dairy Admin (Web Platform)
    participant Kiosk as Collection Kiosk / Device

    Farmer->>Backend: Submit Onboarding Application (Name, Mobile, Bank, Village)
    Farmer->>Backend: Capture Face & Agree to Biometric Processing (YuNet + SFace)
    Backend->>Backend: Validate mobile uniqueness within selected dairy
    Backend-->>Farmer: Status = PENDING_APPROVAL
    Backend-->>Admin: Emit Notification: New Customer Registration Pending

    Note over Admin: Admin opens /customers/approvals
    Admin->>Backend: Inspect Candidate Dossier (Face Quality, Consent Evidence)
    alt Approved by Dairy Admin
        Admin->>Backend: Execute POST /api/v1/customers/registrations/:id/approve
        Backend->>Backend: Generate unique customerCode (e.g. C-106)
        Backend->>Backend: Create Active Customer Record & Face Enrollment Record
        Backend->>Backend: Append Immutable Audit Log
        Backend-->>Farmer: Push Notification: "Membership Approved! Customer Code: C-106"
        Backend->>Kiosk: Sync Active Face Template to Device Cache
    else Rejected by Dairy Admin
        Admin->>Backend: Execute POST .../reject with Mandatory Reason
        Backend->>Backend: Set status = REJECTED, Store Rejection Rationale
        Backend->>Backend: Append Immutable Audit Log
        Backend-->>Farmer: Push Notification: "Registration Rejected: [Reason]"
    end
```

---

## 2. Mandatory Verification Rules

1. **No Automatic Approval**: Registrations are never activated by background timers or default triggers. The Dairy Admin must explicitly review identity and biometric evidence.
2. **Mobile Uniqueness**: A mobile number can belong to only one active customer within the dairy tenant.
3. **Biometric Quality Threshold**: The system verifies that the OpenCV YuNet landmarks and SFace INT8 template extraction achieved acceptable confidence (> 85%).
4. **Mandatory Rejection Rationale**: Rejections require an explicit, meaningful reason (minimum 5 characters).
5. **Audited Assignment**: Customer code generation (`C-XXX`) is sequential, atomic, and logged in audit history.
