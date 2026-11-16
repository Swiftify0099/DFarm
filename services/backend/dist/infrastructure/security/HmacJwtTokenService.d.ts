import { ITokenService } from '../../application/ports/index.js';
export interface TokenClaims {
    userId: string;
    organizationId?: string;
    centerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
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
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
    }, expiresInSeconds?: number): string;
    verifyToken(token: string): {
        userId: string;
        organizationId?: string;
        centerId?: string;
        role: string;
        actorType: 'STAFF' | 'CUSTOMER';
    };
}
//# sourceMappingURL=HmacJwtTokenService.d.ts.map