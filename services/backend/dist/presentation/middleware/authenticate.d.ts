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
//# sourceMappingURL=authenticate.d.ts.map