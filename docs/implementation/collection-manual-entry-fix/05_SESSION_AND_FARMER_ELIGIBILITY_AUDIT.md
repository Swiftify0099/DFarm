# SESSION AND FARMER ELIGIBILITY AUDIT

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** Session Status & Farmer Registration/Delivery Validation  
**Execution Context:** Verification of session lifecycle and patron delivery rules

---

## 1. Shift Session Lifecycle Verification

### Table: `kiosk_shift_sessions`
- **Session States:** `'OPEN'`, `'CLOSED'`
- **Key Columns:**
  - `session_code`: Unique identifier (format: `SH-YYYYMMDD-[M|E]-<DEVICE>`)
  - `organization_id`: Tenant Dairy UUID
  - `center_id`: Collection Center UUID
  - `business_date`: Shift operational date
  - `shift`: `'MORNING'` or `'EVENING'`
  - `opening_operator_id`: UUID of the authenticated counter staff
  - `total_liters`, `cow_liters`, `buffalo_liters`, `transaction_count`, `total_amount`: Live running aggregates

### Lifecycle Invariants
1. Only sessions with `status = 'OPEN'` may accept milk intake transactions.
2. A session with `status = 'CLOSED'` must reject new intake with `SessionClosedError` (HTTP 409).
3. The Collection App UI must lock intake when `!activeSession` or `activeSession.status === 'CLOSED'`.

---

## 2. Farmer Eligibility & Multi-Dairy Isolation

### Entity: `Customer`
In `Customer.ts`:
```ts
public validateCanDeliver(category: MilkCategory): void {
  if (this.props.isDeleted) {
    throw new CustomerSuspendedError(`Farmer ${this.props.fullName} is no longer active.`);
  }
  if (this.props.status !== 'ACTIVE' || this.props.registrationStatus !== 'APPROVED') {
    throw new CustomerSuspendedError(`Farmer ${this.props.fullName} is not active or pending approval.`);
  }
  if (!this.props.permittedCategories.includes(category)) {
    throw new CategoryNotAuthorizedError(category, this.props.fullName);
  }
}
```

### Route-Level Enforcement
In `services/backend/src/presentation/routes/collections.routes.ts`:
```ts
if (req.user?.organizationId && customer.organizationId !== req.user.organizationId) {
  res.status(403).json({
    success: false,
    error: 'Cross-dairy collection blocked: Customer does not belong to authorized dairy.',
  });
  return;
}
```

### Validation Matrix

| Condition | Expected Status | Error Code | Verified? |
| :--- | :--- | :--- | :--- |
| Customer Not Found | `404 Not Found` | `CUSTOMER_NOT_FOUND` | Verified |
| Customer Belongs to Other Dairy | `403 Forbidden` | `FORBIDDEN` | Verified |
| Customer Pending Approval | `403 Forbidden` | `CUSTOMER_SUSPENDED` | Verified |
| Category Not Authorized (e.g. Buffalo when Cow-only) | `403 Forbidden` | `CATEGORY_NOT_AUTHORIZED` | Verified |
| Customer Approved & Eligible | `201 Created` | N/A (Transaction saved) | Verified |

---

## 3. Findings

Farmer eligibility rules correctly return `403 Forbidden` or `404 Not Found`, not `409 Conflict`.
The `409 Conflict` specifically arises when session verification fails (`SessionClosedError`), proving that farmer eligibility checks are operating correctly and are not the source of the 409 error.
