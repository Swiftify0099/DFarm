import { z } from 'zod';
import { MilkCategory, CustomerStatus, IdentificationMethod, SessionType, RfidTechnology, RfidCardStatus, SupervisorReasonCategory, SupervisorAuthMethod, PaymentDirection, PaymentMethod, PaymentStatus, PaymentBatchStatus, ReconciliationStatus, BillingCycleType, BillingPeriodStatus, BillStatus, EmploymentStatus, EmploymentType, EmployeeShiftType, AttendanceStatus, LeaveType, LeaveStatus, SalaryCalculationBasis, EmployeeAdvanceStatus, PayrollRunStatus, PayslipPaymentStatus, SalaryPaymentMethod, SalaryPaymentStatus, UserRole, NotificationChannel, NotificationEventType, NotificationStatus, CommunicationConsentType } from '@dfarm/shared-types';
export declare const E164PhoneSchema: z.ZodString;
/**
 * Normalizes an RFID UID into canonical uppercase hexadecimal string.
 * Strips colons, hyphens, and whitespace.
 * e.g. "04:a1:b2:c3:d4" -> "04A1B2C3D4"
 */
export declare function normalizeRfidUid(rawUid: string): string;
export declare const RfidUidSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const CustomerAddressSchema: z.ZodObject<{
    village: z.ZodString;
    hamletArea: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    talukaSubdistrict: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    district: z.ZodString;
    state: z.ZodString;
    postalCode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    village: string;
    district: string;
    state: string;
    hamletArea?: string | null | undefined;
    talukaSubdistrict?: string | null | undefined;
    postalCode?: string | null | undefined;
}, {
    village: string;
    district: string;
    state: string;
    hamletArea?: string | null | undefined;
    talukaSubdistrict?: string | null | undefined;
    postalCode?: string | null | undefined;
}>;
export declare const CustomerRegistrationSchema: z.ZodObject<{
    fullName: z.ZodString;
    mobileNumber: z.ZodString;
    permittedCategories: z.ZodArray<z.ZodNativeEnum<typeof MilkCategory>, "many">;
    biometricConsentGranted: z.ZodEffects<z.ZodBoolean, boolean, boolean>;
    status: z.ZodDefault<z.ZodNativeEnum<typeof CustomerStatus>>;
}, "strip", z.ZodTypeAny, {
    status: CustomerStatus;
    fullName: string;
    mobileNumber: string;
    permittedCategories: MilkCategory[];
    biometricConsentGranted: boolean;
}, {
    fullName: string;
    mobileNumber: string;
    permittedCategories: MilkCategory[];
    biometricConsentGranted: boolean;
    status?: CustomerStatus | undefined;
}>;
export declare const CreateCustomerInputSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    fullName: z.ZodString;
    mobileNumber: z.ZodOptional<z.ZodString>;
    normalizedMobileNumber: z.ZodOptional<z.ZodString>;
    permittedCategories: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof MilkCategory>, "many">>;
    milkCategories: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof MilkCategory>, "many">>;
    centerId: z.ZodOptional<z.ZodString>;
    primaryCenterId: z.ZodOptional<z.ZodString>;
    farmerCode: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        village: z.ZodOptional<z.ZodString>;
        hamletArea: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
        talukaSubdistrict: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
        district: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        postalCode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    }, "strip", z.ZodTypeAny, {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    }, {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    }>>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankAccountNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankIfscCode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankAccountHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    fullName: string;
    mobileNumber?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    centerId?: string | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}, {
    fullName: string;
    mobileNumber?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    centerId?: string | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}>, {
    fullName: string;
    mobileNumber?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    centerId?: string | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}, {
    fullName: string;
    mobileNumber?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    centerId?: string | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}>, {
    mobileNumber: string;
    permittedCategories: MilkCategory[];
    centerId: string | undefined;
    fullName: string;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}, {
    fullName: string;
    mobileNumber?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    normalizedMobileNumber?: string | undefined;
    milkCategories?: MilkCategory[] | undefined;
    centerId?: string | undefined;
    primaryCenterId?: string | undefined;
    farmerCode?: string | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}>;
export declare const UpdateCustomerInputSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    permittedCategories: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof MilkCategory>, "many">>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankAccountNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankIfscCode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankAccountHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodObject<{
        village: z.ZodOptional<z.ZodString>;
        hamletArea: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
        talukaSubdistrict: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
        district: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        postalCode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    }, "strip", z.ZodTypeAny, {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    }, {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    fullName?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}, {
    fullName?: string | undefined;
    permittedCategories?: MilkCategory[] | undefined;
    address?: {
        village?: string | undefined;
        hamletArea?: string | null | undefined;
        talukaSubdistrict?: string | null | undefined;
        district?: string | undefined;
        state?: string | undefined;
        postalCode?: string | null | undefined;
    } | undefined;
    bankName?: string | null | undefined;
    bankAccountNumber?: string | null | undefined;
    bankIfscCode?: string | null | undefined;
    bankAccountHolderName?: string | null | undefined;
}>;
export declare const CustomerQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof CustomerStatus>>;
    centerId: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodDefault<z.ZodEnum<["full_name", "created_at", "farmer_code"]>>;
    sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sortBy: "full_name" | "created_at" | "farmer_code";
    sortOrder: "asc" | "desc";
    status?: CustomerStatus | undefined;
    centerId?: string | undefined;
    search?: string | undefined;
}, {
    status?: CustomerStatus | undefined;
    centerId?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    sortBy?: "full_name" | "created_at" | "farmer_code" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export declare const CustomerDeleteSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const CustomerRestoreSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const RfidAssignInputSchema: z.ZodObject<{
    cardUid: z.ZodEffects<z.ZodString, string, string>;
    cardType: z.ZodDefault<z.ZodNativeEnum<typeof RfidTechnology>>;
    centerId: z.ZodOptional<z.ZodString>;
    deviceId: z.ZodDefault<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cardUid: string;
    cardType: RfidTechnology;
    deviceId: string;
    centerId?: string | undefined;
    note?: string | undefined;
}, {
    cardUid: string;
    centerId?: string | undefined;
    cardType?: RfidTechnology | undefined;
    deviceId?: string | undefined;
    note?: string | undefined;
}>;
export declare const RfidReplaceInputSchema: z.ZodEffects<z.ZodObject<{
    newCardUid: z.ZodEffects<z.ZodString, string, string>;
    cardType: z.ZodDefault<z.ZodNativeEnum<typeof RfidTechnology>>;
    reasonCategory: z.ZodOptional<z.ZodString>;
    justificationNotes: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    centerId: z.ZodOptional<z.ZodString>;
    deviceId: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cardType: RfidTechnology;
    deviceId: string;
    newCardUid: string;
    centerId?: string | undefined;
    reason?: string | undefined;
    reasonCategory?: string | undefined;
    justificationNotes?: string | undefined;
}, {
    newCardUid: string;
    centerId?: string | undefined;
    reason?: string | undefined;
    cardType?: RfidTechnology | undefined;
    deviceId?: string | undefined;
    reasonCategory?: string | undefined;
    justificationNotes?: string | undefined;
}>, {
    cardType: RfidTechnology;
    deviceId: string;
    newCardUid: string;
    centerId?: string | undefined;
    reason?: string | undefined;
    reasonCategory?: string | undefined;
    justificationNotes?: string | undefined;
}, {
    newCardUid: string;
    centerId?: string | undefined;
    reason?: string | undefined;
    cardType?: RfidTechnology | undefined;
    deviceId?: string | undefined;
    reasonCategory?: string | undefined;
    justificationNotes?: string | undefined;
}>;
export declare const RfidRevokeInputSchema: z.ZodObject<{
    status: z.ZodDefault<z.ZodEnum<[RfidCardStatus.REVOKED, RfidCardStatus.LOST, RfidCardStatus.BLOCKED]>>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: RfidCardStatus.BLOCKED | RfidCardStatus.REVOKED | RfidCardStatus.LOST;
    reason: string;
}, {
    reason: string;
    status?: RfidCardStatus.BLOCKED | RfidCardStatus.REVOKED | RfidCardStatus.LOST | undefined;
}>;
export declare const RfidBlockInputSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const StartIdentificationSessionSchema: z.ZodObject<{
    centerId: z.ZodString;
    deviceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceId: string;
}, {
    centerId: string;
    deviceId: string;
}>;
export declare const FaceIdentificationInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    centerId: z.ZodString;
    deviceId: z.ZodString;
    probeEmbedding: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>>;
    qualityScore: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceId: string;
    sessionId?: string | undefined;
    probeEmbedding?: number[] | null | undefined;
    qualityScore?: number | undefined;
}, {
    centerId: string;
    deviceId: string;
    sessionId?: string | undefined;
    probeEmbedding?: number[] | null | undefined;
    qualityScore?: number | undefined;
}>;
export declare const RfidIdentificationInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    cardUid: z.ZodEffects<z.ZodString, string, string>;
    centerId: z.ZodString;
    deviceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    cardUid: string;
    deviceId: string;
    sessionId?: string | undefined;
}, {
    centerId: string;
    cardUid: string;
    deviceId: string;
    sessionId?: string | undefined;
}>;
export declare const SupervisorVerificationInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    targetCustomerUuid: z.ZodString;
    reasonCategory: z.ZodNativeEnum<typeof SupervisorReasonCategory>;
    justificationNotes: z.ZodString;
    authenticatedVia: z.ZodDefault<z.ZodNativeEnum<typeof SupervisorAuthMethod>>;
    centerId: z.ZodString;
    deviceId: z.ZodString;
    supervisorId: z.ZodOptional<z.ZodString>;
    supervisorPin: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceId: string;
    reasonCategory: SupervisorReasonCategory;
    justificationNotes: string;
    targetCustomerUuid: string;
    authenticatedVia: SupervisorAuthMethod;
    sessionId?: string | undefined;
    supervisorId?: string | undefined;
    supervisorPin?: string | undefined;
}, {
    centerId: string;
    deviceId: string;
    reasonCategory: SupervisorReasonCategory;
    justificationNotes: string;
    targetCustomerUuid: string;
    sessionId?: string | undefined;
    authenticatedVia?: SupervisorAuthMethod | undefined;
    supervisorId?: string | undefined;
    supervisorPin?: string | undefined;
}>;
export declare const MilkCollectionInputSchema: z.ZodObject<{
    customerUuid: z.ZodString;
    sessionType: z.ZodNativeEnum<typeof SessionType>;
    milkCategory: z.ZodNativeEnum<typeof MilkCategory>;
    weightKg: z.ZodNumber;
    fatPercentage: z.ZodNumber;
    snfPercentage: z.ZodNumber;
    identificationMethod: z.ZodNativeEnum<typeof IdentificationMethod>;
    clientIntakeUuid: z.ZodString;
}, "strip", z.ZodTypeAny, {
    customerUuid: string;
    sessionType: SessionType;
    milkCategory: MilkCategory;
    weightKg: number;
    fatPercentage: number;
    snfPercentage: number;
    identificationMethod: IdentificationMethod;
    clientIntakeUuid: string;
}, {
    customerUuid: string;
    sessionType: SessionType;
    milkCategory: MilkCategory;
    weightKg: number;
    fatPercentage: number;
    snfPercentage: number;
    identificationMethod: IdentificationMethod;
    clientIntakeUuid: string;
}>;
export declare const EncryptedBiometricTemplateSchema: z.ZodObject<{
    ciphertextBase64: z.ZodString;
    ivBase64: z.ZodString;
    authTagBase64: z.ZodString;
    keyReference: z.ZodDefault<z.ZodString>;
    algorithm: z.ZodDefault<z.ZodLiteral<"AES-256-GCM">>;
}, "strip", z.ZodTypeAny, {
    ciphertextBase64: string;
    ivBase64: string;
    authTagBase64: string;
    keyReference: string;
    algorithm: "AES-256-GCM";
}, {
    ciphertextBase64: string;
    ivBase64: string;
    authTagBase64: string;
    keyReference?: string | undefined;
    algorithm?: "AES-256-GCM" | undefined;
}>;
export declare const FaceEnrollmentInputSchema: z.ZodObject<{
    modelVersionId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    encryptedTemplate: z.ZodObject<{
        ciphertextBase64: z.ZodString;
        ivBase64: z.ZodString;
        authTagBase64: z.ZodString;
        keyReference: z.ZodDefault<z.ZodString>;
        algorithm: z.ZodDefault<z.ZodLiteral<"AES-256-GCM">>;
    }, "strip", z.ZodTypeAny, {
        ciphertextBase64: string;
        ivBase64: string;
        authTagBase64: string;
        keyReference: string;
        algorithm: "AES-256-GCM";
    }, {
        ciphertextBase64: string;
        ivBase64: string;
        authTagBase64: string;
        keyReference?: string | undefined;
        algorithm?: "AES-256-GCM" | undefined;
    }>;
    qualityScore: z.ZodNumber;
    livenessScore: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    livenessClassification: z.ZodDefault<z.ZodEnum<["LIVE", "SUSPECTED_SPOOF", "RESTRICTED_PASS", "FAILED"]>>;
    deviceId: z.ZodDefault<z.ZodString>;
    samplesCount: z.ZodDefault<z.ZodNumber>;
    officerConsentConfirmation: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
    qualityScore: number;
    modelVersionId: string;
    encryptedTemplate: {
        ciphertextBase64: string;
        ivBase64: string;
        authTagBase64: string;
        keyReference: string;
        algorithm: "AES-256-GCM";
    };
    livenessClassification: "LIVE" | "SUSPECTED_SPOOF" | "RESTRICTED_PASS" | "FAILED";
    samplesCount: number;
    officerConsentConfirmation: boolean;
    livenessScore?: number | null | undefined;
}, {
    qualityScore: number;
    encryptedTemplate: {
        ciphertextBase64: string;
        ivBase64: string;
        authTagBase64: string;
        keyReference?: string | undefined;
        algorithm?: "AES-256-GCM" | undefined;
    };
    deviceId?: string | undefined;
    modelVersionId?: string | undefined;
    livenessScore?: number | null | undefined;
    livenessClassification?: "LIVE" | "SUSPECTED_SPOOF" | "RESTRICTED_PASS" | "FAILED" | undefined;
    samplesCount?: number | undefined;
    officerConsentConfirmation?: boolean | undefined;
}>;
export declare const FaceRevocationInputSchema: z.ZodObject<{
    reason: z.ZodString;
    permanentErasure: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    permanentErasure: boolean;
}, {
    reason: string;
    permanentErasure?: boolean | undefined;
}>;
export declare const CreateCollectionSessionSchema: z.ZodObject<{
    centerId: z.ZodString;
    customerId: z.ZodString;
    operatorId: z.ZodString;
    deviceId: z.ZodString;
    shiftType: z.ZodNativeEnum<typeof SessionType>;
    selectedMilkCategory: z.ZodNativeEnum<typeof MilkCategory>;
    identificationMethod: z.ZodNativeEnum<typeof IdentificationMethod>;
    intakeSequenceUuid: z.ZodOptional<z.ZodString>;
    businessDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceId: string;
    identificationMethod: IdentificationMethod;
    customerId: string;
    operatorId: string;
    shiftType: SessionType;
    selectedMilkCategory: MilkCategory;
    intakeSequenceUuid?: string | undefined;
    businessDate?: string | undefined;
}, {
    centerId: string;
    deviceId: string;
    identificationMethod: IdentificationMethod;
    customerId: string;
    operatorId: string;
    shiftType: SessionType;
    selectedMilkCategory: MilkCategory;
    intakeSequenceUuid?: string | undefined;
    businessDate?: string | undefined;
}>;
export declare const RecordQualityMeasurementSchema: z.ZodObject<{
    sessionId: z.ZodString;
    fatPercentage: z.ZodNumber;
    snfPercentage: z.ZodNumber;
    densityClr: z.ZodOptional<z.ZodNumber>;
    readingSource: z.ZodDefault<z.ZodEnum<["MANUAL_ENTRY", "SOFTWARE_SIMULATOR", "HARDWARE_INTERFACE"]>>;
    deviceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    readingSource: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE";
    deviceId?: string | undefined;
    densityClr?: number | undefined;
}, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    deviceId?: string | undefined;
    densityClr?: number | undefined;
    readingSource?: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE" | undefined;
}>;
export declare const RecordWeightMeasurementSchema: z.ZodObject<{
    sessionId: z.ZodString;
    netWeight: z.ZodNumber;
    grossWeight: z.ZodOptional<z.ZodNumber>;
    tareWeight: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
    readingSource: z.ZodDefault<z.ZodEnum<["MANUAL_ENTRY", "SOFTWARE_SIMULATOR", "HARDWARE_INTERFACE"]>>;
    deviceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    readingSource: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE";
    netWeight: number;
    tareWeight: number;
    measurementUnit: "KG" | "LITERS";
    deviceId?: string | undefined;
    grossWeight?: number | undefined;
}, {
    sessionId: string;
    netWeight: number;
    deviceId?: string | undefined;
    readingSource?: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE" | undefined;
    grossWeight?: number | undefined;
    tareWeight?: number | undefined;
    measurementUnit?: "KG" | "LITERS" | undefined;
}>;
export declare const ValidateSessionSchema: z.ZodObject<{
    sessionId: z.ZodString;
    netWeight: z.ZodNumber;
    fatPercentage: z.ZodNumber;
    snfPercentage: z.ZodNumber;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    netWeight: number;
    measurementUnit: "KG" | "LITERS";
}, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    netWeight: number;
    measurementUnit?: "KG" | "LITERS" | undefined;
}>;
export declare const CompleteCollectionSessionSchema: z.ZodObject<{
    sessionId: z.ZodString;
    netWeight: z.ZodNumber;
    fatPercentage: z.ZodNumber;
    snfPercentage: z.ZodNumber;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
    readingSource: z.ZodDefault<z.ZodEnum<["MANUAL_ENTRY", "SOFTWARE_SIMULATOR", "HARDWARE_INTERFACE"]>>;
    clientIntakeUuid: z.ZodString;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    clientIntakeUuid: string;
    readingSource: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE";
    netWeight: number;
    measurementUnit: "KG" | "LITERS";
    idempotencyKey: string;
}, {
    sessionId: string;
    fatPercentage: number;
    snfPercentage: number;
    clientIntakeUuid: string;
    netWeight: number;
    idempotencyKey: string;
    readingSource?: "MANUAL_ENTRY" | "SOFTWARE_SIMULATOR" | "HARDWARE_INTERFACE" | undefined;
    measurementUnit?: "KG" | "LITERS" | undefined;
}>;
export declare const CancelCollectionSessionSchema: z.ZodObject<{
    reason: z.ZodString;
    operatorId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    operatorId?: string | undefined;
}, {
    reason: string;
    operatorId?: string | undefined;
}>;
export declare const SupervisorAdjustmentSchema: z.ZodObject<{
    supervisorId: z.ZodString;
    reason: z.ZodString;
    adjustmentType: z.ZodEnum<["CORRECTION", "FULL_REVERSAL"]>;
    adjustedNetWeight: z.ZodOptional<z.ZodNumber>;
    adjustedFatPercentage: z.ZodOptional<z.ZodNumber>;
    adjustedSnfPercentage: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    supervisorId: string;
    adjustmentType: "CORRECTION" | "FULL_REVERSAL";
    adjustedNetWeight?: number | undefined;
    adjustedFatPercentage?: number | undefined;
    adjustedSnfPercentage?: number | undefined;
}, {
    reason: string;
    supervisorId: string;
    adjustmentType: "CORRECTION" | "FULL_REVERSAL";
    adjustedNetWeight?: number | undefined;
    adjustedFatPercentage?: number | undefined;
    adjustedSnfPercentage?: number | undefined;
}>;
export declare const CenterValidationLimitsSchema: z.ZodObject<{
    cowFatMin: z.ZodDefault<z.ZodNumber>;
    cowFatMax: z.ZodDefault<z.ZodNumber>;
    cowSnfMin: z.ZodDefault<z.ZodNumber>;
    cowSnfMax: z.ZodDefault<z.ZodNumber>;
    buffaloFatMin: z.ZodDefault<z.ZodNumber>;
    buffaloFatMax: z.ZodDefault<z.ZodNumber>;
    buffaloSnfMin: z.ZodDefault<z.ZodNumber>;
    buffaloSnfMax: z.ZodDefault<z.ZodNumber>;
    offlineSyncMaxDisconnectionHours: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    cowFatMin: number;
    cowFatMax: number;
    cowSnfMin: number;
    cowSnfMax: number;
    buffaloFatMin: number;
    buffaloFatMax: number;
    buffaloSnfMin: number;
    buffaloSnfMax: number;
    offlineSyncMaxDisconnectionHours: number;
}, {
    cowFatMin?: number | undefined;
    cowFatMax?: number | undefined;
    cowSnfMin?: number | undefined;
    cowSnfMax?: number | undefined;
    buffaloFatMin?: number | undefined;
    buffaloFatMax?: number | undefined;
    buffaloSnfMin?: number | undefined;
    buffaloSnfMax?: number | undefined;
    offlineSyncMaxDisconnectionHours?: number | undefined;
}>;
export declare const SyncPushBatchSchema: z.ZodObject<{
    deviceId: z.ZodString;
    centerId: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        entityType: z.ZodString;
        entityId: z.ZodString;
        action: z.ZodEnum<["INSERT", "UPDATE", "DELETE", "RESTORE"]>;
        payload: z.ZodRecord<z.ZodString, z.ZodAny>;
        idempotencyKey: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        entityType: string;
        entityId: string;
        action: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
        payload: Record<string, any>;
        idempotencyKey?: string | undefined;
        createdAt?: string | undefined;
    }, {
        id: string;
        entityType: string;
        entityId: string;
        action: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
        payload: Record<string, any>;
        idempotencyKey?: string | undefined;
        createdAt?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceId: string;
    events: {
        id: string;
        entityType: string;
        entityId: string;
        action: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
        payload: Record<string, any>;
        idempotencyKey?: string | undefined;
        createdAt?: string | undefined;
    }[];
}, {
    centerId: string;
    deviceId: string;
    events: {
        id: string;
        entityType: string;
        entityId: string;
        action: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
        payload: Record<string, any>;
        idempotencyKey?: string | undefined;
        createdAt?: string | undefined;
    }[];
}>;
export declare const DeviceRegisterSchema: z.ZodObject<{
    deviceIdentifier: z.ZodString;
    deviceType: z.ZodEnum<["REGISTRATION_TABLET", "COUNTER_TERMINAL", "MOBILE_COLLECTOR"]>;
    centerId: z.ZodString;
    organizationId: z.ZodOptional<z.ZodString>;
    publicKey: z.ZodOptional<z.ZodString>;
    appVersion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    deviceIdentifier: string;
    deviceType: "REGISTRATION_TABLET" | "COUNTER_TERMINAL" | "MOBILE_COLLECTOR";
    organizationId?: string | undefined;
    publicKey?: string | undefined;
    appVersion?: string | undefined;
}, {
    centerId: string;
    deviceIdentifier: string;
    deviceType: "REGISTRATION_TABLET" | "COUNTER_TERMINAL" | "MOBILE_COLLECTOR";
    organizationId?: string | undefined;
    publicKey?: string | undefined;
    appVersion?: string | undefined;
}>;
export declare const DeviceRevokeSchema: z.ZodObject<{
    deviceId: z.ZodOptional<z.ZodString>;
    deviceIdentifier: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    deviceId?: string | undefined;
    deviceIdentifier?: string | undefined;
}, {
    reason: string;
    deviceId?: string | undefined;
    deviceIdentifier?: string | undefined;
}>;
export declare const SyncAcknowledgeSchema: z.ZodObject<{
    deviceId: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodNumber>;
    downstreamCursor: z.ZodOptional<z.ZodNumber>;
    downstreamTombstoneCursor: z.ZodOptional<z.ZodNumber>;
    clientAppVersion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    deviceId?: string | undefined;
    cursor?: number | undefined;
    downstreamCursor?: number | undefined;
    downstreamTombstoneCursor?: number | undefined;
    clientAppVersion?: string | undefined;
}, {
    deviceId?: string | undefined;
    cursor?: number | undefined;
    downstreamCursor?: number | undefined;
    downstreamTombstoneCursor?: number | undefined;
    clientAppVersion?: string | undefined;
}>;
export declare const CreateFeedCategorySchema: z.ZodObject<{
    code: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    description?: string | null | undefined;
}, {
    code: string;
    name: string;
    description?: string | null | undefined;
}>;
export declare const CreateFeedProductSchema: z.ZodObject<{
    categoryId: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    baseUnit: z.ZodEnum<["KG", "BAG", "PIECE", "LITRE"]>;
    packSize: z.ZodDefault<z.ZodNumber>;
    packUnit: z.ZodDefault<z.ZodString>;
    defaultPurchasePrice: z.ZodDefault<z.ZodNumber>;
    sellingPrice: z.ZodNumber;
    taxRatePercent: z.ZodDefault<z.ZodNumber>;
    hsnCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE", "DISCONTINUED"]>>;
    minimumStockLevel: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    code: string;
    status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    name: string;
    categoryId: string;
    baseUnit: "KG" | "BAG" | "PIECE" | "LITRE";
    packSize: number;
    packUnit: string;
    defaultPurchasePrice: number;
    sellingPrice: number;
    taxRatePercent: number;
    minimumStockLevel: number;
    description?: string | null | undefined;
    hsnCode?: string | null | undefined;
}, {
    code: string;
    name: string;
    categoryId: string;
    baseUnit: "KG" | "BAG" | "PIECE" | "LITRE";
    sellingPrice: number;
    status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | undefined;
    description?: string | null | undefined;
    packSize?: number | undefined;
    packUnit?: string | undefined;
    defaultPurchasePrice?: number | undefined;
    taxRatePercent?: number | undefined;
    hsnCode?: string | null | undefined;
    minimumStockLevel?: number | undefined;
}>;
export declare const UpdateFeedProductSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    baseUnit: z.ZodOptional<z.ZodEnum<["KG", "BAG", "PIECE", "LITRE"]>>;
    packSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    packUnit: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    defaultPurchasePrice: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sellingPrice: z.ZodOptional<z.ZodNumber>;
    taxRatePercent: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    hsnCode: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE", "DISCONTINUED"]>>>;
    minimumStockLevel: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    categoryId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    categoryId?: string | undefined;
    baseUnit?: "KG" | "BAG" | "PIECE" | "LITRE" | undefined;
    packSize?: number | undefined;
    packUnit?: string | undefined;
    defaultPurchasePrice?: number | undefined;
    sellingPrice?: number | undefined;
    taxRatePercent?: number | undefined;
    hsnCode?: string | null | undefined;
    minimumStockLevel?: number | undefined;
}, {
    code?: string | undefined;
    status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    categoryId?: string | undefined;
    baseUnit?: "KG" | "BAG" | "PIECE" | "LITRE" | undefined;
    packSize?: number | undefined;
    packUnit?: string | undefined;
    defaultPurchasePrice?: number | undefined;
    sellingPrice?: number | undefined;
    taxRatePercent?: number | undefined;
    hsnCode?: string | null | undefined;
    minimumStockLevel?: number | undefined;
}>;
export declare const CreateFeedSupplierSchema: z.ZodObject<{
    supplierCode: z.ZodString;
    name: z.ZodString;
    contactPerson: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    phoneNumber: z.ZodString;
    email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    address: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    gstNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    panNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE", "BLOCKED"]>>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "INACTIVE" | "BLOCKED";
    name: string;
    supplierCode: string;
    phoneNumber: string;
    address?: string | null | undefined;
    contactPerson?: string | null | undefined;
    email?: string | null | undefined;
    gstNumber?: string | null | undefined;
    panNumber?: string | null | undefined;
}, {
    name: string;
    supplierCode: string;
    phoneNumber: string;
    status?: "ACTIVE" | "INACTIVE" | "BLOCKED" | undefined;
    address?: string | null | undefined;
    contactPerson?: string | null | undefined;
    email?: string | null | undefined;
    gstNumber?: string | null | undefined;
    panNumber?: string | null | undefined;
}>;
export declare const FeedPurchaseItemInputSchema: z.ZodObject<{
    productId: z.ZodString;
    quantity: z.ZodNumber;
    unit: z.ZodString;
    unitCost: z.ZodNumber;
    taxRatePercent: z.ZodDefault<z.ZodNumber>;
    batchNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    expiryDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    taxRatePercent: number;
    productId: string;
    quantity: number;
    unit: string;
    unitCost: number;
    batchNumber?: string | null | undefined;
    expiryDate?: string | null | undefined;
}, {
    productId: string;
    quantity: number;
    unit: string;
    unitCost: number;
    taxRatePercent?: number | undefined;
    batchNumber?: string | null | undefined;
    expiryDate?: string | null | undefined;
}>;
export declare const CreateFeedPurchaseSchema: z.ZodObject<{
    centerId: z.ZodString;
    supplierId: z.ZodString;
    purchaseOrderNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    supplierInvoiceNumber: z.ZodString;
    purchaseDate: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unit: z.ZodString;
        unitCost: z.ZodNumber;
        taxRatePercent: z.ZodDefault<z.ZodNumber>;
        batchNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        expiryDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        taxRatePercent: number;
        productId: string;
        quantity: number;
        unit: string;
        unitCost: number;
        batchNumber?: string | null | undefined;
        expiryDate?: string | null | undefined;
    }, {
        productId: string;
        quantity: number;
        unit: string;
        unitCost: number;
        taxRatePercent?: number | undefined;
        batchNumber?: string | null | undefined;
        expiryDate?: string | null | undefined;
    }>, "many">;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    idempotencyKey: string;
    supplierId: string;
    supplierInvoiceNumber: string;
    purchaseDate: string;
    items: {
        taxRatePercent: number;
        productId: string;
        quantity: number;
        unit: string;
        unitCost: number;
        batchNumber?: string | null | undefined;
        expiryDate?: string | null | undefined;
    }[];
    purchaseOrderNumber?: string | null | undefined;
    notes?: string | null | undefined;
}, {
    centerId: string;
    idempotencyKey: string;
    supplierId: string;
    supplierInvoiceNumber: string;
    purchaseDate: string;
    items: {
        productId: string;
        quantity: number;
        unit: string;
        unitCost: number;
        taxRatePercent?: number | undefined;
        batchNumber?: string | null | undefined;
        expiryDate?: string | null | undefined;
    }[];
    purchaseOrderNumber?: string | null | undefined;
    notes?: string | null | undefined;
}>;
export declare const ReceiveFeedPurchaseSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    idempotencyKey: string;
    notes?: string | null | undefined;
}, {
    idempotencyKey: string;
    notes?: string | null | undefined;
}>;
export declare const FeedSaleItemInputSchema: z.ZodObject<{
    productId: z.ZodString;
    quantity: z.ZodNumber;
    unit: z.ZodString;
    discountAmount: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    productId: string;
    quantity: number;
    unit: string;
    discountAmount: number;
}, {
    productId: string;
    quantity: number;
    unit: string;
    discountAmount?: number | undefined;
}>;
export declare const CreateFeedSaleSchema: z.ZodObject<{
    centerId: z.ZodString;
    customerId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unit: z.ZodString;
        discountAmount: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        productId: string;
        quantity: number;
        unit: string;
        discountAmount: number;
    }, {
        productId: string;
        quantity: number;
        unit: string;
        discountAmount?: number | undefined;
    }>, "many">;
    paymentMode: z.ZodDefault<z.ZodEnum<["CREDIT", "CASH"]>>;
    discountAmount: z.ZodDefault<z.ZodNumber>;
    discountApprovedBy: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
    clientSaleUuid: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    items: {
        productId: string;
        quantity: number;
        unit: string;
        discountAmount: number;
    }[];
    discountAmount: number;
    paymentMode: "CREDIT" | "CASH";
    discountApprovedBy?: string | null | undefined;
    clientSaleUuid?: string | null | undefined;
}, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    items: {
        productId: string;
        quantity: number;
        unit: string;
        discountAmount?: number | undefined;
    }[];
    discountAmount?: number | undefined;
    paymentMode?: "CREDIT" | "CASH" | undefined;
    discountApprovedBy?: string | null | undefined;
    clientSaleUuid?: string | null | undefined;
}>;
export declare const CreateFeedReturnSchema: z.ZodObject<{
    saleItemId: z.ZodString;
    returnQuantity: z.ZodNumber;
    stockCondition: z.ZodEnum<["SALEABLE", "DAMAGED"]>;
    reason: z.ZodString;
    approvedBy: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    idempotencyKey: string;
    saleItemId: string;
    returnQuantity: number;
    stockCondition: "SALEABLE" | "DAMAGED";
    approvedBy?: string | null | undefined;
}, {
    reason: string;
    idempotencyKey: string;
    saleItemId: string;
    returnQuantity: number;
    stockCondition: "SALEABLE" | "DAMAGED";
    approvedBy?: string | null | undefined;
}>;
export declare const CreateInventoryTransferSchema: z.ZodObject<{
    sourceCenterId: z.ZodString;
    destinationCenterId: z.ZodString;
    productId: z.ZodString;
    quantity: z.ZodNumber;
    unit: z.ZodString;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    idempotencyKey: string;
    productId: string;
    quantity: number;
    unit: string;
    sourceCenterId: string;
    destinationCenterId: string;
    notes?: string | null | undefined;
}, {
    idempotencyKey: string;
    productId: string;
    quantity: number;
    unit: string;
    sourceCenterId: string;
    destinationCenterId: string;
    notes?: string | null | undefined;
}>;
export declare const CreateInventoryAdjustmentSchema: z.ZodObject<{
    centerId: z.ZodString;
    productId: z.ZodString;
    adjustmentType: z.ZodEnum<["DAMAGED_WRITE_OFF", "STOCK_CORRECTION", "PHYSICAL_AUDIT_SURPLUS", "PHYSICAL_AUDIT_DEFICIT"]>;
    quantity: z.ZodNumber;
    direction: z.ZodEnum<["IN", "OUT"]>;
    reason: z.ZodString;
    approvedBy: z.ZodString;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    reason: string;
    idempotencyKey: string;
    adjustmentType: "DAMAGED_WRITE_OFF" | "STOCK_CORRECTION" | "PHYSICAL_AUDIT_SURPLUS" | "PHYSICAL_AUDIT_DEFICIT";
    productId: string;
    quantity: number;
    approvedBy: string;
    direction: "IN" | "OUT";
}, {
    centerId: string;
    reason: string;
    idempotencyKey: string;
    adjustmentType: "DAMAGED_WRITE_OFF" | "STOCK_CORRECTION" | "PHYSICAL_AUDIT_SURPLUS" | "PHYSICAL_AUDIT_DEFICIT";
    productId: string;
    quantity: number;
    approvedBy: string;
    direction: "IN" | "OUT";
}>;
export declare const PaymentDirectionSchema: z.ZodNativeEnum<typeof PaymentDirection>;
export declare const PaymentMethodSchema: z.ZodNativeEnum<typeof PaymentMethod>;
export declare const PaymentStatusSchema: z.ZodNativeEnum<typeof PaymentStatus>;
export declare const PaymentBatchStatusSchema: z.ZodNativeEnum<typeof PaymentBatchStatus>;
export declare const ReconciliationStatusSchema: z.ZodNativeEnum<typeof ReconciliationStatus>;
export declare const CreatePayoutInputSchema: z.ZodObject<{
    centerId: z.ZodString;
    customerId: z.ZodString;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    paymentMethod: z.ZodNativeEnum<typeof PaymentMethod>;
    referenceNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    sourceTransactionType: z.ZodDefault<z.ZodString>;
    sourceTransactionId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    allowOverpaymentAdvance: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    sourceTransactionType: string;
    allowOverpaymentAdvance: boolean;
    notes?: string | null | undefined;
    referenceNumber?: string | null | undefined;
    sourceTransactionId?: string | null | undefined;
}, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string | null | undefined;
    currency?: string | undefined;
    referenceNumber?: string | null | undefined;
    sourceTransactionType?: string | undefined;
    sourceTransactionId?: string | null | undefined;
    allowOverpaymentAdvance?: boolean | undefined;
}>;
export declare const ApprovePayoutInputSchema: z.ZodObject<{
    comments: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    comments?: string | null | undefined;
}, {
    comments?: string | null | undefined;
}>;
export declare const SubmitPayoutInputSchema: z.ZodObject<{
    paymentReference: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    paymentReference?: string | null | undefined;
}, {
    paymentReference?: string | null | undefined;
}>;
export declare const ConfirmPayoutInputSchema: z.ZodObject<{
    paymentReference: z.ZodString;
    settledAt: z.ZodOptional<z.ZodString>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    paymentReference: string;
    notes?: string | null | undefined;
    settledAt?: string | undefined;
}, {
    paymentReference: string;
    notes?: string | null | undefined;
    settledAt?: string | undefined;
}>;
export declare const FailPayoutInputSchema: z.ZodObject<{
    failureReason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    failureReason: string;
}, {
    failureReason: string;
}>;
export declare const ReversePayoutInputSchema: z.ZodObject<{
    reason: z.ZodString;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    idempotencyKey: string;
}, {
    reason: string;
    idempotencyKey: string;
}>;
export declare const CreateReceiptInputSchema: z.ZodObject<{
    centerId: z.ZodString;
    customerId: z.ZodString;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    paymentMethod: z.ZodNativeEnum<typeof PaymentMethod>;
    referenceNumber: z.ZodString;
    sourceTransactionType: z.ZodDefault<z.ZodString>;
    sourceTransactionId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodString;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    referenceNumber: string;
    sourceTransactionType: string;
    notes?: string | null | undefined;
    sourceTransactionId?: string | null | undefined;
}, {
    centerId: string;
    customerId: string;
    idempotencyKey: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber: string;
    notes?: string | null | undefined;
    currency?: string | undefined;
    sourceTransactionType?: string | undefined;
    sourceTransactionId?: string | null | undefined;
}>;
export declare const ConfirmReceiptInputSchema: z.ZodObject<{
    referenceNumber: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    referenceNumber?: string | undefined;
}, {
    referenceNumber?: string | undefined;
}>;
export declare const CreatePaymentBatchSchema: z.ZodObject<{
    centerId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    billingCycleId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    billingPeriodStart: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    billingPeriodEnd: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    periodStart: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    periodEnd: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    paymentMethod: z.ZodDefault<z.ZodUnion<[z.ZodNativeEnum<typeof PaymentMethod>, z.ZodString]>>;
    customerIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    payoutIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    idempotencyKey: z.ZodString;
    excludeUnverifiedBankDetails: z.ZodOptional<z.ZodBoolean>;
    debitAccountNumber: z.ZodOptional<z.ZodString>;
    initialStatus: z.ZodOptional<z.ZodEnum<["DRAFT", "CALCULATED"]>>;
}, "strip", z.ZodTypeAny, {
    idempotencyKey: string;
    paymentMethod: string;
    centerId?: string | null | undefined;
    billingCycleId?: string | null | undefined;
    billingPeriodStart?: string | null | undefined;
    billingPeriodEnd?: string | null | undefined;
    periodStart?: string | null | undefined;
    periodEnd?: string | null | undefined;
    customerIds?: string[] | undefined;
    payoutIds?: string[] | undefined;
    excludeUnverifiedBankDetails?: boolean | undefined;
    debitAccountNumber?: string | undefined;
    initialStatus?: "DRAFT" | "CALCULATED" | undefined;
}, {
    idempotencyKey: string;
    centerId?: string | null | undefined;
    paymentMethod?: string | undefined;
    billingCycleId?: string | null | undefined;
    billingPeriodStart?: string | null | undefined;
    billingPeriodEnd?: string | null | undefined;
    periodStart?: string | null | undefined;
    periodEnd?: string | null | undefined;
    customerIds?: string[] | undefined;
    payoutIds?: string[] | undefined;
    excludeUnverifiedBankDetails?: boolean | undefined;
    debitAccountNumber?: string | undefined;
    initialStatus?: "DRAFT" | "CALCULATED" | undefined;
}>;
export declare const ReconcileBatchItemInputSchema: z.ZodObject<{
    itemId: z.ZodString;
    status: z.ZodEnum<["SETTLED", "FAILED"]>;
    beneficiaryReference: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    failureReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "FAILED" | "SETTLED";
    itemId: string;
    failureReason?: string | null | undefined;
    beneficiaryReference?: string | null | undefined;
}, {
    status: "FAILED" | "SETTLED";
    itemId: string;
    failureReason?: string | null | undefined;
    beneficiaryReference?: string | null | undefined;
}>;
export declare const ReconcileBatchSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        itemId: z.ZodString;
        status: z.ZodEnum<["SETTLED", "FAILED"]>;
        beneficiaryReference: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        failureReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        status: "FAILED" | "SETTLED";
        itemId: string;
        failureReason?: string | null | undefined;
        beneficiaryReference?: string | null | undefined;
    }, {
        status: "FAILED" | "SETTLED";
        itemId: string;
        failureReason?: string | null | undefined;
        beneficiaryReference?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        status: "FAILED" | "SETTLED";
        itemId: string;
        failureReason?: string | null | undefined;
        beneficiaryReference?: string | null | undefined;
    }[];
}, {
    results: {
        status: "FAILED" | "SETTLED";
        itemId: string;
        failureReason?: string | null | undefined;
        beneficiaryReference?: string | null | undefined;
    }[];
}>;
export declare const BankStatementRowSchema: z.ZodObject<{
    transactionDate: z.ZodString;
    referenceNumber: z.ZodString;
    amount: z.ZodNumber;
    direction: z.ZodEnum<["CREDIT", "DEBIT"]>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    direction: "CREDIT" | "DEBIT";
    amount: number;
    referenceNumber: string;
    transactionDate: string;
    description?: string | null | undefined;
}, {
    direction: "CREDIT" | "DEBIT";
    amount: number;
    referenceNumber: string;
    transactionDate: string;
    description?: string | null | undefined;
}>;
export declare const BankStatementImportSchema: z.ZodObject<{
    fileName: z.ZodString;
    rows: z.ZodArray<z.ZodObject<{
        transactionDate: z.ZodString;
        referenceNumber: z.ZodString;
        amount: z.ZodNumber;
        direction: z.ZodEnum<["CREDIT", "DEBIT"]>;
        description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        direction: "CREDIT" | "DEBIT";
        amount: number;
        referenceNumber: string;
        transactionDate: string;
        description?: string | null | undefined;
    }, {
        direction: "CREDIT" | "DEBIT";
        amount: number;
        referenceNumber: string;
        transactionDate: string;
        description?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    fileName: string;
    rows: {
        direction: "CREDIT" | "DEBIT";
        amount: number;
        referenceNumber: string;
        transactionDate: string;
        description?: string | null | undefined;
    }[];
}, {
    fileName: string;
    rows: {
        direction: "CREDIT" | "DEBIT";
        amount: number;
        referenceNumber: string;
        transactionDate: string;
        description?: string | null | undefined;
    }[];
}>;
export declare const ResolveReconciliationSchema: z.ZodObject<{
    action: z.ZodEnum<["CONFIRMED_SETTLED", "FLAGGED_MISMATCH", "REJECTED_DUPLICATE", "MANUALLY_MATCHED", "DISMISSED"]>;
    matchedPayoutId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    matchedReceiptId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    notes: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "CONFIRMED_SETTLED" | "FLAGGED_MISMATCH" | "REJECTED_DUPLICATE" | "MANUALLY_MATCHED" | "DISMISSED";
    notes: string;
    matchedPayoutId?: string | null | undefined;
    matchedReceiptId?: string | null | undefined;
}, {
    action: "CONFIRMED_SETTLED" | "FLAGGED_MISMATCH" | "REJECTED_DUPLICATE" | "MANUALLY_MATCHED" | "DISMISSED";
    notes: string;
    matchedPayoutId?: string | null | undefined;
    matchedReceiptId?: string | null | undefined;
}>;
export declare const BillStatusSchema: z.ZodNativeEnum<typeof BillStatus>;
export declare const BillingCycleTypeSchema: z.ZodNativeEnum<typeof BillingCycleType>;
export declare const BillingPeriodStatusSchema: z.ZodNativeEnum<typeof BillingPeriodStatus>;
export declare const CreateBillingPeriodSchema: z.ZodEffects<z.ZodObject<{
    centerId: z.ZodString;
    periodName: z.ZodString;
    startDate: z.ZodString;
    endDate: z.ZodString;
    cycleType: z.ZodDefault<z.ZodNativeEnum<typeof BillingCycleType>>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType: BillingCycleType;
}, {
    centerId: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType?: BillingCycleType | undefined;
}>, {
    centerId: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType: BillingCycleType;
}, {
    centerId: string;
    periodName: string;
    startDate: string;
    endDate: string;
    cycleType?: BillingCycleType | undefined;
}>;
export declare const GenerateBillsSchema: z.ZodObject<{
    customerId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId?: string | null | undefined;
    idempotencyKey?: string | undefined;
}, {
    customerId?: string | null | undefined;
    idempotencyKey?: string | undefined;
}>;
export declare const AdjustBillSchema: z.ZodObject<{
    adjustmentType: z.ZodEnum<["CREDIT", "DEBIT"]>;
    amount: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    adjustmentType: "CREDIT" | "DEBIT";
    amount: number;
}, {
    reason: string;
    adjustmentType: "CREDIT" | "DEBIT";
    amount: number;
}>;
export declare const SubmitReviewSchema: z.ZodObject<{
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    notes?: string | null | undefined;
}, {
    notes?: string | null | undefined;
}>;
export declare const ApproveBillSchema: z.ZodObject<{
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    notes?: string | null | undefined;
}, {
    notes?: string | null | undefined;
}>;
export declare const FinalizeBillSchema: z.ZodObject<{
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    notes?: string | null | undefined;
}, {
    notes?: string | null | undefined;
}>;
export declare const ListBillingPeriodsQuerySchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof BillingPeriodStatus>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: BillingPeriodStatus | undefined;
    centerId?: string | undefined;
}, {
    status?: BillingPeriodStatus | undefined;
    centerId?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const BillingSchedulerRunSchema: z.ZodObject<{
    centerId: z.ZodOptional<z.ZodString>;
    targetDate: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    dryRun: boolean;
    centerId?: string | undefined;
    targetDate?: string | undefined;
}, {
    centerId?: string | undefined;
    targetDate?: string | undefined;
    dryRun?: boolean | undefined;
}>;
export declare const CreateRateChartSchema: z.ZodObject<{
    name: z.ZodString;
    milkCategory: z.ZodNativeEnum<typeof MilkCategory>;
    centerScope: z.ZodOptional<z.ZodEnum<["ORGANIZATION_WIDE", "CENTER_SPECIFIC"]>>;
    centerId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    pricingType: z.ZodDefault<z.ZodEnum<["GRID", "TOTAL_SOLIDS_FORMULA", "TWO_AXIS_FORMULA"]>>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    milkCategory: MilkCategory;
    name: string;
    pricingType: "GRID" | "TOTAL_SOLIDS_FORMULA" | "TWO_AXIS_FORMULA";
    centerId?: string | null | undefined;
    description?: string | null | undefined;
    centerScope?: "ORGANIZATION_WIDE" | "CENTER_SPECIFIC" | undefined;
}, {
    milkCategory: MilkCategory;
    name: string;
    centerId?: string | null | undefined;
    description?: string | null | undefined;
    centerScope?: "ORGANIZATION_WIDE" | "CENTER_SPECIFIC" | undefined;
    pricingType?: "GRID" | "TOTAL_SOLIDS_FORMULA" | "TWO_AXIS_FORMULA" | undefined;
}>;
export declare const CreateRateVersionSchema: z.ZodObject<{
    effectiveFrom: z.ZodString;
    effectiveTo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    pricingUnit: z.ZodDefault<z.ZodEnum<["PER_KG", "PER_LITER"]>>;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    fatMin: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    fatMax: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    snfMin: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    snfMax: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    measurementUnit: "KG" | "LITERS";
    effectiveFrom: string;
    pricingUnit: "PER_KG" | "PER_LITER";
    notes?: string | null | undefined;
    effectiveTo?: string | null | undefined;
    fatMin?: number | null | undefined;
    fatMax?: number | null | undefined;
    snfMin?: number | null | undefined;
    snfMax?: number | null | undefined;
}, {
    effectiveFrom: string;
    measurementUnit?: "KG" | "LITERS" | undefined;
    notes?: string | null | undefined;
    effectiveTo?: string | null | undefined;
    pricingUnit?: "PER_KG" | "PER_LITER" | undefined;
    fatMin?: number | null | undefined;
    fatMax?: number | null | undefined;
    snfMin?: number | null | undefined;
    snfMax?: number | null | undefined;
}>;
export declare const RateMatrixCellSchema: z.ZodObject<{
    fatPercentage: z.ZodEffects<z.ZodNumber, number, number>;
    snfPercentage: z.ZodEffects<z.ZodNumber, number, number>;
    ratePerUnit: z.ZodEffects<z.ZodNumber, number, number>;
}, "strip", z.ZodTypeAny, {
    fatPercentage: number;
    snfPercentage: number;
    ratePerUnit: number;
}, {
    fatPercentage: number;
    snfPercentage: number;
    ratePerUnit: number;
}>;
export declare const RateMatrixSubmissionSchema: z.ZodObject<{
    cells: z.ZodArray<z.ZodObject<{
        fatPercentage: z.ZodEffects<z.ZodNumber, number, number>;
        snfPercentage: z.ZodEffects<z.ZodNumber, number, number>;
        ratePerUnit: z.ZodEffects<z.ZodNumber, number, number>;
    }, "strip", z.ZodTypeAny, {
        fatPercentage: number;
        snfPercentage: number;
        ratePerUnit: number;
    }, {
        fatPercentage: number;
        snfPercentage: number;
        ratePerUnit: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    cells: {
        fatPercentage: number;
        snfPercentage: number;
        ratePerUnit: number;
    }[];
}, {
    cells: {
        fatPercentage: number;
        snfPercentage: number;
        ratePerUnit: number;
    }[];
}>;
export declare const RateCalculationRequestSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    centerId: z.ZodString;
    milkCategory: z.ZodNativeEnum<typeof MilkCategory>;
    fat: z.ZodNumber;
    snf: z.ZodNumber;
    netWeight: z.ZodOptional<z.ZodNumber>;
    quantity: z.ZodOptional<z.ZodNumber>;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
    businessDate: z.ZodOptional<z.ZodString>;
    versionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    milkCategory: MilkCategory;
    measurementUnit: "KG" | "LITERS";
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    netWeight?: number | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}, {
    centerId: string;
    milkCategory: MilkCategory;
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    netWeight?: number | undefined;
    measurementUnit?: "KG" | "LITERS" | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}>, {
    centerId: string;
    milkCategory: MilkCategory;
    measurementUnit: "KG" | "LITERS";
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    netWeight?: number | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}, {
    centerId: string;
    milkCategory: MilkCategory;
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    netWeight?: number | undefined;
    measurementUnit?: "KG" | "LITERS" | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}>, {
    netWeight: number;
    centerId: string;
    milkCategory: MilkCategory;
    measurementUnit: "KG" | "LITERS";
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}, {
    centerId: string;
    milkCategory: MilkCategory;
    fat: number;
    snf: number;
    businessDate?: string | undefined;
    netWeight?: number | undefined;
    measurementUnit?: "KG" | "LITERS" | undefined;
    quantity?: number | undefined;
    versionId?: string | undefined;
}>;
export declare const RatePreviewCalculationSchema: z.ZodObject<{
    fat: z.ZodNumber;
    snf: z.ZodNumber;
    netWeight: z.ZodNumber;
    measurementUnit: z.ZodDefault<z.ZodEnum<["KG", "LITERS"]>>;
}, "strip", z.ZodTypeAny, {
    netWeight: number;
    measurementUnit: "KG" | "LITERS";
    fat: number;
    snf: number;
}, {
    netWeight: number;
    fat: number;
    snf: number;
    measurementUnit?: "KG" | "LITERS" | undefined;
}>;
/**
 * Validates a rate matrix for duplicates, decimal precision, valid step, and range integrity.
 */
export declare function validateRateMatrix(cells: Array<{
    fatPercentage: number;
    snfPercentage: number;
    ratePerUnit: number;
}>, category: MilkCategory): {
    isValid: boolean;
    totalCells: number;
    duplicateCells: Array<{
        fat: number;
        snf: number;
    }>;
    errors: string[];
};
export declare const PayrollRunStatusSchema: z.ZodNativeEnum<typeof PayrollRunStatus>;
export declare const PayslipPaymentStatusSchema: z.ZodNativeEnum<typeof PayslipPaymentStatus>;
export declare const SalaryPaymentStatusSchema: z.ZodNativeEnum<typeof SalaryPaymentStatus>;
export declare const CreateEmployeeSchema: z.ZodObject<{
    employeeCode: z.ZodOptional<z.ZodString>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    mobileNumber: z.ZodString;
    email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nationalIdMask: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    addressLine1: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    addressLine2: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    city: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    state: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    postalCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    joiningDate: z.ZodString;
    employmentStatus: z.ZodDefault<z.ZodNativeEnum<typeof EmploymentStatus>>;
    employmentType: z.ZodDefault<z.ZodNativeEnum<typeof EmploymentType>>;
    designation: z.ZodString;
    department: z.ZodString;
    primaryCenterId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactPhone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactRelation: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactApproved: z.ZodDefault<z.ZodBoolean>;
    bankName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankAccountNumberMask: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankIfsc: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    role: z.ZodOptional<z.ZodNativeEnum<typeof UserRole>>;
    createUserAccount: z.ZodDefault<z.ZodBoolean>;
    username: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mobileNumber: string;
    firstName: string;
    lastName: string;
    joiningDate: string;
    employmentStatus: EmploymentStatus;
    employmentType: EmploymentType;
    designation: string;
    department: string;
    emergencyContactApproved: boolean;
    createUserAccount: boolean;
    state?: string | null | undefined;
    postalCode?: string | null | undefined;
    primaryCenterId?: string | null | undefined;
    bankName?: string | null | undefined;
    email?: string | null | undefined;
    employeeCode?: string | undefined;
    nationalIdMask?: string | null | undefined;
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    city?: string | null | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    emergencyContactRelation?: string | null | undefined;
    bankAccountNumberMask?: string | null | undefined;
    bankIfsc?: string | null | undefined;
    role?: UserRole | undefined;
    username?: string | undefined;
}, {
    mobileNumber: string;
    firstName: string;
    lastName: string;
    joiningDate: string;
    designation: string;
    department: string;
    state?: string | null | undefined;
    postalCode?: string | null | undefined;
    primaryCenterId?: string | null | undefined;
    bankName?: string | null | undefined;
    email?: string | null | undefined;
    employeeCode?: string | undefined;
    nationalIdMask?: string | null | undefined;
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    city?: string | null | undefined;
    employmentStatus?: EmploymentStatus | undefined;
    employmentType?: EmploymentType | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    emergencyContactRelation?: string | null | undefined;
    emergencyContactApproved?: boolean | undefined;
    bankAccountNumberMask?: string | null | undefined;
    bankIfsc?: string | null | undefined;
    role?: UserRole | undefined;
    createUserAccount?: boolean | undefined;
    username?: string | undefined;
}>;
export declare const UpdateEmployeeSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    mobileNumber: z.ZodOptional<z.ZodString>;
    email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nationalIdMask: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    addressLine1: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    addressLine2: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    city: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    state: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    postalCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    joiningDate: z.ZodOptional<z.ZodString>;
    terminationDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    employmentStatus: z.ZodOptional<z.ZodNativeEnum<typeof EmploymentStatus>>;
    employmentType: z.ZodOptional<z.ZodNativeEnum<typeof EmploymentType>>;
    designation: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    primaryCenterId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactPhone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactRelation: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    emergencyContactApproved: z.ZodOptional<z.ZodBoolean>;
    bankName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankAccountNumberMask: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankIfsc: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    state?: string | null | undefined;
    postalCode?: string | null | undefined;
    mobileNumber?: string | undefined;
    primaryCenterId?: string | null | undefined;
    bankName?: string | null | undefined;
    email?: string | null | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    nationalIdMask?: string | null | undefined;
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    city?: string | null | undefined;
    joiningDate?: string | undefined;
    employmentStatus?: EmploymentStatus | undefined;
    employmentType?: EmploymentType | undefined;
    designation?: string | undefined;
    department?: string | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    emergencyContactRelation?: string | null | undefined;
    emergencyContactApproved?: boolean | undefined;
    bankAccountNumberMask?: string | null | undefined;
    bankIfsc?: string | null | undefined;
    terminationDate?: string | null | undefined;
}, {
    state?: string | null | undefined;
    postalCode?: string | null | undefined;
    mobileNumber?: string | undefined;
    primaryCenterId?: string | null | undefined;
    bankName?: string | null | undefined;
    email?: string | null | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    nationalIdMask?: string | null | undefined;
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    city?: string | null | undefined;
    joiningDate?: string | undefined;
    employmentStatus?: EmploymentStatus | undefined;
    employmentType?: EmploymentType | undefined;
    designation?: string | undefined;
    department?: string | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    emergencyContactRelation?: string | null | undefined;
    emergencyContactApproved?: boolean | undefined;
    bankAccountNumberMask?: string | null | undefined;
    bankIfsc?: string | null | undefined;
    terminationDate?: string | null | undefined;
}>;
export declare const AssignEmployeeRoleSchema: z.ZodObject<{
    role: z.ZodNativeEnum<typeof UserRole>;
    centerIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    primaryCenterId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: UserRole;
    primaryCenterId?: string | undefined;
    centerIds?: string[] | undefined;
}, {
    role: UserRole;
    primaryCenterId?: string | undefined;
    centerIds?: string[] | undefined;
}>;
export declare const AssignEmployeeCenterSchema: z.ZodObject<{
    centerId: z.ZodString;
    isPrimary: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    centerId: string;
    isPrimary: boolean;
}, {
    centerId: string;
    isPrimary?: boolean | undefined;
}>;
export declare const CreateShiftSchema: z.ZodObject<{
    code: z.ZodString;
    name: z.ZodString;
    startTime: z.ZodString;
    endTime: z.ZodString;
    gracePeriodMinutes: z.ZodDefault<z.ZodNumber>;
    halfDayThresholdHours: z.ZodDefault<z.ZodNumber>;
    fullDayThresholdHours: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes: number;
    halfDayThresholdHours: number;
    fullDayThresholdHours: number;
}, {
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes?: number | undefined;
    halfDayThresholdHours?: number | undefined;
    fullDayThresholdHours?: number | undefined;
}>;
export declare const RecordAttendanceSchema: z.ZodObject<{
    employeeId: z.ZodString;
    centerId: z.ZodString;
    attendanceDate: z.ZodString;
    shiftType: z.ZodDefault<z.ZodNativeEnum<typeof EmployeeShiftType>>;
    shiftId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    checkInTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    checkOutTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodNativeEnum<typeof AttendanceStatus>>;
    overtimeHours: z.ZodDefault<z.ZodNumber>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: AttendanceStatus;
    centerId: string;
    shiftType: EmployeeShiftType;
    employeeId: string;
    attendanceDate: string;
    overtimeHours: number;
    notes?: string | null | undefined;
    shiftId?: string | null | undefined;
    checkInTime?: string | null | undefined;
    checkOutTime?: string | null | undefined;
}, {
    centerId: string;
    employeeId: string;
    attendanceDate: string;
    status?: AttendanceStatus | undefined;
    shiftType?: EmployeeShiftType | undefined;
    notes?: string | null | undefined;
    shiftId?: string | null | undefined;
    checkInTime?: string | null | undefined;
    checkOutTime?: string | null | undefined;
    overtimeHours?: number | undefined;
}>;
export declare const AttendanceCorrectionSchema: z.ZodObject<{
    checkInTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    checkOutTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof AttendanceStatus>>;
    overtimeHours: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodString;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    status?: AttendanceStatus | undefined;
    notes?: string | null | undefined;
    checkInTime?: string | null | undefined;
    checkOutTime?: string | null | undefined;
    overtimeHours?: number | undefined;
}, {
    reason: string;
    status?: AttendanceStatus | undefined;
    notes?: string | null | undefined;
    checkInTime?: string | null | undefined;
    checkOutTime?: string | null | undefined;
    overtimeHours?: number | undefined;
}>;
export declare const CreateLeaveRequestSchema: z.ZodObject<{
    employeeId: z.ZodString;
    leaveType: z.ZodNativeEnum<typeof LeaveType>;
    startDate: z.ZodString;
    endDate: z.ZodString;
    daysCount: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    startDate: string;
    endDate: string;
    employeeId: string;
    leaveType: LeaveType;
    daysCount: number;
}, {
    reason: string;
    startDate: string;
    endDate: string;
    employeeId: string;
    leaveType: LeaveType;
    daysCount: number;
}>;
export declare const ApproveLeaveSchema: z.ZodObject<{
    status: z.ZodEnum<[LeaveStatus.APPROVED, LeaveStatus.REJECTED]>;
    rejectionReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
    rejectionReason?: string | null | undefined;
}, {
    status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
    rejectionReason?: string | null | undefined;
}>;
export declare const CreateSalaryStructureSchema: z.ZodObject<{
    employeeId: z.ZodString;
    calculationBasis: z.ZodDefault<z.ZodNativeEnum<typeof SalaryCalculationBasis>>;
    baseSalary: z.ZodNumber;
    hra: z.ZodDefault<z.ZodNumber>;
    travelAllowance: z.ZodDefault<z.ZodNumber>;
    specialAllowance: z.ZodDefault<z.ZodNumber>;
    medicalAllowance: z.ZodDefault<z.ZodNumber>;
    providentFundEmployee: z.ZodDefault<z.ZodNumber>;
    professionalTax: z.ZodDefault<z.ZodNumber>;
    tdsTax: z.ZodDefault<z.ZodNumber>;
    otherDeductions: z.ZodDefault<z.ZodNumber>;
    overtimeHourlyRate: z.ZodDefault<z.ZodNumber>;
    effectiveFrom: z.ZodString;
    effectiveTo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    effectiveFrom: string;
    employeeId: string;
    calculationBasis: SalaryCalculationBasis;
    baseSalary: number;
    hra: number;
    travelAllowance: number;
    specialAllowance: number;
    medicalAllowance: number;
    providentFundEmployee: number;
    professionalTax: number;
    tdsTax: number;
    otherDeductions: number;
    overtimeHourlyRate: number;
    effectiveTo?: string | null | undefined;
}, {
    effectiveFrom: string;
    employeeId: string;
    baseSalary: number;
    effectiveTo?: string | null | undefined;
    calculationBasis?: SalaryCalculationBasis | undefined;
    hra?: number | undefined;
    travelAllowance?: number | undefined;
    specialAllowance?: number | undefined;
    medicalAllowance?: number | undefined;
    providentFundEmployee?: number | undefined;
    professionalTax?: number | undefined;
    tdsTax?: number | undefined;
    otherDeductions?: number | undefined;
    overtimeHourlyRate?: number | undefined;
}>;
export declare const CreateEmployeeAdvanceSchema: z.ZodObject<{
    employeeId: z.ZodString;
    amount: z.ZodNumber;
    monthlyInstallment: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    amount: number;
    employeeId: string;
    monthlyInstallment: number;
}, {
    reason: string;
    amount: number;
    employeeId: string;
    monthlyInstallment: number;
}>;
export declare const ApproveEmployeeAdvanceSchema: z.ZodObject<{
    status: z.ZodEnum<[EmployeeAdvanceStatus.APPROVED, EmployeeAdvanceStatus.REJECTED]>;
    disbursedAmount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: EmployeeAdvanceStatus.APPROVED | EmployeeAdvanceStatus.REJECTED;
    disbursedAmount?: number | undefined;
}, {
    status: EmployeeAdvanceStatus.APPROVED | EmployeeAdvanceStatus.REJECTED;
    disbursedAmount?: number | undefined;
}>;
export declare const InitiatePayrollRunSchema: z.ZodObject<{
    centerId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    year: z.ZodNumber;
    month: z.ZodNumber;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    year: number;
    month: number;
    centerId?: string | null | undefined;
    notes?: string | null | undefined;
}, {
    year: number;
    month: number;
    centerId?: string | null | undefined;
    notes?: string | null | undefined;
}>;
export declare const ApprovePayrollRunSchema: z.ZodObject<{
    action: z.ZodEnum<["APPROVE", "REJECT"]>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    action: "APPROVE" | "REJECT";
    notes?: string | null | undefined;
}, {
    action: "APPROVE" | "REJECT";
    notes?: string | null | undefined;
}>;
export declare const FinalizePayrollRunSchema: z.ZodObject<{
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    notes?: string | null | undefined;
}, {
    notes?: string | null | undefined;
}>;
export declare const RecordSalaryPaymentSchema: z.ZodObject<{
    payrollRunId: z.ZodString;
    payslipId: z.ZodString;
    employeeId: z.ZodString;
    amount: z.ZodNumber;
    paymentMethod: z.ZodDefault<z.ZodNativeEnum<typeof SalaryPaymentMethod>>;
    transactionId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankAccountMask: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bankIfsc: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    paymentMethod: SalaryPaymentMethod;
    employeeId: string;
    payrollRunId: string;
    payslipId: string;
    bankName?: string | null | undefined;
    notes?: string | null | undefined;
    bankIfsc?: string | null | undefined;
    transactionId?: string | null | undefined;
    bankAccountMask?: string | null | undefined;
}, {
    amount: number;
    employeeId: string;
    payrollRunId: string;
    payslipId: string;
    bankName?: string | null | undefined;
    notes?: string | null | undefined;
    paymentMethod?: SalaryPaymentMethod | undefined;
    bankIfsc?: string | null | undefined;
    transactionId?: string | null | undefined;
    bankAccountMask?: string | null | undefined;
}>;
export declare const NotificationChannelSchema: z.ZodNativeEnum<typeof NotificationChannel>;
export declare const NotificationEventTypeSchema: z.ZodNativeEnum<typeof NotificationEventType>;
export declare const NotificationStatusSchema: z.ZodNativeEnum<typeof NotificationStatus>;
export declare const CommunicationConsentTypeSchema: z.ZodNativeEnum<typeof CommunicationConsentType>;
export declare const DeviceTokenRegistrationSchema: z.ZodObject<{
    deviceId: z.ZodString;
    devicePlatform: z.ZodDefault<z.ZodEnum<["ANDROID", "IOS", "WEB"]>>;
    fcmToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
    devicePlatform: "ANDROID" | "IOS" | "WEB";
    fcmToken: string;
}, {
    deviceId: string;
    fcmToken: string;
    devicePlatform?: "ANDROID" | "IOS" | "WEB" | undefined;
}>;
export declare const DeviceTokenRefreshSchema: z.ZodObject<{
    deviceId: z.ZodString;
    fcmToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
    fcmToken: string;
}, {
    deviceId: string;
    fcmToken: string;
}>;
export declare const CommunicationPreferenceSchema: z.ZodObject<{
    whatsappOptIn: z.ZodDefault<z.ZodBoolean>;
    pushOptIn: z.ZodDefault<z.ZodBoolean>;
    smsOptIn: z.ZodDefault<z.ZodBoolean>;
    preferredLanguage: z.ZodDefault<z.ZodEnum<["mr", "en"]>>;
    optOutReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    whatsappOptIn: boolean;
    pushOptIn: boolean;
    smsOptIn: boolean;
    preferredLanguage: "mr" | "en";
    optOutReason?: string | null | undefined;
}, {
    whatsappOptIn?: boolean | undefined;
    pushOptIn?: boolean | undefined;
    smsOptIn?: boolean | undefined;
    preferredLanguage?: "mr" | "en" | undefined;
    optOutReason?: string | null | undefined;
}>;
export declare const ListCustomerNotificationsQuerySchema: z.ZodObject<{
    isRead: z.ZodOptional<z.ZodBoolean>;
    channel: z.ZodOptional<z.ZodNativeEnum<typeof NotificationChannel>>;
    eventType: z.ZodOptional<z.ZodNativeEnum<typeof NotificationEventType>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    isRead?: boolean | undefined;
    channel?: NotificationChannel | undefined;
    eventType?: NotificationEventType | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    isRead?: boolean | undefined;
    channel?: NotificationChannel | undefined;
    eventType?: NotificationEventType | undefined;
}>;
export declare const SendNotificationRequestSchema: z.ZodObject<{
    customerId: z.ZodString;
    eventType: z.ZodNativeEnum<typeof NotificationEventType>;
    eventId: z.ZodString;
    idempotencyKey: z.ZodString;
    channels: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof NotificationChannel>, "many">>;
    customTitle: z.ZodOptional<z.ZodString>;
    customBody: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    forceLanguage: z.ZodOptional<z.ZodEnum<["mr", "en"]>>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    idempotencyKey: string;
    eventType: NotificationEventType;
    eventId: string;
    channels?: NotificationChannel[] | undefined;
    customTitle?: string | undefined;
    customBody?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    forceLanguage?: "mr" | "en" | undefined;
}, {
    customerId: string;
    idempotencyKey: string;
    eventType: NotificationEventType;
    eventId: string;
    channels?: NotificationChannel[] | undefined;
    customTitle?: string | undefined;
    customBody?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    forceLanguage?: "mr" | "en" | undefined;
}>;
export declare const WhatsAppWebhookVerificationSchema: z.ZodObject<{
    'hub.mode': z.ZodString;
    'hub.challenge': z.ZodString;
    'hub.verify_token': z.ZodString;
}, "strip", z.ZodTypeAny, {
    'hub.mode': string;
    'hub.challenge': string;
    'hub.verify_token': string;
}, {
    'hub.mode': string;
    'hub.challenge': string;
    'hub.verify_token': string;
}>;
//# sourceMappingURL=index.d.ts.map