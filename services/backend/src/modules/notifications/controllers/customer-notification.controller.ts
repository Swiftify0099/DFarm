import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../../shared/response/api-response.js';
import { NotificationService } from '../services/notification.service.js';
import { DeviceTokenService } from '../services/device-token.service.js';
import { ConsentService } from '../services/consent.service.js';
import {
  DeviceTokenRegistrationSchema,
  DeviceTokenRefreshSchema,
  CommunicationPreferenceSchema,
  ListCustomerNotificationsQuerySchema,
} from '@dfarm/shared-validation';
import { UserRole } from '@dfarm/shared-types';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/app-error.js';

export class CustomerNotificationController {
  private static verifyCustomerAccess(req: Request, customerId: string): void {
    if (!req.auth) throw new UnauthorizedError();
    const currentCustomerId = req.auth.customerProfile?.customerId || req.auth.userId;
    if (
      (req.auth.actorType === 'CUSTOMER' ||
        req.auth.role === UserRole.FARMER_CUSTOMER ||
        (req.auth.role as string) === 'CUSTOMER') &&
      currentCustomerId !== customerId
    ) {
      throw new ForbiddenError(
        'Customers may only access their own notifications and preferences',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }
  }

  /**
   * GET /api/v1/customers/:customerId/notifications
   * In-App notification inbox for mobile app.
   */
  public static async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const queryParams = ListCustomerNotificationsQuerySchema.parse(req.query);
      const result = await NotificationService.getCustomerInbox(
        customerId,
        req.auth!.organizationId,
        queryParams
      );

      ApiResponse.success(res, result.notifications, 200, {
        unreadCount: result.unreadCount,
        page: result.page,
        limit: result.limit,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/customers/:customerId/notifications/:notificationId/read
   * Mark a single notification as read.
   */
  public static async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      const notificationId = req.params['notificationId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const updated = await NotificationService.markAsRead(notificationId, customerId);
      ApiResponse.success(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/customers/:customerId/notifications/read-all
   * Mark all notifications as read for customer.
   */
  public static async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const count = await NotificationService.markAllAsRead(customerId, req.auth!.organizationId);
      ApiResponse.success(res, { markedReadCount: count });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/customers/:customerId/notifications/:notificationId/receipt
   * View transaction details or receipt attached to notification.
   */
  public static async getReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      const notificationId = req.params['notificationId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const receipt = await NotificationService.getNotificationReceipt(notificationId, customerId);
      ApiResponse.success(res, receipt);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/customers/:customerId/communication-preferences
   */
  public static async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const prefs = await ConsentService.getCustomerPreferences(customerId, req.auth!.organizationId);
      ApiResponse.success(res, prefs);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/customers/:customerId/communication-preferences
   */
  public static async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const validated = CommunicationPreferenceSchema.parse(req.body);
      const updated = await ConsentService.updateCustomerPreferences(
        customerId,
        req.auth!.organizationId,
        validated
      );
      ApiResponse.success(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/customers/:customerId/devices/tokens
   * Register or update FCM device token.
   */
  public static async registerDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const validated = DeviceTokenRegistrationSchema.parse(req.body);
      const tokenRecord = await DeviceTokenService.registerToken(customerId, validated);
      ApiResponse.created(res, tokenRecord);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/customers/:customerId/devices/tokens
   * Refresh FCM device token.
   */
  public static async refreshDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      const validated = DeviceTokenRefreshSchema.parse(req.body);
      const tokenRecord = await DeviceTokenService.refreshToken(
        customerId,
        validated.deviceId,
        validated.fcmToken
      );
      ApiResponse.success(res, tokenRecord);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/customers/:customerId/devices/tokens/:deviceId
   * Deactivate device token upon logout.
   */
  public static async deactivateDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params['customerId'] as string;
      const deviceId = req.params['deviceId'] as string;
      CustomerNotificationController.verifyCustomerAccess(req, customerId);

      await DeviceTokenService.deactivateToken(customerId, deviceId, 'USER_LOGOUT');
      ApiResponse.success(res, { deactivated: true, deviceId });
    } catch (err) {
      next(err);
    }
  }
}
