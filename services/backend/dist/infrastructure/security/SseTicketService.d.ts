import type { AuthenticatedUser } from '../../presentation/middleware/authenticate.js';
export interface SseTicketClaims {
    jti: string;
    userId: string;
    organizationId?: string;
    centerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
    fullName?: string;
    purpose: 'SSE_STREAM';
    aud: 'dairy-admin-sse';
    iat: number;
    exp: number;
}
export declare class SseTicketService {
    private static instance;
    private readonly secret;
    private consumedTickets;
    private cleanupInterval;
    private tableInitialized;
    private isDestroyed;
    private destroyPromise;
    private isPurgingTickets;
    private readonly inFlightBackgroundWork;
    constructor(secret?: string);
    private trackBackgroundWork;
    getInFlightBackgroundWorkCount(): number;
    static getInstance(): SseTicketService;
    ensureRedemptionTable(): Promise<void>;
    /**
     * Issues a short-lived (default 30s), purpose-specific SSE ticket.
     * Scoped strictly to the authenticated user, tenant, role, and SSE streaming purpose.
     */
    issueTicket(user: AuthenticatedUser, ttlSeconds?: number): string;
    /**
     * Verifies and immediately consumes an SSE ticket across multiple distributed backend instances.
     * Atomic shared redemption: Uses PostgreSQL sse_ticket_redemptions table with PRIMARY KEY (jti).
     * Two independent backend instances cannot accept the same ticket concurrently.
     * Restarting a backend node does NOT restore validity within its validity window.
     */
    verifyAndConsumeTicket(ticketStr: string): Promise<AuthenticatedUser>;
    private purgeExpiredTickets;
    destroy(): Promise<void>;
}
export declare const sseTicketService: SseTicketService;
//# sourceMappingURL=SseTicketService.d.ts.map