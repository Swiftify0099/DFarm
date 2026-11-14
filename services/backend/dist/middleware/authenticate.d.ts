import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRole } from '@dfarm/shared-types';
export interface AuthContext {
    authUser: {
        id: string;
        email?: string;
        phone?: string;
        user_metadata?: Record<string, any>;
    };
    actorType: 'STAFF' | 'CUSTOMER';
    userId: string;
    organizationId: string;
    role: UserRole;
    centerIds: string[];
    primaryCenterId?: string;
    centerId?: string;
    customerProfile?: {
        customerId: string;
        farmerCode: string;
    };
    token: string;
    userSupabaseClient: SupabaseClient;
}
declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
            deviceId?: string;
        }
    }
}
export declare function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function authenticateDevice(req: Request, _res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=authenticate.d.ts.map