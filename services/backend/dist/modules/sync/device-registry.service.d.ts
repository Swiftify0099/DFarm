export interface DeviceAdminActor {
    userId: string;
    role: string;
    organizationId?: string;
    centerIds?: string[];
}
export declare class DeviceRegistryService {
    private static resolveAuthoritativeOrganizationId;
    private static resolveAuditUserId;
    static registerDevice(params: {
        actor: DeviceAdminActor;
        body: unknown;
        headerOrgId?: string;
    }): Promise<{
        deviceId: string;
        deviceIdentifier: string;
        organizationId: string;
        centerId: string;
        deviceType: "REGISTRATION_TABLET" | "COUNTER_TERMINAL" | "MOBILE_COLLECTOR";
        status: string;
        token: string;
        maxOfflineHours: number;
        offlinePolicyApproved: boolean;
        offlinePolicyStatus: string;
        registeredAt: string;
    }>;
    static revokeDevice(params: {
        actor: DeviceAdminActor;
        body: unknown;
        headerOrgId?: string;
    }): Promise<{
        deviceId: any;
        deviceIdentifier: any;
        organizationId: string;
        status: string;
        reason: string;
        revokedAt: any;
    }>;
}
//# sourceMappingURL=device-registry.service.d.ts.map