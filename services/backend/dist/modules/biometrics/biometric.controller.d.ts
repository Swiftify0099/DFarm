import type { Request, Response, NextFunction } from 'express';
export declare class BiometricController {
    /**
     * POST /api/v1/customers/:customerId/face-enroll
     */
    static enrollFace(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * GET /api/v1/customers/:customerId/face-status
     */
    static getFaceStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * POST /api/v1/customers/:customerId/face-revoke
     */
    static revokeFace(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
    /**
     * GET /api/v1/identity/face-models
     */
    static listModels(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
}
//# sourceMappingURL=biometric.controller.d.ts.map