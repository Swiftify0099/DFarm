import { Request, Response, NextFunction } from 'express';
export declare function authorizeRoles(...allowedRoles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function authorizeActor(actorType: 'STAFF' | 'CUSTOMER'): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=authorize.d.ts.map