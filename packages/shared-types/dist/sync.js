export var SyncStatus;
(function (SyncStatus) {
    SyncStatus["LOCAL_ONLY"] = "LOCAL_ONLY";
    SyncStatus["PENDING_SYNC"] = "PENDING_SYNC";
    SyncStatus["SYNCING"] = "SYNCING";
    SyncStatus["SYNCED"] = "SYNCED";
    SyncStatus["RETRY_REQUIRED"] = "RETRY_REQUIRED";
    SyncStatus["CONFLICT"] = "CONFLICT";
    SyncStatus["REVOKED"] = "REVOKED";
})(SyncStatus || (SyncStatus = {}));
export var SyncAction;
(function (SyncAction) {
    SyncAction["INSERT"] = "INSERT";
    SyncAction["UPDATE"] = "UPDATE";
    SyncAction["DELETE"] = "DELETE";
    SyncAction["RESTORE"] = "RESTORE";
})(SyncAction || (SyncAction = {}));
export var SyncEntityType;
(function (SyncEntityType) {
    SyncEntityType["CUSTOMER"] = "CUSTOMER";
    SyncEntityType["FACE_ENROLLMENT"] = "FACE_ENROLLMENT";
    SyncEntityType["RFID_CARD"] = "RFID_CARD";
    SyncEntityType["RATE_CHART"] = "RATE_CHART";
    SyncEntityType["MILK_COLLECTION"] = "MILK_COLLECTION";
    SyncEntityType["COLLECTION_SESSION"] = "COLLECTION_SESSION";
    SyncEntityType["CUSTOMER_REGISTRATION"] = "CUSTOMER_REGISTRATION";
    SyncEntityType["AUDIT_LOG"] = "AUDIT_LOG";
})(SyncEntityType || (SyncEntityType = {}));
export var DeviceType;
(function (DeviceType) {
    DeviceType["REGISTRATION_TABLET"] = "REGISTRATION_TABLET";
    DeviceType["COUNTER_TERMINAL"] = "COUNTER_TERMINAL";
    DeviceType["MOBILE_COLLECTOR"] = "MOBILE_COLLECTOR";
})(DeviceType || (DeviceType = {}));
export var DeviceStatus;
(function (DeviceStatus) {
    DeviceStatus["ACTIVE"] = "ACTIVE";
    DeviceStatus["BLOCKED"] = "BLOCKED";
    DeviceStatus["DECOMMISSIONED"] = "DECOMMISSIONED";
})(DeviceStatus || (DeviceStatus = {}));
export var ConflictReason;
(function (ConflictReason) {
    ConflictReason["DUPLICATE_MOBILE"] = "DUPLICATE_MOBILE";
    ConflictReason["STALE_VERSION"] = "STALE_VERSION";
    ConflictReason["CUSTOMER_REVOKED"] = "CUSTOMER_REVOKED";
    ConflictReason["CUSTOMER_INACTIVE_OR_REVOKED"] = "CUSTOMER_INACTIVE_OR_REVOKED";
    ConflictReason["RATE_VERSION_MISMATCH"] = "RATE_VERSION_MISMATCH";
    ConflictReason["CARD_ALREADY_ASSIGNED"] = "CARD_ALREADY_ASSIGNED";
    ConflictReason["DEVICE_REVOKED"] = "DEVICE_REVOKED";
    ConflictReason["CONSENT_REVOKED"] = "CONSENT_REVOKED";
})(ConflictReason || (ConflictReason = {}));
//# sourceMappingURL=sync.js.map