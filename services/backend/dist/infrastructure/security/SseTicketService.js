import crypto from 'node:crypto';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors/index.js';
import { db } from '../database/PostgresPool.js';
export class SseTicketService {
    static instance;
    secret;
    // Bounded map of consumed ticket JTIs with expiration timestamps as fast local cache
    consumedTickets = new Map();
    cleanupInterval = null;
    tableInitialized = false;
    constructor(secret) {
        this.secret =
            secret ||
                process.env['JWT_SECRET'] ||
                'super-secret-jwt-token-with-at-least-32-characters-long';
        // Ensure redemptions table exists in database
        this.ensureRedemptionTable().catch(() => { });
        // Periodically purge expired tickets from replay cache and database (every 60 seconds)
        this.cleanupInterval = setInterval(() => {
            this.purgeExpiredTickets().catch(() => { });
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
    async ensureRedemptionTable() {
        if (this.tableInitialized)
            return;
        try {
            await db.query(`
        CREATE TABLE IF NOT EXISTS sse_ticket_redemptions (
          jti VARCHAR(64) PRIMARY KEY,
          user_id UUID,
          organization_id UUID,
          expires_at TIMESTAMPTZ NOT NULL,
          redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sse_ticket_redemptions_exp ON sse_ticket_redemptions (expires_at);
      `);
            this.tableInitialized = true;
        }
        catch {
            // Non-fatal, table might already exist
        }
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
     * Verifies and immediately consumes an SSE ticket across multiple distributed backend instances.
     * Atomic shared redemption: Uses PostgreSQL sse_ticket_redemptions table with PRIMARY KEY (jti).
     * Two independent backend instances cannot accept the same ticket concurrently.
     * Restarting a backend node does NOT restore validity within its validity window.
     */
    async verifyAndConsumeTicket(ticketStr) {
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
        // 1. Local memory pre-check
        if (this.consumedTickets.has(payload.jti)) {
            throw new UnauthorizedError('SSE ticket has already been consumed (ticket reuse prevented)');
        }
        // 2. Distributed Atomic Redemption in PostgreSQL
        // Unique primary key constraint on jti guarantees single redemption across entire deployment
        try {
            await db.query(`INSERT INTO sse_ticket_redemptions (jti, user_id, organization_id, expires_at, redeemed_at)
         VALUES ($1, $2, $3, to_timestamp($4), NOW());`, [
                payload.jti,
                payload.userId || null,
                payload.organizationId || null,
                payload.exp,
            ]);
        }
        catch (err) {
            // Catch unique constraint violation (code 23505) or duplicate key
            const isDuplicate = err?.code === '23505' ||
                err?.message?.includes('duplicate key') ||
                err?.message?.includes('unique constraint') ||
                err?.message?.includes('PRIMARY KEY') ||
                err?.message?.includes('already exists');
            if (isDuplicate) {
                this.consumedTickets.set(payload.jti, payload.exp);
                throw new UnauthorizedError('SSE ticket has already been consumed (ticket reuse prevented)');
            }
            // If database error occurred (e.g. table not ready), attempt table creation once
            if (err?.message?.includes('does not exist')) {
                await this.ensureRedemptionTable();
                try {
                    await db.query(`INSERT INTO sse_ticket_redemptions (jti, user_id, organization_id, expires_at, redeemed_at)
             VALUES ($1, $2, $3, to_timestamp($4), NOW());`, [payload.jti, payload.userId || null, payload.organizationId || null, payload.exp]);
                }
                catch (retryErr) {
                    if (retryErr?.code === '23505' ||
                        retryErr?.message?.includes('duplicate key') ||
                        retryErr?.message?.includes('unique constraint')) {
                        this.consumedTickets.set(payload.jti, payload.exp);
                        throw new UnauthorizedError('SSE ticket has already been consumed (ticket reuse prevented)');
                    }
                    throw retryErr;
                }
            }
            else {
                throw err;
            }
        }
        // Mark as consumed in local fast cache
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
    async purgeExpiredTickets() {
        const now = Math.floor(Date.now() / 1000);
        for (const [jti, exp] of this.consumedTickets.entries()) {
            if (exp < now) {
                this.consumedTickets.delete(jti);
            }
        }
        try {
            await db.query(`DELETE FROM sse_ticket_redemptions WHERE expires_at < NOW();`);
        }
        catch {
            // Non-fatal cleanup notice
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