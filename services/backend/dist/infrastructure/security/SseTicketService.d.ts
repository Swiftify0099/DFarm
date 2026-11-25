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
    constructor(secret?: string);
    static getInstance(): SseTicketService;
    /**
     * Issues a short-lived (default 30s), purpose-specific SSE ticket.
     * Scoped strictly to the authenticated user, tenant, role, and SSE streaming purpose.
     */
    issueTicket(user: AuthenticatedUser, ttlSeconds?: number): string;
    /**
     * Verifies and immediately consumes an SSE ticket.
     * Single-use: if the ticket was already consumed, subsequent attempts are rejected.
     */
    verifyAndConsumeTicket(ticketStr: string): AuthenticatedUser;
    private purgeExpiredTickets;
    destroy(): void;
}
export declare const sseTicketService: SseTicketService;
//# sourceMappingURL=SseTicketService.d.ts.map