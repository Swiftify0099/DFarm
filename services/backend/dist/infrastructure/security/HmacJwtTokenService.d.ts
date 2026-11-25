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
    };
}
//# sourceMappingURL=HmacJwtTokenService.d.ts.map