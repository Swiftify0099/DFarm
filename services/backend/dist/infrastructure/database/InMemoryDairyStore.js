// Central in-memory registry store for dairies, admins, and invitations
export const inMemoryDairies = new Map();
export const inMemoryAdmins = new Map();
export const inMemoryInvitationsByHash = new Map();
export const inMemoryInvitationsById = new Map();
// Seed authoritative Warna Milk's registry record (DF-SAN-2395)
const WARNA_DAIRY_ID = '38918630-4fee-4cec-96ea-a3a899aae7bc';
const WARNA_DAIRY_CODE = 'DF-SAN-2395';
const WARNA_DAIRY_NAME = "Warna Milk's";
const defaultWarnaRecord = {
    id: WARNA_DAIRY_ID,
    code: WARNA_DAIRY_CODE,
    name: WARNA_DAIRY_NAME,
    status: 'active',
    databaseName: 'dfarm_tenant_df_san_2395_389186304fee',
    provisioningStatus: 'FAILED',
    provisioningError: 'CRITICAL: Tenant database provisioning failed for DF-SAN-2395: connect ECONNREFUSED 127.0.0.1:54322',
    primaryAdminId: '37b8de06-0023-4935-b1bb-3d7152065e6e',
    primaryAdminName: 'popat yewale',
    primaryAdminMobile: '9834388787',
    location: {
        addressLine1: 'Kavathe Piran',
        villageLocality: 'Kavathe Piran',
        district: 'sangli',
        state: 'Maharashtra',
        pincode: '416417',
        latitude: 16.8524,
        longitude: 74.5815,
        formattedAddress: 'Kavathe Piran, Sangli, Maharashtra 416417',
    },
    contact: {
        businessPhone: '9834388787',
        businessEmail: 'pankajye5656@gmail.com',
    },
    operationalReadiness: {
        businessProfileComplete: true,
        primaryAdminActivated: true,
        hardwareSynced: false,
        collectionStaffTrained: false,
        readinessScore: 75,
    },
    deviceSummary: {
        registeredDevicesCount: 2,
        onlineDevicesCount: 2,
        firmwareVersionsSummary: 'v1.4.2-stable',
    },
    syncHealth: {
        status: 'healthy',
        lastSyncAt: new Date().toISOString(),
        pendingSyncEventsCount: 0,
        averageLatencyMs: 45,
        errorCountLast24h: 0,
    },
    configuration: {
        timezone: 'Asia/Kolkata',
        locale: 'en-IN',
        allowSelfRegistration: true,
        offlineSyncGracePeriodHours: 48,
        featureFlags: {
            automaticFatTestingIntegration: true,
            smsAlertsEnabled: true,
            chillingCenterSync: false,
        },
    },
    createdAt: '2026-11-19T09:16:17.348Z',
    updatedAt: new Date().toISOString(),
};
inMemoryDairies.set(WARNA_DAIRY_ID, defaultWarnaRecord);
export function getInMemoryDairyById(id) {
    return inMemoryDairies.get(id);
}
export function getInMemoryDairyByPhone(phone) {
    const clean = phone.replace(/\D/g, '').slice(-10);
    for (const d of inMemoryDairies.values()) {
        const biz = (d.contact?.businessPhone || '').replace(/\D/g, '').slice(-10);
        const adm = (d.primaryAdminMobile || '').replace(/\D/g, '').slice(-10);
        if (biz === clean || adm === clean) {
            return d;
        }
    }
    return undefined;
}
export function getAllInMemoryDairies() {
    return Array.from(inMemoryDairies.values());
}
//# sourceMappingURL=InMemoryDairyStore.js.map