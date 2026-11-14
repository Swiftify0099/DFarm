export interface JwtPayload {
    sub: string;
    email?: string;
    phone?: string;
    role?: string;
    exp?: number;
    iat?: number;
    [key: string]: unknown;
}
export declare function signJwt(payload: JwtPayload, expiresInSeconds?: number): string;
export declare function verifyJwt(token: string): JwtPayload;
//# sourceMappingURL=jwt.d.ts.map