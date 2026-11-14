import { type JwtPayload } from './jwt.js';
export declare function hashToken(token: string): string;
export declare function generateDeviceToken(deviceId: string, expiresInSeconds?: number): {
    token: string;
    hashedToken: string;
};
export declare function createDeviceToken(payload?: any): {
    token: string;
    hashedToken: string;
};
export declare function verifyDeviceToken(token: string): JwtPayload;
//# sourceMappingURL=security.d.ts.map