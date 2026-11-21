# DFARM — POST P0 FACE BIOMETRIC API CONTRACT & MOBILE RUNTIME RECOVERY
## 02. BIOMETRIC API CONTRACT MATRIX

**Execution Reference:** `DFARM-FACE-P0-API-RUNTIME-RECOVERY`  
**Execution Timestamp:** 2026-11-20  
**Target Subsystems:** `apps/dfarm-customer-app`, `services/backend`, `apps/dfarm-collection-app`  
**Status:** FULLY SPECIFIED & VERIFIED  

---

### 1. Master Contract Specification Matrix

| Endpoint | Verb | Purpose | Required Headers | Request Body Schema | Success Response (200/201) | Error Codes & Conditions |
|---|---|---|---|---|---|---|
| `/api/v1/identity/face/detect-and-embed` | `POST` | Live neural inference (OpenCV YuNet + SFace INT8). Extracts 128-D vector from camera base64 JPEG/PNG. | `Content-Type: application/json`<br>`Authorization: Bearer <token>` (optional)<br>`X-Client-App: DFarm-Customer-Android` | `imageBase64: string` (min length 100) | `success: true`<br>`faceCount: number`<br>`isAligned: boolean`<br>`embedding?: number[128]`<br>`landmarks?: number[5][2]`<br>`boundingBox?: object`<br>`modelVersion: "sface_int8_2021dec"`<br>`latencyMs: number` | `400`: Missing/invalid base64 image.<br>`500`: Neural engine inference failure. |
| `/api/v1/identity/face/match` | `POST` | 1:1 or 1:N face verification against enrolled template in Dairy Tenant DB. | `Content-Type: application/json`<br>`Authorization: Bearer <token>`<br>`X-Organization-Id: <dairy-uuid>` | `embedding?: number[128]` OR `imageBase64?: string`<br>`customerId?: string` (or `'me'`)<br>`organizationId?: string` | `success: true`<br>`isMatch: boolean`<br>`matched: boolean`<br>`similarityScore: number`<br>`confidenceScore: number`<br>`farmerName?: string`<br>`farmerCode?: string`<br>`status: string` | `400`: Missing vector and image payload.<br>`401`: Missing token.<br>`403`: Cross-dairy matching blocked.<br>`404`: `ENROLLMENT_NOT_FOUND` (if customer not enrolled). |
| `/api/v1/identity/face/templates` | `GET` | Bulk download of encrypted/decrypted face gallery for offline milk collection counter. | `Authorization: Bearer <token>`<br>`X-Dairy-Tenant-Id: <uuid>` OR `X-Organization-Id: <uuid>` | Query parameters:<br>`organizationId?: string`<br>`centerId?: string` | `success: true`<br>`count: number`<br>`data: Array<{`<br>&nbsp;&nbsp;`templateId: string,`<br>&nbsp;&nbsp;`customerId: string,`<br>&nbsp;&nbsp;`farmerCode: string,`<br>&nbsp;&nbsp;`fullName: string,`<br>&nbsp;&nbsp;`embedding: number[128] | null`<br>`}>` | `401`: Unauthorized kiosk session.<br>`403`: Cross-dairy gallery access blocked. |
| `/api/v1/customers/:id/biometrics/update` | `POST` / `PUT` | Persists validated 128-D template into Dairy Tenant DB with AES-256-GCM encryption. | `Content-Type: application/json`<br>`Authorization: Bearer <token>`<br>`X-Organization-Id: <uuid>` | `embedding: number[128]`<br>`modelVersion?: string`<br>`confidence?: number`<br>`customerId?: string`<br>`organizationId?: string` | `success: true`<br>`isBiometricEnrolled: true`<br>`message: string`<br>`customerId: string`<br>`status: "ENROLLED"`<br>`biometricStatus: {`<br>&nbsp;&nbsp;`isEnrolled: true,`<br>&nbsp;&nbsp;`status: "ENROLLED",`<br>&nbsp;&nbsp;`version: "sface_int8_2021dec",`<br>&nbsp;&nbsp;`enrolledAt: string`<br>`}` | `400`: Dimension != 128 or non-finite numbers.<br>`401`: Missing auth token.<br>`403`: Cross-customer or cross-dairy tampering.<br>`404`: Customer not found in specified Dairy. |
| `/api/v1/customers/me/biometrics/update` | `POST` / `PUT` | Explicit alias for authenticated customer self-biometric update. | `Content-Type: application/json`<br>`Authorization: Bearer <token>`<br>`X-Organization-Id: <uuid>` | Same as `/:id/biometrics/update`. `:id` is automatically bound to `req.user.userId`. | Same as `/:id/biometrics/update`. | Same as `/:id/biometrics/update`. |
| `/api/v1/customers/biometrics/update` | `POST` / `PUT` | Unparameterized endpoint resolving target customer from token or body claims. | `Content-Type: application/json`<br>`Authorization: Bearer <token>`<br>`X-Organization-Id: <uuid>` | Same as `/:id/biometrics/update`. | Same as `/:id/biometrics/update`. | Same as `/:id/biometrics/update`. |
| `/api/v1/customers/me` | `GET` | Retrieves authenticated farmer profile, membership status, and biometric enrollment status. | `Authorization: Bearer <token>`<br>`X-Organization-Id: <uuid>` | None (body empty) | `success: true`<br>`data: {`<br>&nbsp;&nbsp;`id: string,`<br>&nbsp;&nbsp;`fullName: string,`<br>&nbsp;&nbsp;`farmerCode: string,`<br>&nbsp;&nbsp;`isBiometricEnrolled: boolean,`<br>&nbsp;&nbsp;`biometricStatus: { isEnrolled, status, version }`<br>`}` | `401`: Missing/expired token.<br>`404`: Farmer profile not found. |

---

### 2. Biometric Vector Validation Constraints

All incoming biometric vectors MUST pass the following mathematical validation rules before acceptance:

```typescript
// Strict 128-D Unit L2 Normalization Contract
export function isFiniteEmbedding(vec: unknown): vec is number[] {
  if (!Array.isArray(vec) || vec.length !== 128) return false;
  return vec.every((n) => typeof n === 'number' && Number.isFinite(n) && !Number.isNaN(n));
}

export function isUnitNormalized(vec: number[], tolerance = 1e-3): boolean {
  const normSq = vec.reduce((acc, val) => acc + val * val, 0);
  return Math.abs(Math.sqrt(normSq) - 1.0) < tolerance;
}
```

- **Dimension:** Strictly `128` floating-point numbers.
- **Value Constraints:** Every component $v_i \in [-1.0, 1.0]$.
- **L2 Norm:** $\|v\|_2 = \sqrt{\sum_{i=1}^{128} v_i^2} = 1.0 \pm 0.001$.
- **Model Key:** `sface_int8_2021dec` (OpenCV SFace INT8 quantized network).
- **Cosine Threshold:** `0.363` (official OpenCV SFace threshold for false acceptance rate $< 0.1\%$).
