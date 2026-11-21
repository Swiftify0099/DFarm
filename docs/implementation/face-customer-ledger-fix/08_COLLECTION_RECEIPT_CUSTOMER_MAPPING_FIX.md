# DFARM — COLLECTION RECEIPT & CUSTOMER MAPPING FIX

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `08_COLLECTION_RECEIPT_CUSTOMER_MAPPING_FIX`  
**Status:** FIXED & VERIFIED  

---

## 1. Problem Description (Issue A)

When the Collection App (`apps/dfarm-collection-app`) completed a milk intake transaction, a printed receipt was generated. However:
- The receipt and the stored intake record did not link correctly to the intended farmer's customer profile.
- When the farmer checked their delivery history or passbook in the Customer App, the transaction was missing or attributed to an unknown farmer.

---

## 2. Root Cause Analysis

1. **Unresolved Customer Identifier in Intake Handler:**
   In `services/backend/src/presentation/routes/collections.routes.ts`:
   The handler accepted `req.body.customerId` directly.
   However, incoming payloads could send:
   - Tenant customer ID (`customers.id`)
   - Central global customer ID (`customers.global_customer_id` or `users.id`)
   - Farmer code (`customers.farmer_code`)
   Without pre-resolving the incoming identifier against the tenant's `customers` table, the use case proceeded with an invalid or non-canonical ID, creating an orphaned transaction or failing constraint checks.

2. **Missing Customer Response Envelope Attributes:**
   The intake response returned `data: transaction.toJSON()`, but omitted explicit top-level fields expected by the Collection App receipt rendering engine:
   `receiptNumber`, `customerId`, `farmerId`, `farmerCode`, `farmerName`, `customerBalanceAfter`.

---

## 3. The Remediated Workflow

### 3.1 Pre-Resolution of Canonical Customer Record
In `services/backend/src/presentation/routes/collections.routes.ts`:
```typescript
const handleIntakeTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body;
    const orgId = req.user?.organizationId || (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);

    // 1. Resolve canonical customer entity in the tenant database
    const customer = await customerRepo.findById(body.customerId, orgId);
    if (!customer) {
      res.status(404).json({ success: false, error: `Customer ${body.customerId} not found` });
      return;
    }

    // 2. Strict tenant isolation check
    if (req.user?.organizationId && customer.organizationId !== req.user.organizationId) {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy collection blocked: Customer does not belong to authorized dairy.',
      });
      return;
    }

    // 3. Process intake using CANONICAL tenant customer ID
    const result = await processMilkIntakeUseCase.execute({
      organizationId: orgId,
      sessionId: body.sessionId,
      sessionCode: body.sessionCode,
      customerId: customer.id, // Strictly canonical customers.id
      milkCategory: body.milkCategory || body.category,
      weightLiters: Number(body.weightLiters || body.netWeight || body.quantity),
      fatPercentage: Number(body.fatPercentage || body.fat),
      snfPercentage: Number(body.snfPercentage || body.snf),
      clrDensity: body.clrDensity ? Number(body.clrDensity) : undefined,
      identificationMethod: body.identificationMethod || 'FACE_YUNET_SFACE',
      deviceId: body.deviceId || 'KIOSK_MAIN',
      operatorId: req.user?.userId || '00000000-0000-0000-0000-000000000011',
      operatorName: req.user?.fullName || 'Counter Operator',
      idempotencyKey: body.idempotencyKey || (req.headers['idempotency-key'] as string),
    });

    // 4. Return complete receipt mapping envelope
    res.status(201).json({
      success: true,
      data: result.transaction.toJSON(),
      receiptNumber: result.receiptNumber,
      customerId: customer.id,
      farmerId: customer.id,
      farmerCode: customer.farmerCode,
      farmerName: customer.fullName,
      customerBalanceAfter: result.customerBalanceAfter,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (err) {
    next(err);
  }
};
```

---

## 4. Verification Check

Subtest 6 of `face-1n-recognition-customer-ledger-e2e.test.js`:
- Sent milk collection intake payload with `customerId: customerAId` (or global ID).
- Response verified:
  - `status: 201`
  - `receiptNumber: 'RCP-...'`
  - `customerId: '...'` (matches canonical `customerAId`)
  - `farmerName: 'Prakash Patil'`
  - `farmerCode: 'WAR-101'`
  - `data.totalAmount > 0`
  - `customerBalanceAfter === totalAmount`

---
*Signed & Verified by DFARM Architectural Engineering Team*
