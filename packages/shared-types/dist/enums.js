export var MilkCategory;
(function (MilkCategory) {
    MilkCategory["COW"] = "COW";
    MilkCategory["BUFFALO"] = "BUFFALO";
})(MilkCategory || (MilkCategory = {}));
export var CustomerStatus;
(function (CustomerStatus) {
    CustomerStatus["DRAFT"] = "DRAFT";
    CustomerStatus["PENDING_FACE_ENROLLMENT"] = "PENDING_FACE_ENROLLMENT";
    CustomerStatus["PENDING_RFID_ASSIGNMENT"] = "PENDING_RFID_ASSIGNMENT";
    CustomerStatus["PENDING_SYNC"] = "PENDING_SYNC";
    CustomerStatus["ACTIVE"] = "ACTIVE";
    CustomerStatus["SUSPENDED"] = "SUSPENDED";
    CustomerStatus["SOFT_DELETED"] = "SOFT_DELETED";
})(CustomerStatus || (CustomerStatus = {}));
export var IdentificationMethod;
(function (IdentificationMethod) {
    IdentificationMethod["FACE"] = "FACE";
    IdentificationMethod["RFID"] = "RFID";
    IdentificationMethod["SUPERVISOR_MANUAL"] = "SUPERVISOR_MANUAL";
})(IdentificationMethod || (IdentificationMethod = {}));
export var IdentificationState;
(function (IdentificationState) {
    IdentificationState["WAITING_FOR_FACE"] = "WAITING_FOR_FACE";
    IdentificationState["FACE_MATCHED"] = "FACE_MATCHED";
    IdentificationState["FACE_UNKNOWN"] = "FACE_UNKNOWN";
    IdentificationState["FACE_FAILED"] = "FACE_FAILED";
    IdentificationState["WAITING_FOR_RFID"] = "WAITING_FOR_RFID";
    IdentificationState["RFID_MATCHED"] = "RFID_MATCHED";
    IdentificationState["RFID_FAILED"] = "RFID_FAILED";
    IdentificationState["WAITING_FOR_SUPERVISOR"] = "WAITING_FOR_SUPERVISOR";
    IdentificationState["SUPERVISOR_VERIFIED"] = "SUPERVISOR_VERIFIED";
    IdentificationState["CUSTOMER_IDENTIFIED"] = "CUSTOMER_IDENTIFIED";
    IdentificationState["CUSTOMER_REJECTED"] = "CUSTOMER_REJECTED";
})(IdentificationState || (IdentificationState = {}));
export var VerificationOutcome;
(function (VerificationOutcome) {
    VerificationOutcome["SUCCESS"] = "SUCCESS";
    VerificationOutcome["FAILED"] = "FAILED";
    VerificationOutcome["REJECTED_INACTIVE"] = "REJECTED_INACTIVE";
    VerificationOutcome["REJECTED_UNKNOWN"] = "REJECTED_UNKNOWN";
})(VerificationOutcome || (VerificationOutcome = {}));
export var RfidCardStatus;
(function (RfidCardStatus) {
    RfidCardStatus["UNASSIGNED"] = "UNASSIGNED";
    RfidCardStatus["ACTIVE"] = "ACTIVE";
    RfidCardStatus["BLOCKED"] = "BLOCKED";
    RfidCardStatus["REVOKED"] = "REVOKED";
    RfidCardStatus["LOST"] = "LOST";
})(RfidCardStatus || (RfidCardStatus = {}));
export var RfidTechnology;
(function (RfidTechnology) {
    RfidTechnology["MIFARE_CLASSIC_1K"] = "MIFARE_CLASSIC_1K";
    RfidTechnology["MIFARE_DESFIRE"] = "MIFARE_DESFIRE";
    RfidTechnology["EM4100"] = "EM4100";
    RfidTechnology["NFC"] = "NFC";
    RfidTechnology["MANUAL_KEY"] = "MANUAL_KEY";
})(RfidTechnology || (RfidTechnology = {}));
export var SupervisorReasonCategory;
(function (SupervisorReasonCategory) {
    SupervisorReasonCategory["FACIAL_INJURY"] = "FACIAL_INJURY";
    SupervisorReasonCategory["LIGHTING_CAMERA_DEFECT"] = "LIGHTING_CAMERA_DEFECT";
    SupervisorReasonCategory["CARD_DAMAGED"] = "CARD_DAMAGED";
    SupervisorReasonCategory["CARD_FORGOTTEN"] = "CARD_FORGOTTEN";
    SupervisorReasonCategory["OTHER_DOCUMENTED"] = "OTHER_DOCUMENTED";
})(SupervisorReasonCategory || (SupervisorReasonCategory = {}));
export var SupervisorAuthMethod;
(function (SupervisorAuthMethod) {
    SupervisorAuthMethod["PIN"] = "PIN";
    SupervisorAuthMethod["PASSWORD"] = "PASSWORD";
    SupervisorAuthMethod["BIOMETRIC"] = "BIOMETRIC";
})(SupervisorAuthMethod || (SupervisorAuthMethod = {}));
export var RegistrationStatus;
(function (RegistrationStatus) {
    RegistrationStatus["IN_PROGRESS"] = "IN_PROGRESS";
    RegistrationStatus["COMPLETED"] = "COMPLETED";
    RegistrationStatus["REJECTED"] = "REJECTED";
})(RegistrationStatus || (RegistrationStatus = {}));
export var SessionType;
(function (SessionType) {
    SessionType["MORNING"] = "MORNING";
    SessionType["EVENING"] = "EVENING";
})(SessionType || (SessionType = {}));
export var Shift;
(function (Shift) {
    Shift["MORNING"] = "MORNING";
    Shift["EVENING"] = "EVENING";
})(Shift || (Shift = {}));
export var ReadingSource;
(function (ReadingSource) {
    ReadingSource["MANUAL_ENTRY"] = "MANUAL_ENTRY";
    ReadingSource["SOFTWARE_SIMULATOR"] = "SOFTWARE_SIMULATOR";
    ReadingSource["HARDWARE_INTERFACE"] = "HARDWARE_INTERFACE";
})(ReadingSource || (ReadingSource = {}));
export var SessionState;
(function (SessionState) {
    SessionState["WAITING_FOR_CUSTOMER"] = "WAITING_FOR_CUSTOMER";
    SessionState["CUSTOMER_IDENTIFIED"] = "CUSTOMER_IDENTIFIED";
    SessionState["CUSTOMER_VERIFIED"] = "CUSTOMER_VERIFIED";
    SessionState["CATEGORY_PENDING"] = "CATEGORY_PENDING";
    SessionState["CATEGORY_SELECTED"] = "CATEGORY_SELECTED";
    SessionState["SESSION_CREATED"] = "SESSION_CREATED";
    SessionState["WAITING_FOR_MEASUREMENTS"] = "WAITING_FOR_MEASUREMENTS";
    SessionState["MEASUREMENTS_RECEIVED"] = "MEASUREMENTS_RECEIVED";
    SessionState["VALIDATING"] = "VALIDATING";
    SessionState["READY_FOR_REVIEW"] = "READY_FOR_REVIEW";
    SessionState["COMMITTING"] = "COMMITTING";
    SessionState["COMPLETED"] = "COMPLETED";
    SessionState["INCOMPLETE"] = "INCOMPLETE";
    SessionState["FAILED"] = "FAILED";
    SessionState["CANCELLED"] = "CANCELLED";
    SessionState["PENDING_SYNC"] = "PENDING_SYNC";
})(SessionState || (SessionState = {}));
export var LedgerTransactionType;
(function (LedgerTransactionType) {
    // Credits
    LedgerTransactionType["MILK_COLLECTION_CREDIT"] = "MILK_COLLECTION_CREDIT";
    LedgerTransactionType["CUSTOMER_INCENTIVE_CREDIT"] = "CUSTOMER_INCENTIVE_CREDIT";
    LedgerTransactionType["APPROVED_ADJUSTMENT_CREDIT"] = "APPROVED_ADJUSTMENT_CREDIT";
    LedgerTransactionType["LEDGER_ADJUSTMENT_CREDIT"] = "LEDGER_ADJUSTMENT_CREDIT";
    LedgerTransactionType["OPENING_BALANCE_CREDIT"] = "OPENING_BALANCE_CREDIT";
    LedgerTransactionType["ADVANCE_RECOVERY_CREDIT"] = "ADVANCE_RECOVERY_CREDIT";
    // Debits
    LedgerTransactionType["CUSTOMER_ADVANCE_DEBIT"] = "CUSTOMER_ADVANCE_DEBIT";
    LedgerTransactionType["ADVANCE_DEBIT"] = "ADVANCE_DEBIT";
    LedgerTransactionType["FEED_PURCHASE_DEBIT"] = "FEED_PURCHASE_DEBIT";
    LedgerTransactionType["AUTHORIZED_DEDUCTION_DEBIT"] = "AUTHORIZED_DEDUCTION_DEBIT";
    LedgerTransactionType["DEDUCTION_DEBIT"] = "DEDUCTION_DEBIT";
    LedgerTransactionType["PAYOUT_SETTLEMENT_DEBIT"] = "PAYOUT_SETTLEMENT_DEBIT";
    LedgerTransactionType["PAYMENT_PAYOUT_DEBIT"] = "PAYMENT_PAYOUT_DEBIT";
    LedgerTransactionType["APPROVED_ADJUSTMENT_DEBIT"] = "APPROVED_ADJUSTMENT_DEBIT";
    LedgerTransactionType["LEDGER_ADJUSTMENT_DEBIT"] = "LEDGER_ADJUSTMENT_DEBIT";
    LedgerTransactionType["COLLECTION_REVERSAL_DEBIT"] = "COLLECTION_REVERSAL_DEBIT";
    LedgerTransactionType["OPENING_BALANCE_DEBIT"] = "OPENING_BALANCE_DEBIT";
})(LedgerTransactionType || (LedgerTransactionType = {}));
export var LedgerDirection;
(function (LedgerDirection) {
    LedgerDirection["CREDIT"] = "CREDIT";
    LedgerDirection["DEBIT"] = "DEBIT";
})(LedgerDirection || (LedgerDirection = {}));
export var AdvanceStatus;
(function (AdvanceStatus) {
    AdvanceStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    AdvanceStatus["APPROVED"] = "APPROVED";
    AdvanceStatus["ACTIVE"] = "ACTIVE";
    AdvanceStatus["REJECTED"] = "REJECTED";
    AdvanceStatus["FULLY_RECOVERED"] = "FULLY_RECOVERED";
    AdvanceStatus["WRITTEN_OFF"] = "WRITTEN_OFF";
})(AdvanceStatus || (AdvanceStatus = {}));
export var DeductionCategory;
(function (DeductionCategory) {
    DeductionCategory["VETERINARY_MEDICINE"] = "VETERINARY_MEDICINE";
    DeductionCategory["AI_BREEDING_CHARGE"] = "AI_BREEDING_CHARGE";
    DeductionCategory["CATTLE_INSURANCE"] = "CATTLE_INSURANCE";
    DeductionCategory["MEMBERSHIP_FEE"] = "MEMBERSHIP_FEE";
    DeductionCategory["OTHER"] = "OTHER";
    DeductionCategory["EQUIPMENT_MAINTENANCE"] = "EQUIPMENT_MAINTENANCE";
    DeductionCategory["SUPPLY_CHARGE"] = "SUPPLY_CHARGE";
})(DeductionCategory || (DeductionCategory = {}));
export var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    UserRole["DAIRY_OWNER"] = "DAIRY_OWNER";
    UserRole["DAIRY_ADMIN"] = "DAIRY_ADMIN";
    UserRole["CENTER_MANAGER"] = "CENTER_MANAGER";
    UserRole["SUPERVISOR"] = "SUPERVISOR";
    UserRole["COLLECTION_OPERATOR"] = "COLLECTION_OPERATOR";
    UserRole["ACCOUNTANT"] = "ACCOUNTANT";
    UserRole["INVENTORY_MANAGER"] = "INVENTORY_MANAGER";
    UserRole["REGISTRATION_OFFICER"] = "REGISTRATION_OFFICER";
    UserRole["FARMER_CUSTOMER"] = "FARMER_CUSTOMER";
})(UserRole || (UserRole = {}));
export var StockMovementType;
(function (StockMovementType) {
    StockMovementType["PURCHASE_RECEIPT"] = "PURCHASE_RECEIPT";
    StockMovementType["CUSTOMER_SALE"] = "CUSTOMER_SALE";
    StockMovementType["CUSTOMER_RETURN"] = "CUSTOMER_RETURN";
    StockMovementType["SUPPLIER_RETURN"] = "SUPPLIER_RETURN";
    StockMovementType["DAMAGED_WRITE_OFF"] = "DAMAGED_WRITE_OFF";
    StockMovementType["STOCK_CORRECTION"] = "STOCK_CORRECTION";
    StockMovementType["CENTER_TRANSFER"] = "CENTER_TRANSFER";
})(StockMovementType || (StockMovementType = {}));
export var FeedProductUnit;
(function (FeedProductUnit) {
    FeedProductUnit["KG"] = "KG";
    FeedProductUnit["BAG"] = "BAG";
    FeedProductUnit["PIECE"] = "PIECE";
    FeedProductUnit["LITRE"] = "LITRE";
})(FeedProductUnit || (FeedProductUnit = {}));
export var FeedPurchaseStatus;
(function (FeedPurchaseStatus) {
    FeedPurchaseStatus["ORDERED"] = "ORDERED";
    FeedPurchaseStatus["RECEIVED"] = "RECEIVED";
    FeedPurchaseStatus["CANCELLED"] = "CANCELLED";
})(FeedPurchaseStatus || (FeedPurchaseStatus = {}));
export var FeedSaleStatus;
(function (FeedSaleStatus) {
    FeedSaleStatus["COMPLETED"] = "COMPLETED";
    FeedSaleStatus["CANCELLED"] = "CANCELLED";
    FeedSaleStatus["RETURNED"] = "RETURNED";
    FeedSaleStatus["PARTIALLY_RETURNED"] = "PARTIALLY_RETURNED";
})(FeedSaleStatus || (FeedSaleStatus = {}));
export var FeedPaymentMode;
(function (FeedPaymentMode) {
    FeedPaymentMode["CREDIT"] = "CREDIT";
    FeedPaymentMode["CASH"] = "CASH";
})(FeedPaymentMode || (FeedPaymentMode = {}));
export var ReturnStockCondition;
(function (ReturnStockCondition) {
    ReturnStockCondition["SALEABLE"] = "SALEABLE";
    ReturnStockCondition["DAMAGED"] = "DAMAGED";
})(ReturnStockCondition || (ReturnStockCondition = {}));
export var InventoryAdjustmentType;
(function (InventoryAdjustmentType) {
    InventoryAdjustmentType["DAMAGED_WRITE_OFF"] = "DAMAGED_WRITE_OFF";
    InventoryAdjustmentType["STOCK_CORRECTION"] = "STOCK_CORRECTION";
    InventoryAdjustmentType["PHYSICAL_AUDIT_SURPLUS"] = "PHYSICAL_AUDIT_SURPLUS";
    InventoryAdjustmentType["PHYSICAL_AUDIT_DEFICIT"] = "PHYSICAL_AUDIT_DEFICIT";
})(InventoryAdjustmentType || (InventoryAdjustmentType = {}));
// Phase 16: Employee & Payroll Enums
export var EmploymentStatus;
(function (EmploymentStatus) {
    EmploymentStatus["ACTIVE"] = "ACTIVE";
    EmploymentStatus["INACTIVE"] = "INACTIVE";
    EmploymentStatus["SUSPENDED"] = "SUSPENDED";
    EmploymentStatus["RESIGNED"] = "RESIGNED";
    EmploymentStatus["TERMINATED"] = "TERMINATED";
})(EmploymentStatus || (EmploymentStatus = {}));
export var EmploymentType;
(function (EmploymentType) {
    EmploymentType["FULL_TIME"] = "FULL_TIME";
    EmploymentType["PART_TIME"] = "PART_TIME";
    EmploymentType["CONTRACT"] = "CONTRACT";
    EmploymentType["DAILY_WAGE"] = "DAILY_WAGE";
})(EmploymentType || (EmploymentType = {}));
export var EmployeeShiftType;
(function (EmployeeShiftType) {
    EmployeeShiftType["MORNING"] = "MORNING";
    EmployeeShiftType["EVENING"] = "EVENING";
    EmployeeShiftType["GENERAL"] = "GENERAL";
    EmployeeShiftType["NIGHT"] = "NIGHT";
})(EmployeeShiftType || (EmployeeShiftType = {}));
export var AttendanceStatus;
(function (AttendanceStatus) {
    AttendanceStatus["PRESENT"] = "PRESENT";
    AttendanceStatus["ABSENT"] = "ABSENT";
    AttendanceStatus["HALF_DAY"] = "HALF_DAY";
    AttendanceStatus["ON_LEAVE"] = "ON_LEAVE";
    AttendanceStatus["HOLIDAY"] = "HOLIDAY";
    AttendanceStatus["WEEK_OFF"] = "WEEK_OFF";
})(AttendanceStatus || (AttendanceStatus = {}));
export var LeaveType;
(function (LeaveType) {
    LeaveType["CASUAL"] = "CASUAL";
    LeaveType["SICK"] = "SICK";
    LeaveType["EARNED"] = "EARNED";
    LeaveType["UNPAID"] = "UNPAID";
    LeaveType["MATERNITY"] = "MATERNITY";
    LeaveType["EMERGENCY"] = "EMERGENCY";
})(LeaveType || (LeaveType = {}));
export var LeaveStatus;
(function (LeaveStatus) {
    LeaveStatus["PENDING"] = "PENDING";
    LeaveStatus["APPROVED"] = "APPROVED";
    LeaveStatus["REJECTED"] = "REJECTED";
    LeaveStatus["CANCELLED"] = "CANCELLED";
})(LeaveStatus || (LeaveStatus = {}));
export var SalaryCalculationBasis;
(function (SalaryCalculationBasis) {
    SalaryCalculationBasis["MONTHLY"] = "MONTHLY";
    SalaryCalculationBasis["DAILY_WAGE"] = "DAILY_WAGE";
    SalaryCalculationBasis["HOURLY"] = "HOURLY";
})(SalaryCalculationBasis || (SalaryCalculationBasis = {}));
export var EmployeeAdvanceStatus;
(function (EmployeeAdvanceStatus) {
    EmployeeAdvanceStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    EmployeeAdvanceStatus["APPROVED"] = "APPROVED";
    EmployeeAdvanceStatus["REJECTED"] = "REJECTED";
    EmployeeAdvanceStatus["ACTIVE"] = "ACTIVE";
    EmployeeAdvanceStatus["FULLY_RECOVERED"] = "FULLY_RECOVERED";
    EmployeeAdvanceStatus["CANCELLED"] = "CANCELLED";
})(EmployeeAdvanceStatus || (EmployeeAdvanceStatus = {}));
export var PayrollRunStatus;
(function (PayrollRunStatus) {
    PayrollRunStatus["DRAFT"] = "DRAFT";
    PayrollRunStatus["CALCULATING"] = "CALCULATING";
    PayrollRunStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    PayrollRunStatus["APPROVED"] = "APPROVED";
    PayrollRunStatus["FINALIZED"] = "FINALIZED";
    PayrollRunStatus["PAID"] = "PAID";
    PayrollRunStatus["CANCELLED"] = "CANCELLED";
})(PayrollRunStatus || (PayrollRunStatus = {}));
export var PayslipPaymentStatus;
(function (PayslipPaymentStatus) {
    PayslipPaymentStatus["PENDING"] = "PENDING";
    PayslipPaymentStatus["PROCESSING"] = "PROCESSING";
    PayslipPaymentStatus["PAID"] = "PAID";
    PayslipPaymentStatus["FAILED"] = "FAILED";
})(PayslipPaymentStatus || (PayslipPaymentStatus = {}));
export var SalaryPaymentMethod;
(function (SalaryPaymentMethod) {
    SalaryPaymentMethod["BANK_TRANSFER"] = "BANK_TRANSFER";
    SalaryPaymentMethod["CASH"] = "CASH";
    SalaryPaymentMethod["CHEQUE"] = "CHEQUE";
    SalaryPaymentMethod["UPI"] = "UPI";
})(SalaryPaymentMethod || (SalaryPaymentMethod = {}));
export var SalaryPaymentStatus;
(function (SalaryPaymentStatus) {
    SalaryPaymentStatus["PENDING"] = "PENDING";
    SalaryPaymentStatus["COMPLETED"] = "COMPLETED";
    SalaryPaymentStatus["FAILED"] = "FAILED";
    SalaryPaymentStatus["REVERSED"] = "REVERSED";
})(SalaryPaymentStatus || (SalaryPaymentStatus = {}));
// Phase 13: Billing Enums
export var BillingCycleType;
(function (BillingCycleType) {
    BillingCycleType["CALENDAR_MONTH"] = "CALENDAR_MONTH";
    BillingCycleType["TEN_DAY"] = "TEN_DAY";
    BillingCycleType["FIFTEEN_DAY"] = "FIFTEEN_DAY";
    BillingCycleType["CUSTOM_PERIOD"] = "CUSTOM_PERIOD";
})(BillingCycleType || (BillingCycleType = {}));
export var BillingPeriodStatus;
(function (BillingPeriodStatus) {
    BillingPeriodStatus["DRAFT"] = "DRAFT";
    BillingPeriodStatus["GENERATING"] = "GENERATING";
    BillingPeriodStatus["GENERATED"] = "GENERATED";
    BillingPeriodStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    BillingPeriodStatus["APPROVED"] = "APPROVED";
    BillingPeriodStatus["FINALIZED"] = "FINALIZED";
    BillingPeriodStatus["CORRECTION_REQUIRED"] = "CORRECTION_REQUIRED";
    BillingPeriodStatus["CANCELLED"] = "CANCELLED";
})(BillingPeriodStatus || (BillingPeriodStatus = {}));
export var BillStatus;
(function (BillStatus) {
    BillStatus["DRAFT"] = "DRAFT";
    BillStatus["GENERATING"] = "GENERATING";
    BillStatus["GENERATED"] = "GENERATED";
    BillStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    BillStatus["APPROVED"] = "APPROVED";
    BillStatus["FINALIZED"] = "FINALIZED";
    BillStatus["CORRECTION_REQUIRED"] = "CORRECTION_REQUIRED";
    BillStatus["CANCELLED"] = "CANCELLED";
})(BillStatus || (BillStatus = {}));
export var BillItemType;
(function (BillItemType) {
    BillItemType["MILK_COLLECTION"] = "MILK_COLLECTION";
    BillItemType["FEED_PURCHASE"] = "FEED_PURCHASE";
    BillItemType["ADVANCE_RECOVERY"] = "ADVANCE_RECOVERY";
    BillItemType["DEDUCTION"] = "DEDUCTION";
    BillItemType["SETTLED_PAYMENT"] = "SETTLED_PAYMENT";
    BillItemType["INCENTIVE_CREDIT"] = "INCENTIVE_CREDIT";
    BillItemType["LEDGER_ADJUSTMENT"] = "LEDGER_ADJUSTMENT";
})(BillItemType || (BillItemType = {}));
// Phase 15: Payment Enums
export var PaymentDirection;
(function (PaymentDirection) {
    PaymentDirection["DAIRY_PAYS_CUSTOMER"] = "DAIRY_PAYS_CUSTOMER";
    PaymentDirection["CUSTOMER_PAYS_DAIRY"] = "CUSTOMER_PAYS_DAIRY";
})(PaymentDirection || (PaymentDirection = {}));
export var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["CASH"] = "CASH";
    PaymentMethod["BANK_TRANSFER"] = "BANK_TRANSFER";
    PaymentMethod["UPI"] = "UPI";
    PaymentMethod["CHEQUE"] = "CHEQUE";
    PaymentMethod["OTHER_APPROVED_METHOD"] = "OTHER_APPROVED_METHOD";
})(PaymentMethod || (PaymentMethod = {}));
export var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["DRAFT"] = "DRAFT";
    PaymentStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    PaymentStatus["APPROVED"] = "APPROVED";
    PaymentStatus["SUBMITTED"] = "SUBMITTED";
    PaymentStatus["SETTLED"] = "SETTLED";
    PaymentStatus["FAILED"] = "FAILED";
    PaymentStatus["REJECTED"] = "REJECTED";
    PaymentStatus["CANCELLED"] = "CANCELLED";
    PaymentStatus["REVERSED"] = "REVERSED";
    PaymentStatus["RECONCILIATION_REQUIRED"] = "RECONCILIATION_REQUIRED";
})(PaymentStatus || (PaymentStatus = {}));
export var PaymentBatchStatus;
(function (PaymentBatchStatus) {
    PaymentBatchStatus["DRAFT"] = "DRAFT";
    PaymentBatchStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    PaymentBatchStatus["APPROVED"] = "APPROVED";
    PaymentBatchStatus["SUBMITTED"] = "SUBMITTED";
    PaymentBatchStatus["PROCESSING"] = "PROCESSING";
    PaymentBatchStatus["SETTLED"] = "SETTLED";
    PaymentBatchStatus["PARTIALLY_SETTLED"] = "PARTIALLY_SETTLED";
    PaymentBatchStatus["FAILED"] = "FAILED";
    PaymentBatchStatus["CANCELLED"] = "CANCELLED";
})(PaymentBatchStatus || (PaymentBatchStatus = {}));
export var ReconciliationStatus;
(function (ReconciliationStatus) {
    ReconciliationStatus["MATCHED"] = "MATCHED";
    ReconciliationStatus["UNMATCHED"] = "UNMATCHED";
    ReconciliationStatus["AMOUNT_MISMATCH"] = "AMOUNT_MISMATCH";
    ReconciliationStatus["DUPLICATE_REFERENCE"] = "DUPLICATE_REFERENCE";
    ReconciliationStatus["PARTIALLY_RECONCILED"] = "PARTIALLY_RECONCILED";
    ReconciliationStatus["MANUAL_REVIEW_REQUIRED"] = "MANUAL_REVIEW_REQUIRED";
})(ReconciliationStatus || (ReconciliationStatus = {}));
// Phase 19: Notification & WhatsApp Business Enums
export var NotificationChannel;
(function (NotificationChannel) {
    NotificationChannel["PUSH"] = "PUSH";
    NotificationChannel["WHATSAPP"] = "WHATSAPP";
    NotificationChannel["IN_APP"] = "IN_APP";
    NotificationChannel["SMS"] = "SMS";
})(NotificationChannel || (NotificationChannel = {}));
export var NotificationEventType;
(function (NotificationEventType) {
    // Milk Collection
    NotificationEventType["MILK_COLLECTION_COMPLETED"] = "MILK_COLLECTION_COMPLETED";
    // Customer Accounts
    NotificationEventType["MONTHLY_BILL_GENERATED"] = "MONTHLY_BILL_GENERATED";
    NotificationEventType["MONTHLY_BILL_STATEMENT_AVAILABLE"] = "MONTHLY_BILL_STATEMENT_AVAILABLE";
    NotificationEventType["FEED_PURCHASE_COMPLETED"] = "FEED_PURCHASE_COMPLETED";
    NotificationEventType["CUSTOMER_ADVANCE_RECORDED"] = "CUSTOMER_ADVANCE_RECORDED";
    NotificationEventType["CUSTOMER_DEDUCTION_APPROVED"] = "CUSTOMER_DEDUCTION_APPROVED";
    NotificationEventType["CUSTOMER_BALANCE_UPDATED"] = "CUSTOMER_BALANCE_UPDATED";
    // Payments
    NotificationEventType["PAYMENT_PAYOUT_INITIATED"] = "PAYMENT_PAYOUT_INITIATED";
    NotificationEventType["PAYMENT_PAYOUT_SUBMITTED"] = "PAYMENT_PAYOUT_SUBMITTED";
    NotificationEventType["PAYMENT_SETTLED"] = "PAYMENT_SETTLED";
    NotificationEventType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    NotificationEventType["CUSTOMER_REPAYMENT_RECEIVED"] = "CUSTOMER_REPAYMENT_RECEIVED";
    NotificationEventType["PAYMENT_RECEIPT_GENERATED"] = "PAYMENT_RECEIPT_GENERATED";
    // Registration
    NotificationEventType["CUSTOMER_REGISTRATION_COMPLETED"] = "CUSTOMER_REGISTRATION_COMPLETED";
    NotificationEventType["CUSTOMER_FACE_ENROLLMENT_PENDING"] = "CUSTOMER_FACE_ENROLLMENT_PENDING";
    NotificationEventType["CUSTOMER_RFID_ASSIGNMENT_PENDING"] = "CUSTOMER_RFID_ASSIGNMENT_PENDING";
    NotificationEventType["CUSTOMER_ACCOUNT_ACTIVATED"] = "CUSTOMER_ACCOUNT_ACTIVATED";
})(NotificationEventType || (NotificationEventType = {}));
export var NotificationStatus;
(function (NotificationStatus) {
    NotificationStatus["PENDING"] = "PENDING";
    NotificationStatus["PROCESSING"] = "PROCESSING";
    NotificationStatus["SENT"] = "SENT";
    NotificationStatus["DELIVERED"] = "DELIVERED";
    NotificationStatus["READ"] = "READ";
    NotificationStatus["FAILED"] = "FAILED";
    NotificationStatus["CANCELLED"] = "CANCELLED";
    NotificationStatus["OPTED_OUT"] = "OPTED_OUT";
    NotificationStatus["BLOCKED"] = "BLOCKED";
})(NotificationStatus || (NotificationStatus = {}));
export var CommunicationConsentType;
(function (CommunicationConsentType) {
    CommunicationConsentType["BIOMETRIC_FACE_ENROLLMENT"] = "BIOMETRIC_FACE_ENROLLMENT";
    CommunicationConsentType["COMMUNICATION_WHATSAPP"] = "COMMUNICATION_WHATSAPP";
    CommunicationConsentType["COMMUNICATION_PUSH"] = "COMMUNICATION_PUSH";
    CommunicationConsentType["COMMUNICATION_SMS"] = "COMMUNICATION_SMS";
    CommunicationConsentType["ALL_COMMUNICATIONS"] = "ALL_COMMUNICATIONS";
})(CommunicationConsentType || (CommunicationConsentType = {}));
//# sourceMappingURL=enums.js.map