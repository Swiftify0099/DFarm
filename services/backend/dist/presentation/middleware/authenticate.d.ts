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
    tokenType?: 'access' | 'refresh';
    jti?: string;
    exp?: number;
    centerIds?: string[];
    registrationStatus?: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
export declare function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void>;
/**
 * Dedicated authentication middleware for SSE streaming endpoints (/dairy-admin/events).
 * Rejects raw access tokens in URL query strings (400/401).
 */
export declare function authenticateSseStream(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=authenticate.d.ts.map