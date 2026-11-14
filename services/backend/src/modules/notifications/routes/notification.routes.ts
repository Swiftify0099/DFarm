import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireRole } from '../../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';
import { NotificationController } from '../controllers/notification.controller.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// Enqueue notification outbox event (Staff & Admin)
notificationRouter.post(
  '/enqueue',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  NotificationController.enqueueNotification
);

// Trigger retry worker (Admin & Owner)
notificationRouter.post(
  '/retry-pending',
  requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  NotificationController.processRetries
);

// List notification templates
notificationRouter.get(
  '/templates',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  NotificationController.listTemplates
);

// Preview rendered notification template
notificationRouter.post(
  '/preview',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  NotificationController.renderPreview
);
