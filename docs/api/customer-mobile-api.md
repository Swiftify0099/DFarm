# DFarm Customer Mobile Application — API Specification

## 1. Overview & Authentication
All endpoints require a valid Bearer token in the `Authorization` header:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
X-Request-Id: <UUID_CORRELATION_ID>
Content-Type: application/json
```

All responses conform to the standard DFarm `ApiResponse` format:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "d37af200-e539-4501-abaa-6169d4fe8cfd",
    "timestamp": "2026-11-14T09:00:00.000Z"
  }
}
```

---

## 2. Authentication & Session Endpoints

### 2.1 Customer Login / Request OTP
`POST /api/v1/auth/customer/login`
- **Request Body**:
  ```json
  {
    "mobileNumber": "+919876543210"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "message": "OTP sent to registered mobile number",
      "sessionId": "otp_session_12345"
    }
  }
  ```

### 2.2 Verify OTP & Issue Token
`POST /api/v1/auth/customer/verify-otp`
- **Request Body**:
  ```json
  {
    "mobileNumber": "+919876543210",
    "otpCode": "123456"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "token": "<JWT_ACCESS_TOKEN_PLACEHOLDER>",
      "customer": {
        "id": "3c5561be-aff5-4109-8485-2b0c392f9d56",
        "farmerCode": "FC-SANGLI-001",
        "fullName": "Anand Rao",
        "organizationId": "c8a17957-7ebd-4dff-8a4a-5ac773105001",
        "centerId": "08d3aecf-8bca-4e96-a7a1-076bc63ba8bd"
      }
    }
  }
  ```

---

## 3. Customer Dashboard & Metrics

### 3.1 Get Customer Dashboard
`GET /api/v1/customers/:customerId/dashboard`
- **Security**: Protected by `requireCustomerOwnership`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "customer": {
        "id": "3c5561be-aff5-4109-8485-2b0c392f9d56",
        "farmerCode": "FC-SANGLI-001",
        "fullName": "Anand Rao",
        "centerName": "Tasgaon Milk Collection Center"
      },
      "financials": {
        "currentBalance": 12450.50,
        "balanceStatus": "DAIRY_OWES_CUSTOMER",
        "pendingBillAmount": 4250.00,
        "recentPayment": {
          "amount": 5000.00,
          "disbursedAt": "2026-11-10T11:00:00Z",
          "reference": "UPI-987654321"
        }
      },
      "todayStats": {
        "businessDate": "2026-11-14",
        "todayCowMilkKg": 14.50,
        "todayBuffaloMilkKg": 10.00,
        "todayTotalAmount": 1108.25
      },
      "monthlyStats": {
        "month": "2026-11",
        "totalMilkKg": 348.50,
        "totalCreditAmount": 13940.00
      },
      "recentCollection": {
        "sessionId": "523dbbc9-4059-42f8-bb28-68849b8be137",
        "date": "2026-11-14",
        "shift": "MORNING",
        "category": "COW",
        "weightKg": 14.50,
        "fat": 4.20,
        "snf": 8.50,
        "rate": 38.50,
        "amount": 558.25
      }
    }
  }
  ```

---

## 4. Milk Collection History & Receipts

### 4.1 List Customer Milk Collections
`GET /api/v1/collections/customer/:customerId?category=COW&shift=MORNING&startDate=2026-11-01&endDate=2026-11-30&limit=50&offset=0`
- **Security**: Protected by `requireCustomerOwnership`.
- **Query Parameters**:
  - `category`: `COW` | `BUFFALO` (optional)
  - `shift`: `MORNING` | `EVENING` (optional)
  - `startDate`, `endDate`: ISO Date `YYYY-MM-DD` (optional)
  - `limit`: Integer (1–100, default 50)
  - `offset`: Integer (default 0)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "customerId": "3c5561be-aff5-4109-8485-2b0c392f9d56",
      "total": 42,
      "limit": 50,
      "offset": 0,
      "collections": [
        {
          "sessionId": "523dbbc9-4059-42f8-bb28-68849b8be137",
          "collectionId": "b18f8e02-cf32-4740-9a22-386f78810e11",
          "farmerCode": "FC-SANGLI-001",
          "customerName": "Anand Rao",
          "milkCategory": "COW",
          "shiftType": "MORNING",
          "businessDate": "2026-11-14",
          "netWeight": 14.50,
          "measurementUnit": "KG",
          "fatPercentage": 4.20,
          "snfPercentage": 8.50,
          "appliedRatePerUnit": 38.50,
          "totalAmount": 558.25,
          "receiptNumber": "RCP-523DBBC9",
          "completedAt": "2026-11-14T07:15:00Z"
        }
      ]
    }
  }
  ```

### 4.2 Get 40-Column Thermal Receipt Text
`GET /api/v1/collections/sessions/:sessionId/receipt`
- **Security**: Protected by session ownership verification.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "receiptText": "========================================\n      DFARM DAIRY MILK COLLECTION\n       Tasgaon Collection Center\n========================================\nDate: 2026-11-14          Shift: MORNING\nReceipt: RCP-523DBBC9   State: COMPLETED\n----------------------------------------\nFarmer Code:                FC-SANGLI-001\nCustomer:                   An*** Ra*\nCategory:                            COW\n----------------------------------------\nNet Weight:                     14.5 kg\nFat %:                            4.2 %\nSNF %:                            8.5 %\nRate / kg:                     INR 38.5\n----------------------------------------\nTOTAL AMOUNT:                 INR 558.25\n========================================\nSession: 523dbbc9-4059-42...\nOperator: Vikas Patil\n           *** THANK YOU ***            "
    }
  }
  ```

---

## 5. Customer Ledger Passbook

### 5.1 Get Customer Ledger Summary
`GET /api/v1/customers/:customerId/ledger/summary`
- **Security**: Protected by `requireCustomerOwnership`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "customerId": "3c5561be-aff5-4109-8485-2b0c392f9d56",
      "openingBalance": 0.00,
      "totalCredits": 13940.00,
      "totalDebits": 1490.00,
      "netPayments": 5000.00,
      "currentBalance": 7450.00,
      "balanceStatus": "DAIRY_OWES_CUSTOMER",
      "lastTransactionDate": "2026-11-14T07:15:00Z"
    }
  }
  ```

---

## 6. Monthly Billing & Authorized Statements

### 6.1 List Monthly Statements
`GET /api/v1/billing/customers/:customerId/statements?limit=12&offset=0`
- **Security**: Protected by `requireCustomerOwnership`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "customerId": "3c5561be-aff5-4109-8485-2b0c392f9d56",
      "total": 3,
      "bills": [
        {
          "billId": "bill_2026_10",
          "periodName": "October 2026 Monthly Bill",
          "startDate": "2026-10-01",
          "endDate": "2026-10-31",
          "cowMilkQtyKg": 420.50,
          "buffaloMilkQtyKg": 210.00,
          "totalMilkCredit": 25200.00,
          "feedDebits": 2800.00,
          "advances": 1000.00,
          "netPayable": 21400.00,
          "paymentStatus": "PAID"
        }
      ]
    }
  }
  ```

### 6.2 Download Authorized Billing Statement PDF
`GET /api/v1/billing/bills/:billId/pdf`
- **Security**: Protected by bill customer ownership check.
- **Response**: `application/pdf` binary stream with `Content-Disposition: attachment; filename="statement_bill_2026_10.pdf"`.

---

## 7. Cattle Feed Purchase History

### 7.1 List Feed Purchases
`GET /api/v1/feed/sales?customerId=:customerId&limit=20&offset=0`
- **Security**: Protected by customer ownership verification.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "feed_sale_001",
        "invoiceNumber": "FEED-INV-2026-102",
        "saleDate": "2026-11-08",
        "productName": "DFarm Cattle Feed Pellet (Gold 50kg)",
        "quantity": 2,
        "unit": "BAG",
        "unitPrice": 1250.00,
        "totalAmount": 2500.00,
        "paymentMode": "CREDIT",
        "status": "COMPLETED"
      }
    ]
  }
  ```

---

## 8. Payout Disbursements & Receipts

### 8.1 List Payout Records
`GET /api/v1/payments/customers/:customerId?limit=20&offset=0`
- **Security**: Protected by customer ownership verification.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "payout_001",
        "paymentReference": "NEFT-SBIN20261105-01",
        "disbursedAt": "2026-11-05T14:30:00Z",
        "amount": 10000.00,
        "paymentMode": "BANK_TRANSFER",
        "status": "COMPLETED",
        "bankName": "State Bank of India",
        "accountMasked": "XXXX-XXXX-9012"
      }
    ]
  }
  ```

---

## 9. In-App Notifications Inbox

### 9.1 List Notifications
`GET /api/v1/customers/:customerId/notifications`
- **Security**: Protected by `requireCustomerOwnership`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "notif_001",
        "title": "Morning Milk Intake Recorded",
        "message": "14.50 kg Cow milk accepted (Fat: 4.2%, SNF: 8.5%). INR 558.25 credited to your ledger.",
        "type": "MILK_COLLECTION",
        "isRead": false,
        "createdAt": "2026-11-14T07:15:30Z"
      }
    ],
    "meta": {
      "unreadCount": 1,
      "page": 1,
      "limit": 20
    }
  }
  ```

### 9.2 Mark Notification as Read
`PATCH /api/v1/customers/:customerId/notifications/:notificationId/read`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": { "markedRead": true }
  }
  ```

### 9.3 Mark All Notifications as Read
`PATCH /api/v1/customers/:customerId/notifications/read-all` or `POST /api/v1/customers/:customerId/notifications/read-all`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": { "markedReadCount": 1 }
  }
  ```

---

## 10. Profile & Privacy Self-Service

### 10.1 Get Profile (Masked)
`GET /api/v1/customers/:customerId`
- **Security**: Returns sanitized profile. Biometrics strictly omitted.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "3c5561be-aff5-4109-8485-2b0c392f9d56",
      "farmerCode": "FC-SANGLI-001",
      "fullName": "Anand Rao",
      "mobileNumber": "+919111122334",
      "bankName": "State Bank of India",
      "bankAccountNumber": "XXXX-XXXX-9012",
      "bankIfscCode": "SBIN0001234",
      "status": "ACTIVE",
      "registrationStatus": "COMPLETED"
    }
  }
  ```

### 10.2 Update Self-Service Preferences
`PATCH /api/v1/customers/:customerId/profile`
- **Security**: Protected by `requireCustomerOwnership`.
- **Request Body**:
  ```json
  {
    "preferredLanguage": "mr",
    "notificationConsent": true,
    "email": "anand.farmer@example.com"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "preferences": {
        "preferredLanguage": "mr",
        "notificationConsent": true,
        "email": "anand.farmer@example.com"
      }
    }
  }
  ```
