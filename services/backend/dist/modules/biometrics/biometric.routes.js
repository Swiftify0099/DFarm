// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRICS REST API ROUTER
// ==============================================================================
import { Router } from 'express';
import { BiometricController } from './biometric.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import { FaceEnrollmentInputSchema, FaceRevocationInputSchema, } from '@dfarm/shared-validation';
import { z } from 'zod';
const CustomerIdParamSchema = z.object({
    customerId: z.string().uuid('Valid customer UUID parameter is required'),
});
// Router for customer-specific biometric actions (/api/v1/customers/:customerId/...)
export const customerBiometricRouter = Router({ mergeParams: true });
customerBiometricRouter.use(authenticate);
// 1. Face Enrollment
customerBiometricRouter.post('/:customerId/face-enroll', requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
]), validateRequest({
    params: CustomerIdParamSchema,
    body: FaceEnrollmentInputSchema,
}), BiometricController.enrollFace);
// 2. Face Enrollment Status (Ordinary profile endpoints must never return templates)
customerBiometricRouter.get('/:customerId/face-status', validateRequest({
    params: CustomerIdParamSchema,
}), BiometricController.getFaceStatus);
// 3. Face Revocation / Erasure
customerBiometricRouter.post('/:customerId/face-revoke', requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
]), validateRequest({
    params: CustomerIdParamSchema,
    body: FaceRevocationInputSchema,
}), BiometricController.revokeFace);
// Router for global identity endpoints (/api/v1/identity/...)
export const identityBiometricRouter = Router();
identityBiometricRouter.use(authenticate);
// List active face models and calibration thresholds
identityBiometricRouter.get('/face-models', BiometricController.listModels);
//# sourceMappingURL=biometric.routes.js.map