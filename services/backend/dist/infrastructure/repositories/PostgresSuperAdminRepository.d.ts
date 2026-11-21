export interface PlatformAuditLogParams {
    actorId: string;
    actorRole: string;
    actorName?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    ipAddress?: string;
    status?: string;
}
export interface RegisterHardwareDeviceParams {
    serialNumber: string;
    deviceCategory: string;
    manufacturer: string;
    model: string;
    warrantyUntil?: string;
    notes?: string;
}
export interface CreateAmcPlanParams {
    name: string;
    durationMonths: number;
    priceInr: number;
    description?: string;
}
export interface CreateAmcSubscriptionParams {
    dairyId: string;
    planId: string;
    startDate?: string;
}
export interface SaveDairyBankDetailsParams {
    organizationId: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
}
export declare class PostgresSuperAdminRepository {
    getDashboardMetrics(): Promise<{
        totalDairies: number;
        activeDairies: number;
        suspendedDairies: number;
        pendingOnboardingDairies: number;
        totalPrimaryAdmins: number;
        adminsAwaitingActivation: number;
        totalRegisteredHardwareUnits: number;
        allocatedHardwareUnits: number;
        unallocatedHardwareUnits: number;
        activeAmcSubscriptions: number;
        expiringAmcSubscriptions: number;
        expiredAmcSubscriptions: number;
        globalRatePoliciesCount: number;
        globalFatSnfPoliciesCount: number;
        publishedRateVersionsCount: number;
        publishedFatSnfVersionsCount: number;
        activeSupportSessionsCount: number;
        platformSyncHealthStatus: 'healthy' | 'degraded' | 'failing';
        openAlertsCount: number;
        criticalAlertsCount: number;
    }>;
    getGlobalAnalytics(): Promise<{
        monthlyOnboardingTrend: Array<{
            month: string;
            newDairies: number;
            activatedDairies: number;
        }>;
        geographicDistribution: Array<{
            state: string;
            count: number;
            activeCount: number;
        }>;
        syncLatencyTrend: Array<{
            time: string;
            averageLatencyMs: number;
            healthyNodesPct: number;
        }>;
    }>;
    logAudit(params: PlatformAuditLogParams): Promise<void>;
    getAuditLogs(params?: {
        action?: string;
        entityType?: string;
        limit?: number;
        offset?: number;
    }): Promise<any[]>;
    registerHardware(params: RegisterHardwareDeviceParams, actorId?: string): Promise<any>;
    listHardware(params?: {
        status?: string;
        category?: string;
        dairyId?: string;
    }): Promise<any[]>;
    assignHardware(deviceId: string, dairyId: string, actorId?: string, notes?: string): Promise<any>;
    unassignHardware(deviceId: string, actorId?: string, notes?: string): Promise<any>;
    updateHardwareStatus(deviceId: string, status: string, actorId?: string, notes?: string): Promise<any>;
    listAmcPlans(): Promise<any[]>;
    createAmcPlan(params: CreateAmcPlanParams, actorId?: string): Promise<any>;
    listAmcSubscriptions(dairyId?: string): Promise<any[]>;
    createAmcSubscription(params: CreateAmcSubscriptionParams, actorId?: string): Promise<any>;
    verifyAmcPayment(subscriptionId: string, razorpayPaymentId: string, razorpaySignature: string, actorId?: string): Promise<any>;
    listAlerts(params?: {
        status?: string;
        severity?: string;
    }): Promise<any[]>;
    acknowledgeAlert(alertId: string, actorId?: string): Promise<any>;
    resolveAlert(alertId: string, actorId?: string): Promise<any>;
    saveDairyBankDetails(params: SaveDairyBankDetailsParams, actorId?: string): Promise<any>;
    getDairyBankDetails(organizationId: string): Promise<any | null>;
    getAllDairyAdmins(params?: {
        search?: string;
        status?: string;
        dairyId?: string;
    }): Promise<any[]>;
    getSystemHealth(): Promise<any>;
    getPlatformUsers(): Promise<any[]>;
    createPlatformUser(params: {
        fullName: string;
        email: string;
        mobile: string;
        role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR';
    }, actorId?: string): Promise<any>;
    generateReport(filter: {
        reportType: string;
        startDate: string;
        endDate: string;
        dairyId?: string;
        statusFilter?: string;
    }, actorName?: string): Promise<any>;
    private activeSupportSessions;
    requestSupportSession(params: {
        dairyId: string;
        justificationReason: string;
        supportTicketRef?: string;
        durationMinutes: number;
        authorizedScope: string;
    }, actor: {
        userId?: string;
        fullName?: string;
        mobile?: string;
    }): Promise<any>;
    getActiveSupportSession(): Promise<any | null>;
    getAllSupportSessions(): Promise<any[]>;
    revokeSupportSession(sessionId: string, reason: string, actorId?: string, actorName?: string): Promise<any>;
    private inMemoryRatePolicies;
    private inMemoryRateVersions;
    listGlobalRatePolicies(): Promise<any[]>;
    createGlobalRatePolicy(params: {
        policyCode: string;
        name: string;
        description?: string;
        policyType?: string;
    }, actorId?: string): Promise<any>;
    createGlobalRatePolicyVersion(policyId: string, params: {
        effectiveFrom: string;
        effectiveTo?: string;
        parameters: any;
        changeSummary?: string;
    }, actor?: {
        userId?: string;
        fullName?: string;
    }): Promise<any>;
    publishGlobalRatePolicyVersion(versionId: string, actor: {
        userId?: string;
        fullName?: string;
    }): Promise<any>;
    private inMemoryFatSnfPolicies;
    private inMemoryFatSnfVersions;
    listGlobalFatSnfPolicies(): Promise<any[]>;
    createGlobalFatSnfPolicy(params: {
        policyCode: string;
        name: string;
        description?: string;
    }, actorId?: string): Promise<any>;
    createGlobalFatSnfPolicyVersion(policyId: string, params: {
        effectiveFrom: string;
        effectiveTo?: string;
        milkCategory?: string;
        fatAdjustmentRules?: any[];
        snfAdjustmentRules?: any[];
        roundingPolicy?: string;
        changeSummary?: string;
    }, actor?: {
        userId?: string;
        fullName?: string;
    }): Promise<any>;
    publishGlobalFatSnfPolicyVersion(versionId: string, actor: {
        userId?: string;
        fullName?: string;
    }): Promise<any>;
    getPlatformSettings(): Promise<any>;
}
export declare const superAdminRepo: PostgresSuperAdminRepository;
//# sourceMappingURL=PostgresSuperAdminRepository.d.ts.map