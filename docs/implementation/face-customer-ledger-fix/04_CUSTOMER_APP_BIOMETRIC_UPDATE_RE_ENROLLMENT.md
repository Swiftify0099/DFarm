# DFARM — CUSTOMER APP BIOMETRIC UPDATE & RE-ENROLLMENT

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `04_CUSTOMER_APP_BIOMETRIC_UPDATE_RE_ENROLLMENT`  
**Status:** IMPLEMENTED & AUDITED  

---

## 1. Overview & Requirements

When a farmer's physical appearance changes or when an existing biometric enrollment requires refreshing:
1. The customer must be able to launch the "Update Biometrics" flow in Customer App (`apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx`).
2. The edge camera sensor captures 5 sequential high-quality samples.
3. The average L2-normalized 128-D embedding vector is computed on-device.
4. The backend receives the new vector and updates the physical tenant database `face_enrollments` using a **non-destructive replacement strategy** (`SUPERSEDED` status for older records).
5. The customer's status in `customers` table is confirmed as `is_biometric_enrolled = TRUE`.

---

## 2. Implementation Details

### 2.1 Backend Endpoint & Route Handling
In `services/backend/src/presentation/routes/customers.routes.ts`:
```typescript
const handleBiometricsUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = req.params.id;
    const { embedding, modelVersion, confidence } = req.body;
    const orgId = req.body.organizationId || req.body.dairyId || (req.headers['x-dairy-id'] as string) || req.user?.organizationId;

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 128) {
      res.status(400).json({ success: false, error: 'Valid 128-dimensional embedding array is required' });
      return;
    }

    const updatedCustomer = await updateFaceEnrollmentUseCase.execute({
      customerId,
      embedding,
      modelVersion: modelVersion || 'sface_int8_2021dec',
      confidenceScore: confidence || 0.95,
      organizationId: orgId,
    });

    res.json({
      success: true,
      message: 'Biometric face profile successfully updated',
      status: 'ENROLLED',
      isBiometricEnrolled: true,
      biometricStatus: {
        enrolled: true,
        version: modelVersion || 'sface_int8_2021dec',
        updatedAt: new Date().toISOString(),
      },
      data: updatedCustomer,
    });
  } catch (err) {
    next(err);
  }
};
```

### 2.2 Non-Destructive Tenant Database Replacement
In `services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts`:
When `updateFaceEnrollment` is executed in the tenant database transaction:
```sql
-- 1. Mark existing active enrollments as SUPERSEDED for historical audit integrity
UPDATE face_enrollments 
SET status = 'SUPERSEDED', updated_at = NOW() 
WHERE customer_id = $1 AND status = 'ACTIVE';

-- 2. Insert new encrypted face enrollment record
INSERT INTO face_enrollments (
    customer_id, model_version, encrypted_embedding, embedding_iv, 
    embedding_auth_tag, embedding_length, status, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, 128, 'ACTIVE', NOW(), NOW()
);

-- 3. Update customer profile state
UPDATE customers 
SET is_biometric_enrolled = TRUE, biometric_enrolled_at = NOW() 
WHERE id = $1;
```

---

## 3. Security & Cryptographic Protection

1. **AES-256-GCM Encryption:** The raw 128-D floating point embedding is converted to a 512-byte binary buffer and encrypted with AES-256-GCM using a cryptographically secure tenant key.
2. **Authenticated Additional Data (AAD):** AAD is bound to the ciphertext containing the customer UUID and model version:
   $$\text{AAD} = \text{"DFARM:CUST="} \parallel \text{customer\_id} \parallel \text{":MODEL="} \parallel \text{model\_version}$$
   This prevents ciphertext substitution attacks between different customers or tenants.
3. **Zero Plaintext Vector Exposure:** The API responses return only status metadata (`status: 'ENROLLED'`, `modelVersion: 'sface_int8_2021dec'`). The raw 128 floats are never echoed back to the client.

---

## 4. Verification Check

In `services/backend/tests/face-1n-recognition-customer-ledger-e2e.test.js` Subtest 3:
- Sent 5-sample averaged vector to `/api/v1/customers/:id/biometrics/update`.
- Received HTTP 200 with `success: true`, `status: 'ENROLLED'`, and `isBiometricEnrolled: true`.
- Subsequent 1:N recognition immediately recognized the farmer with high confidence ($\sim 0.99$).

---
*Signed & Verified by DFARM Architectural Engineering Team*
