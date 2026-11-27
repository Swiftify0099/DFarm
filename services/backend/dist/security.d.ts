import { type JwtPayload } from './jwt.js';
export interface DeviceTokenInput {
    sub: string;
    organizationId: string;
    centerId: string;
    deviceIdentifier: string;
    deviceType?: string;
    jti?: string;
    expiresInSeconds?: number;
}
export interface VerifiedDeviceTokenClaims extends JwtPayload {
    sub: string;
    type: 'device';
    organizationId: string;
    centerId: string;
    deviceIdentifier: string;
    deviceType?: string;
    jti: string;
    iat: number;
    exp: number;
}
export declare function hashToken(token: string): string;
export declare function createDeviceToken(payload: DeviceTokenInput): {
    token: string;
    hashedToken: string;
};
export declare function generateDeviceToken(deviceIdOrInput: string | DeviceTokenInput, organizationId?: string, centerId?: string, deviceIdentifier?: string, expiresInSeconds?: number): {
    token: string;
    hashedToken: string;
};
export declare function verifyDeviceToken(token: string): VerifiedDeviceTokenClaims;
//# sourceMappingURL=security.d.ts.map