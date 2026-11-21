# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 03. UPDATE FACE 404 ROOT CAUSE INVESTIGATION

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  

---

### 1. Root Cause Breakdown

The HTTP 404 error on the Update Face Biometric feature was caused by a combination of three distinct defects:

#### Defect 1: Literal Route Greedy Capture by Express `:id` Wildcard
In Express router definitions, defining `router.post('/:id/biometrics/update')` without defining `router.post('/biometrics/update')` causes Express to interpret any URL with the structure `POST /customers/biometrics/update` as having `:id` equal to `"biometrics"`.
When the controller executed:
```typescript
const customer = await customerRepo.findById("biometrics", orgId);
```
No record in PostgreSQL has the UUID `"biometrics"`. The repository returned `null`, and the domain logic threw `CustomerNotFoundError("biometrics")`.

#### Defect 2: Central Global ID vs Tenant Customer ID Resolution
In DFARM's physical database per-dairy architecture:
1. `dfarm_central` stores the global customer identity (`global_customer_id`).
2. `dfarm_tenant_<hash>` stores the local tenant customer record (`id`).
When a farmer logs into the Customer App, the authentication JWT token payload contains:
```json
{
  "userId": "1b9f71c4-9588-4444-a2b1-098765432100", // Central global ID
  "role": "FARMER_CUSTOMER",
  "organizationId": "a1111111-4444-1111-1111-111111111111"
}
```
If the frontend did not pass an explicit tenant customer ID, or if the repository only queried `SELECT * FROM customers WHERE id = $1`, the lookup failed because the database column for the global identity is `global_customer_id`, not `id`.
The pre-fix code lacked secondary resolution against `global_customer_id`.

#### Defect 3: Missing Route Handler for `/me` Aliases
Customer mobile applications commonly use `/api/v1/customers/me/biometrics/update` or `/api/v1/customers/me/biometrics`. The pre-fix backend lacked explicit route definitions for these endpoints. When `/me` was provided, it also fell into the `:id` parameter, seeking a customer whose primary key was literal `"me"`.

---

### 2. Trace of Failing Execution

```
[Customer App Web/Mobile]
       │
       ▼
HTTP POST /api/v1/customers/biometrics/update
Headers: { Authorization: "Bearer ...", X-Organization-Id: "a111..." }
Body: { embedding: [0.082, -0.013, ...] }
       │
       ▼
[Express Router in services/backend]
Matching routes in customers.routes.ts...
Matches: router.post('/:id/biometrics/update')
Parameters: req.params = { id: "biometrics" }
       │
       ▼
[handleBiometricsUpdate Controller]
const customerId = req.params.id; // "biometrics"
const customer = await customerRepo.findById("biometrics", orgId);
Query: SELECT * FROM customers WHERE id = 'biometrics' AND organization_id = 'a111...'
Database result: 0 rows found.
       │
       ▼
throw new CustomerNotFoundError("biometrics")
       │
       ▼
[Centralized Error Middleware]
Maps CustomerNotFoundError -> HTTP 404
Response: { success: false, error: "Customer 'biometrics' not found." }
       │
       ▼
[Customer App Axios Client]
Displays UI toast: "Request failed with status code 404"
```

---

### 3. Resolution Verification

1. Route declarations were restructured so that `/biometrics/update`, `/biometrics`, `/me/biometrics/update`, and `/me/biometrics` are registered **before** any parameterized `/:id` routes.
2. In `handleBiometricsUpdate`, parameter normalization was introduced:
   - If `:id` is `"biometrics"`, `"me"`, `"null"`, or `"undefined"`, it is discarded.
   - The controller then resolves `customerId` from `req.body.customerId`, `req.query.customerId`, or `req.user.userId`.
3. In `PostgresCustomerRepository.findById`, if a tenant customer is not found by primary key `id`, it queries `WHERE global_customer_id = $1 AND organization_id = $2`.
4. Automated tests 1-14 in `services/backend/tests/customer-face-api-404-network-fix.test.js` verify that all 14 path, verb, and parameter variations return `200 OK`.
