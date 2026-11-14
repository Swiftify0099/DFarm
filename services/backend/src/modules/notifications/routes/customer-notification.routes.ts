import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { CustomerNotificationController } from '../controllers/customer-notification.controller.js';

export const customerNotificationRouter = Router();

customerNotificationRouter.use(authenticate);

// 1. In-App Notification Inbox
customerNotificationRouter.get(
  '/:customerId/notifications',
  CustomerNotificationController.listNotifications
);

customerNotificationRouter.patch(
  '/:customerId/notifications/read-all',
  CustomerNotificationController.markAllAsRead
);

customerNotificationRouter.patch(
  '/:customerId/notifications/:notificationId/read',
  CustomerNotificationController.markAsRead
);

customerNotificationRouter.get(
  '/:customerId/notifications/:notificationId/receipt',
  CustomerNotificationController.getReceipt
);

// 2. Communication Preferences
customerNotificationRouter.get(
  '/:customerId/communication-preferences',
  CustomerNotificationController.getPreferences
);

customerNotificationRouter.put(
  '/:customerId/communication-preferences',
  CustomerNotificationController.updatePreferences
);

// 3. Device Tokens (FCM)
customerNotificationRouter.post(
  '/:customerId/devices/tokens',
  CustomerNotificationController.registerDeviceToken
);

customerNotificationRouter.put(
  '/:customerId/devices/tokens',
  CustomerNotificationController.refreshDeviceToken
);

customerNotificationRouter.delete(
  '/:customerId/devices/tokens/:deviceId',
  CustomerNotificationController.deactivateDeviceToken
);
