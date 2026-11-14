import { Router } from 'express';
import { RfidController } from './rfid.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import {
  RfidAssignInputSchema,
  RfidReplaceInputSchema,
  RfidRevokeInputSchema,
  RfidBlockInputSchema,
} from '@dfarm/shared-validation';
import { z } from 'zod';

const CustomerIdParamSchema = z.object({
  customerId: z.string().uuid('Customer ID must be a valid UUID'),
});

const CardIdParamSchema = z.object({
  cardId: z.string().uuid('Card ID must be a valid UUID'),
});

// 1. Router mounted on /api/v1/customers/:customerId/...
export const customerRfidRouter = Router({ mergeParams: true });
customerRfidRouter.use(authenticate);

customerRfidRouter.post(
  '/:customerId/rfid-assign',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ params: CustomerIdParamSchema, body: RfidAssignInputSchema }),
  RfidController.assign
);

customerRfidRouter.post(
  '/:customerId/rfid-replace',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ params: CustomerIdParamSchema, body: RfidReplaceInputSchema }),
  RfidController.replace
);

customerRfidRouter.get(
  '/:customerId/rfid-status',
  validateRequest({ params: CustomerIdParamSchema }),
  RfidController.getStatus
);

// 2. Router mounted on /api/v1/rfid/...
export const rfidRouter = Router();
rfidRouter.use(authenticate);

rfidRouter.post(
  '/:cardId/revoke',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ params: CardIdParamSchema, body: RfidRevokeInputSchema }),
  RfidController.revoke
);

rfidRouter.post(
  '/:cardId/block',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ params: CardIdParamSchema, body: RfidBlockInputSchema }),
  RfidController.block
);

