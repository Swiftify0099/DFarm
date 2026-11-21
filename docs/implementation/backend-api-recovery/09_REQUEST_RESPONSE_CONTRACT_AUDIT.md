# Request / Response Contract Audit

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. Standard Response Envelope

All DFarm APIs adhere strictly to the unified envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable confirmation"
}
```

On failure:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | NOT_FOUND | CONFLICT",
    "message": "Specific error explanation"
  }
}
```

---

## 2. DTO Property Harmonization

| Entity | Client Property | Backend Schema | Resolution |
|---|---|---|---|
| Milk Intake Weight | `quantityLiters` (Collection App) | `weightLiters` | Mapped dynamically: `item.weightLiters ?? item.quantityLiters` |
| Milk Animal Category | `milkType` (Collection App) | `milkCategory` | Mapped dynamically: `item.milkCategory || item.milkType` |
| Device Identifier | `deviceId: "KIOSK_MAIN"` | `device_identifier` / `id` | Resolved by regex pattern match in `authenticateDevice` |
