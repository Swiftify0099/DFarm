import { Router } from 'express';
import { CustomerController } from './customer.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import {
  CreateCustomerInputSchema,
  UpdateCustomerInputSchema,
  CustomerQuerySchema,
  CustomerDeleteSchema,
  CustomerRestoreSchema,
  CustomerIdParamSchema,
} from './customer.schemas.js';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// 1. Create Customer
router.post(
  '/',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ body: CreateCustomerInputSchema }),
  CustomerController.create
);

// 2. List Customers (with pagination, search, status & center filtering)
router.get(
  '/',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.REGISTRATION_OFFICER,
    UserRole.ACCOUNTANT,
    UserRole.COLLECTION_OPERATOR,
  ]),
  validateRequest({ query: CustomerQuerySchema }),
  CustomerController.list
);

// Customer Mobile App (P18) Self-Service Endpoints
router.get(
  '/:customerId/dashboard',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.getDashboard
);

router.get(
  '/:customerId/notifications',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.getNotifications
);

router.patch(
  '/:customerId/notifications/:notificationId/read',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.markNotificationRead
);

router.post(
  '/:customerId/notifications/read-all',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.markAllNotificationsRead
);

router.patch(
  '/:customerId/notifications/read-all',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.markAllNotificationsRead
);

router.patch(
  '/:customerId/profile',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  CustomerController.updateProfileSelfService
);

// 3. Get Single Customer Profile
router.get(
  '/:customerId',
  validateRequest({ params: CustomerIdParamSchema }),
  CustomerController.getById
);

// 4. Update Customer Profile (Editable profile fields only)
router.patch(
  '/:customerId',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.REGISTRATION_OFFICER,
  ]),
  validateRequest({ params: CustomerIdParamSchema, body: UpdateCustomerInputSchema }),
  CustomerController.update
);

// 5. Soft Delete Customer (Owner/SuperAdmin/CenterManager/RegistrationOfficer, mandatory reason)
router.delete(
  '/:customerId',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.REGISTRATION_OFFICER]),
  validateRequest({ params: CustomerIdParamSchema, body: CustomerDeleteSchema }),
  CustomerController.softDelete
);

// 6. Restore Customer (Owner/SuperAdmin/CenterManager/RegistrationOfficer, mandatory reason)
router.post(
  '/:customerId/restore',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.REGISTRATION_OFFICER]),
  validateRequest({ params: CustomerIdParamSchema, body: CustomerRestoreSchema }),
  CustomerController.restore
);

export const customerRoutes = router;

