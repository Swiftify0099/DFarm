import crypto from 'node:crypto';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors/index.js';
export class SseTicketService {
    static instance;
    secret;
    // Bounded map of consumed ticket JTIs with expiration timestamps to prevent replay
    consumedTickets = new Map();
    cleanupInterval = null;
    constructor(secret) {
        this.secret =
            secret ||
                process.env['JWT_SECRET'] ||
                'super-secret-jwt-token-with-at-least-32-characters-long';
        // Periodically purge expired tickets from replay cache (every 60 seconds)
        this.cleanupInterval = setInterval(() => {
            this.purgeExpiredTickets();
        }, 60000);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }
    static getInstance() {
        if (!SseTicketService.instance) {
            SseTicketService.instance = new SseTicketService();
        }
        return SseTicketService.instance;
    }
    /**
     * Issues a short-lived (default 30s), purpose-specific SSE ticket.
     * Scoped strictly to the authenticated user, tenant, role, and SSE streaming purpose.
     */
    issueTicket(user, ttlSeconds = 30) {
        const now = Math.floor(Date.now() / 1000);
        const jti = crypto.randomUUID();
        const header = { alg: 'HS256', typ: 'SSE-TICKET' };
        const claims = {
            jti,
            userId: user.userId,
            organizationId: user.organizationId,
            centerId: user.centerId,
            role: user.role,
            actorType: user.actorType || 'STAFF',
            fullName: user.fullName,
            purpose: 'SSE_STREAM',
            aud: 'dairy-admin-sse',
            iat: now,
            exp: now + ttlSeconds,
        };
        const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
        const signature = crypto
            .createHmac('sha256', this.secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');
        return `${headerB64}.${payloadB64}.${signature}`;
    }
    /**
     * Verifies and immediately consumes an SSE ticket.
     * Single-use: if the ticket was already consumed, subsequent attempts are rejected.
     */
    verifyAndConsumeTicket(ticketStr) {
        if (!ticketStr || typeof ticketStr !== 'string') {
            throw new UnauthorizedError('SSE ticket is required');
        }
        const cleanTicket = ticketStr.trim();
        const parts = cleanTicket.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedError('Malformed SSE ticket structure');
        }
        const [headerB64, payloadB64, signature] = parts;
        if (!headerB64 || !payloadB64 || !signature) {
            throw new UnauthorizedError('Malformed SSE ticket structure');
        }
        // Timing-safe signature verification
        const expectedSignature = crypto
            .createHmac('sha256', this.secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');
        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            throw new UnauthorizedError('Invalid SSE ticket signature');
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        }
        catch {
            throw new UnauthorizedError('Invalid SSE ticket payload encoding');
        }
        const now = Math.floor(Date.now() / 1000);
        // Expiry check
        if (!payload.exp || payload.exp < now) {
            throw new UnauthorizedError('SSE ticket has expired');
        }
        // Purpose check
        if (payload.purpose !== 'SSE_STREAM') {
            throw new ForbiddenError('Invalid token purpose: not authorized for SSE stream');
        }
        // Audience check
        if (payload.aud !== 'dairy-admin-sse') {
            throw new ForbiddenError('Invalid token audience: not intended for dairy admin SSE');
        }
        // Single-use replay protection
        if (this.consumedTickets.has(payload.jti)) {
            throw new UnauthorizedError('SSE ticket has already been consumed (ticket reuse prevented)');
        }
        // Mark as consumed
        this.consumedTickets.set(payload.jti, payload.exp);
        return {
            userId: payload.userId,
            organizationId: payload.organizationId,
            centerId: payload.centerId,
            role: payload.role,
            actorType: payload.actorType,
            fullName: payload.fullName,
        };
    }
    purgeExpiredTickets() {
        const now = Math.floor(Date.now() / 1000);
        for (const [jti, exp] of this.consumedTickets.entries()) {
            if (exp < now) {
                this.consumedTickets.delete(jti);
            }
        }
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
export const sseTicketService = SseTicketService.getInstance();
//# sourceMappingURL=SseTicketService.js.map