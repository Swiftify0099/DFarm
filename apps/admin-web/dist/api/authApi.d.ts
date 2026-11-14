export interface StaffUser {
    id: string;
    organizationId: string;
    role: string;
    primaryCenterId?: string | null;
    fullName: string;
    username: string;
    email?: string | null;
    phoneNumber?: string;
}
export interface LoginResponse {
    token: string;
    user: StaffUser;
}
export interface MeResponse {
    authUserId: string;
    internalId: string;
    actorType: 'STAFF' | 'CUSTOMER';
    role: string;
    organizationId: string;
    authorizedCenterIds: string[];
    primaryCenterId?: string;
    accountStatus: string;
}
export declare const authApi: {
    login: (username: string) => Promise<LoginResponse>;
    getMe: () => Promise<MeResponse>;
    getCenters: () => Promise<{
        id: string;
        code: string;
        name: string;
    }[]>;
    sendOtp: (phone: string) => Promise<{
        message: string;
        phone: string;
    }>;
    verifyOtp: (phone: string, token: string) => Promise<any>;
};
//# sourceMappingURL=authApi.d.ts.map