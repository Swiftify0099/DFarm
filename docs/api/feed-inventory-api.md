# Cattle Feed Inventory & Sales API Specification

## 1. Overview & Base URL

All cattle feed inventory and sales endpoints are authenticated via JWT Bearer tokens and scoped to the user's tenant organization.

- **Base URL**: `/api/v1`
- **Authentication**: `Authorization: Bearer <JWT>`
- **Response Format**: Uniform JSON envelope:
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null,
    "timestamp": "2026-11-14T10:30:00.000Z"
  }
  ```

---

## 2. Feed Product Catalog APIs

### 2.1 Get Feed Categories
- **Route**: `GET /api/v1/feed/categories`
- **Permissions**: All authenticated users.
- **Query Params**: `status` (`ACTIVE` | `INACTIVE`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "e44d57c1-bf63-47f9-813c-41b4e1837fc9",
        "code": "COMPOUND_FEED",
        "name": "Compound Cattle Feed",
        "description": "Pelleted balanced ration",
        "status": "ACTIVE"
      }
    ]
  }
  ```

### 2.2 Create Feed Category
- **Route**: `POST /api/v1/feed/categories`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "code": "MINERAL_MIXTURE",
    "name": "Mineral Mixtures & Chelated Salts",
    "description": "Essential micro and macro minerals",
    "status": "ACTIVE"
  }
  ```
- **Response**: `201 Created`

### 2.3 List Feed Products
- **Route**: `GET /api/v1/feed/products`
- **Query Params**: `categoryId`, `status`, `search`, `limit`, `offset`
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "76ca570f-ee05-4739-b93a-30669c9fe030",
        "categoryId": "e44d57c1-bf63-47f9-813c-41b4e1837fc9",
        "code": "FEED-50KG",
        "name": "Super Milk Cattle Feed 50kg",
        "baseUnit": "KG",
        "packSize": 50.0,
        "packUnit": "BAG",
        "defaultPurchasePrice": 1200.0,
        "sellingPrice": 1450.0,
        "taxRatePercent": 5.0,
        "hsn_code": "23099010",
        "status": "ACTIVE",
        "minimumStockLevel": 500.0,
        "weightedAvgCost": 1200.0
      }
    ]
  }
  ```

### 2.4 Create Feed Product
- **Route**: `POST /api/v1/feed/products`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "categoryId": "e44d57c1-bf63-47f9-813c-41b4e1837fc9",
    "code": "FEED-50KG",
    "name": "Super Milk Cattle Feed 50kg",
    "description": "High energy balanced pelleted feed",
    "baseUnit": "KG",
    "packSize": 50.0,
    "packUnit": "BAG",
    "defaultPurchasePrice": 1200.0,
    "sellingPrice": 1450.0,
    "taxRatePercent": 5.0,
    "hsnCode": "23099010",
    "minimumStockLevel": 500.0
  }
  ```
- **Response**: `201 Created`

---

## 3. Supplier Management APIs

### 3.1 List Suppliers
- **Route**: `GET /api/v1/feed/suppliers`
- **Query Params**: `status`, `search`, `limit`, `offset`
- **Response**: `200 OK`

### 3.2 Create Supplier
- **Route**: `POST /api/v1/feed/suppliers`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "supplierCode": "SUP-GODREJ",
    "name": "Godrej Agrovet Ltd",
    "contactPerson": "Ramesh Patil",
    "phoneNumber": "9822012345",
    "email": "patil@godrejagrovet.com",
    "address": "MIDC Area, Miraj, Maharashtra",
    "gstNumber": "27AAACG0000A1Z5"
  }
  ```
- **Response**: `201 Created`

---

## 4. Procurement & Stock Receiving APIs

### 4.1 Record Feed Purchase Order
- **Route**: `POST /api/v1/feed/purchases`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "centerId": "fa90f129-96e0-4ac1-91e1-7cc2c666fdee",
    "supplierId": "c479e0a2-2b6d-47fe-bb03-b0e6df2e5b72",
    "purchaseOrderNumber": "PO-2026-001",
    "supplierInvoiceNumber": "INV-GODREJ-9821",
    "purchaseDate": "2026-11-14",
    "idempotencyKey": "IDEM-PUR-20261114-01",
    "notes": "Bulk seasonal stock order",
    "items": [
      {
        "productId": "76ca570f-ee05-4739-b93a-30669c9fe030",
        "quantity": 100.0,
        "unit": "BAG",
        "unitCost": 1200.0,
        "taxRatePercent": 5.0,
        "batchNumber": "BAT-2026-11",
        "expiryDate": "2027-05-14"
      }
    ]
  }
  ```
- **Response**: `201 Created` (Status: `ORDERED`)

### 4.2 Authorize & Receive Stock
- **Route**: `POST /api/v1/feed/purchases/:purchaseId/receive`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "idempotencyKey": "IDEM-RCV-20261114-01",
    "notes": "Verified 100 bags received in good condition"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "purchaseId": "8fca9ee6-15f9-4beb-8931-c64f5bfdae3d",
      "status": "RECEIVED",
      "supplierInvoiceNumber": "INV-GODREJ-9821",
      "totalAmount": "126000.00",
      "receivedBy": "d748f2a1-094e-4f16-9ea1-92b0051e064a",
      "isIdempotentReplay": false
    }
  }
  ```

---

## 5. Customer Feed Sales & Returns APIs

### 5.1 Execute Customer Feed Sale
- **Route**: `POST /api/v1/feed/sales`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`, `INVENTORY_MANAGER`, `MILK_RECORDER`, `FIELD_AGENT`.
- **Payload**:
  ```json
  {
    "centerId": "fa90f129-96e0-4ac1-91e1-7cc2c666fdee",
    "customerId": "b968a330-d3cf-4740-97f4-8a4b61921356",
    "paymentMode": "CREDIT",
    "idempotencyKey": "IDEM-SALE-20261114-101",
    "clientSaleUuid": "7f09f023-e18e-49b0-971c-63b7eef41299",
    "items": [
      {
        "productId": "76ca570f-ee05-4739-b93a-30669c9fe030",
        "quantity": 2.0,
        "unit": "BAG"
      }
    ]
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "saleId": "7f09f023-e18e-49b0-971c-63b7eef41299",
      "invoiceNumber": "INV-FEED-20261114-7F09F023",
      "receiptNumber": "RCP-FEED-20261114-7F09F023",
      "customerId": "b968a330-d3cf-4740-97f4-8a4b61921356",
      "subtotal": "2900.00",
      "taxAmount": "145.00",
      "discountAmount": "0.00",
      "totalAmount": "3045.00",
      "paymentMode": "CREDIT",
      "status": "COMPLETED",
      "customerBalanceAfter": "1205.00"
    }
  }
  ```

### 5.2 Process Customer Return
- **Route**: `POST /api/v1/feed/sales/:saleId/return`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "saleItemId": "16c87e41-0309-4ff3-9eb1-8314e30018ac",
    "returnQuantity": 1.0,
    "stockCondition": "SALEABLE",
    "reason": "Ordered excess bag by mistake",
    "idempotencyKey": "IDEM-RET-20261114-01"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "returnId": "bf5704bb-73da-47ec-aa6c-760fe9dbdca7",
      "saleId": "7f09f023-e18e-49b0-971c-63b7eef41299",
      "creditAmount": "1522.50",
      "returnQuantity": 1.0,
      "stockCondition": "SALEABLE",
      "customerBalanceAfter": "2727.50"
    }
  }
  ```

---

## 6. Inventory Movements, Transfers & Adjustments APIs

### 6.1 Get Center Stock Summary
- **Route**: `GET /api/v1/inventory?centerId=<UUID>`
- **Response**: `200 OK`

### 6.2 Get Stock Movements Audit Log
- **Route**: `GET /api/v1/inventory/movements`
- **Query Params**: `centerId`, `productId`, `movementType`, `direction`, `startDate`, `endDate`, `limit`, `offset`
- **Response**: `200 OK`

### 6.3 Inter-Center Stock Transfer
- **Route**: `POST /api/v1/inventory/transfers`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "sourceCenterId": "fa90f129-96e0-4ac1-91e1-7cc2c666fdee",
    "destinationCenterId": "5062635a-4ea9-42b3-a3d8-5bca81c1955b",
    "productId": "76ca570f-ee05-4739-b93a-30669c9fe030",
    "quantity": 10.0,
    "unit": "BAG",
    "notes": "Emergency stock replenishment",
    "idempotencyKey": "IDEM-XFER-20261114-01"
  }
  ```
- **Response**: `201 Created`

### 6.4 Stock Adjustment / Cycle Count Correction
- **Route**: `POST /api/v1/inventory/adjustments`
- **Permissions**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `INVENTORY_MANAGER`.
- **Payload**:
  ```json
  {
    "centerId": "fa90f129-96e0-4ac1-91e1-7cc2c666fdee",
    "productId": "76ca570f-ee05-4739-b93a-30669c9fe030",
    "adjustmentType": "STOCK_CORRECTION",
    "quantity": 2.0,
    "direction": "IN",
    "reason": "Physical cycle count surplus adjustment",
    "idempotencyKey": "IDEM-ADJ-20261114-01"
  }
  ```
- **Response**: `201 Created`

