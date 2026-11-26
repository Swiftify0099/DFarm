import { ITokenService } from '../../application/ports/index.js';
export interface TokenClaims {
    userId: string;
    organizationId?: string;
    centerId?: string;
    globalCustomerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
    fullName?: string;
    phoneNumber?: string;
    deviceId?: string;
    tokenType?: 'access' | 'refresh';
    jti?: string;
    iss?: string;
    aud?: string;
    iat?: number;
    exp?: number;
}
export declare class HmacJwtTokenService implements ITokenService {
    private readonly secret;
    constructor(secret?: string);
    signToken(payload: {
        userId: string;
        organizationId?: string;
        centerId?: string;
        globalCustomerId?: string;
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
        fullName?: string;
        phoneNumber?: string;
        deviceId?: string;
        tokenType?: 'access' | 'refresh';
        jti?: string;
    }, expiresInSeconds?: number): string;
    verifyToken(token: string): {
        userId: string;
        organizationId?: string;
        centerId?: string;
        globalCustomerId?: string;
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
        fullName?: string;
        phoneNumber?: string;
        deviceId?: string;
        tokenType?: 'access' | 'refresh';
        jti?: string;
        exp?: number;
    };
}
//# sourceMappingURL=HmacJwtTokenService.d.ts.map