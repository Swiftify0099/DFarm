import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedUser {
    userId: string;
    organizationId?: string;
    centerId?: string;
    globalCustomerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
    fullName?: string;
    phoneNumber?: string;
    deviceId?: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
export declare function authenticate(req: Request, _res: Response, next: NextFunction): void;
export declare function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void;
/**
 * Dedicated authentication middleware for SSE streaming endpoints (/dairy-admin/events).
 * Rejects raw access tokens in URL query strings (400/401).
 * Accepts:
 *   Option A: Authorization: Bearer <JWT> header (streaming fetch)
 *   Option B: ?ticket=<short_lived_sse_ticket> query parameter (short-lived, single-use, purpose-scoped)
 */
export declare function authenticateSseStream(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=authenticate.d.ts.map