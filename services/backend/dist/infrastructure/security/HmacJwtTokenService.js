import crypto from 'node:crypto';
import { UnauthorizedError } from '../../domain/errors/index.js';
export class HmacJwtTokenService {
    secret;
    constructor(secret) {
        const resolved = secret ||
            process.env['JWT_SECRET'] ||
            'super-secret-jwt-token-with-at-least-32-characters-long';
        if (process.env['NODE_ENV'] === 'production' &&
            (!secret && (!process.env['JWT_SECRET'] || resolved === 'super-secret-jwt-token-with-at-least-32-characters-long'))) {
            throw new Error('CRITICAL: Production JWT_SECRET must be explicitly configured.');
        }
        this.secret = resolved;
    }
    signToken(payload, expiresInSeconds = 86400) {
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'HS256', typ: 'JWT' };
        const claims = {
            ...payload,
            iat: now,
            exp: now + expiresInSeconds,
        };
        const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
        const signature = crypto
            .createHmac('sha256', this.secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');
        return `${headerB64}.${payloadB64}.${signature}`;
    }
    verifyToken(token) {
        if (!token) {
            throw new UnauthorizedError('Authentication token missing');
        }
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
        const parts = cleanToken.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedError('Malformed JWT token structure');
        }
        const headerB64 = parts[0];
        const payloadB64 = parts[1];
        const signature = parts[2];
        if (!headerB64 || !payloadB64 || !signature) {
            throw new UnauthorizedError('Malformed JWT token structure');
        }
        const expectedSignature = crypto
            .createHmac('sha256', this.secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');
        // Timing-safe signature check
        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            throw new UnauthorizedError('Invalid token signature');
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        }
        catch {
            throw new UnauthorizedError('Invalid token payload encoding');
        }
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            throw new UnauthorizedError('Token has expired');
        }
        if (!payload.userId || !payload.role || !payload.actorType) {
            throw new UnauthorizedError('Token is missing mandatory identity claims');
        }
        return {
            userId: payload.userId,
            organizationId: payload.organizationId,
            centerId: payload.centerId,
            globalCustomerId: payload.globalCustomerId,
            role: payload.role,
            actorType: payload.actorType,
            fullName: payload.fullName,
            phoneNumber: payload.phoneNumber,
            deviceId: payload.deviceId,
        };
    }
}
//# sourceMappingURL=HmacJwtTokenService.js.map