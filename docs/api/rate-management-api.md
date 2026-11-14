# Milk Rate Management REST API Documentation

Base URL: `/api/v1/rates`  
Authentication: `Authorization: Bearer <JWT>`  
Multi-Tenancy: Scoped strictly to caller's `organization_id` via PostgreSQL RLS.

---

## Endpoint Summary

| Method | Endpoint | Authorized Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | All Authenticated Staff | List rate charts for the organization |
| `POST` | `/` | `DAIRY_OWNER`, `SUPER_ADMIN` | Create a new rate chart (COW / BUFFALO) |
| `GET` | `/:rateChartId` | All Authenticated Staff | Get rate chart details by ID |
| `GET` | `/:rateChartId/versions` | All Authenticated Staff | List all versions for a rate chart |
| `GET` | `/:rateChartId/versions/:versionId` | All Authenticated Staff | Get a rate chart version and its matrix cells |
| `POST` | `/:rateChartId/versions` | `DAIRY_OWNER`, `SUPER_ADMIN`, `CENTER_MANAGER` | Create a new version for a rate chart |
| `PUT` | `/:rateChartId/versions/:versionId/matrix` | `DAIRY_OWNER`, `SUPER_ADMIN`, `CENTER_MANAGER` | Configure matrix cells for a DRAFT version |
| `POST` | `/:rateChartId/versions/:versionId/preview` | All Authenticated Staff | Preview calculation for sample parameters |
| `POST` | `/:rateChartId/versions/:versionId/submit` | `DAIRY_OWNER`, `SUPER_ADMIN`, `CENTER_MANAGER` | Submit version for owner approval |
| `POST` | `/:rateChartId/versions/:versionId/approve` | `DAIRY_OWNER`, `SUPER_ADMIN` | Approve a submitted version |
| `POST` | `/:rateChartId/versions/:versionId/publish` | `DAIRY_OWNER`, `SUPER_ADMIN` | Publish version, superseding prior versions |
| `POST` | `/calculate` | All Authenticated Staff | Authoritative backend rate calculation engine |

---

## Endpoint Details

### 1. `POST /api/v1/rates`
**Request Body**:
```json
{
  "name": "Standard Tasgaon Cow Milk Rate Chart 2026",
  "code": "RC-COW-2026-V1",
  "milkCategory": "COW",
  "description": "Standard seasonal pricing for Tasgaon Center",
  "centerScope": "ALL_CENTERS"
}
```
**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "e4a28f41-3211-4b47-9752-6b9c7cfb8812",
    "name": "Standard Tasgaon Cow Milk Rate Chart 2026",
    "milkCategory": "COW",
    "status": "DRAFT"
  }
}
```

### 2. `PUT /api/v1/rates/:rateChartId/versions/:versionId/matrix`
**Request Body**:
```json
{
  "cells": [
    { "fat": 3.0, "snf": 8.0, "rate": 35.00 },
    { "fat": 3.5, "snf": 8.5, "rate": 38.50 },
    { "fat": 4.0, "snf": 9.0, "rate": 42.00 }
  ]
}
```
**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "versionId": "b1b7a2e4-9844-42b7-a361-9f2d1e4c88aa",
    "cellsUpserted": 3
  }
}
```

### 3. `POST /api/v1/rates/calculate`
**Request Body**:
```json
{
  "centerId": "c1111111-1111-4111-8111-111111111111",
  "milkCategory": "COW",
  "fat": 3.5,
  "snf": 8.5,
  "netWeight": 15.0,
  "measurementUnit": "KG",
  "businessDate": "2026-11-14"
}
```
**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "rateChartId": "e4a28f41-3211-4b47-9752-6b9c7cfb8812",
    "versionId": "b1b7a2e4-9844-42b7-a361-9f2d1e4c88aa",
    "appliedRate": 38.50,
    "pricingUnit": "PER_KG",
    "quantity": 15.0,
    "measurementUnit": "KG",
    "totalAmount": 577.50,
    "calculationRule": "EXACT_FAT_SNF_MATRIX_CELL"
  }
}
```

