import { ApiResponse } from '../../../shared/response/api-response.js';
import { NotificationService } from '../services/notification.service.js';
import { DeviceTokenService } from '../services/device-token.service.js';
import { ConsentService } from '../services/consent.service.js';
import { DeviceTokenRegistrationSchema, DeviceTokenRefreshSchema, CommunicationPreferenceSchema, ListCustomerNotificationsQuerySchema, } from '@dfarm/shared-validation';
import { UserRole } from '@dfarm/shared-types';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/app-error.js';
export class CustomerNotificationController {
    static verifyCustomerAccess(req, customerId) {
        if (!req.auth)
            throw new UnauthorizedError();
        const currentCustomerId = req.auth.customerProfile?.customerId || req.auth.userId;
        if ((req.auth.actorType === 'CUSTOMER' ||
            req.auth.role === UserRole.FARMER_CUSTOMER ||
            req.auth.role === 'CUSTOMER') &&
            currentCustomerId !== customerId) {
            throw new ForbiddenError('Customers may only access their own notifications and preferences', 'CUSTOMER_ISOLATION_VIOLATION');
        }
    }
    /**
     * GET /api/v1/customers/:customerId/notifications
     * In-App notification inbox for mobile app.
     */
    static async listNotifications(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const queryParams = ListCustomerNotificationsQuerySchema.parse(req.query);
            const result = await NotificationService.getCustomerInbox(customerId, req.auth.organizationId, queryParams);
            ApiResponse.success(res, result.notifications, 200, {
                unreadCount: result.unreadCount,
                page: result.page,
                limit: result.limit,
            });
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * PATCH /api/v1/customers/:customerId/notifications/:notificationId/read
     * Mark a single notification as read.
     */
    static async markAsRead(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            const notificationId = req.params['notificationId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const updated = await NotificationService.markAsRead(notificationId, customerId);
            ApiResponse.success(res, updated);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * PATCH /api/v1/customers/:customerId/notifications/read-all
     * Mark all notifications as read for customer.
     */
    static async markAllAsRead(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const count = await NotificationService.markAllAsRead(customerId, req.auth.organizationId);
            ApiResponse.success(res, { markedReadCount: count });
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/customers/:customerId/notifications/:notificationId/receipt
     * View transaction details or receipt attached to notification.
     */
    static async getReceipt(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            const notificationId = req.params['notificationId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const receipt = await NotificationService.getNotificationReceipt(notificationId, customerId);
            ApiResponse.success(res, receipt);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/customers/:customerId/communication-preferences
     */
    static async getPreferences(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const prefs = await ConsentService.getCustomerPreferences(customerId, req.auth.organizationId);
            ApiResponse.success(res, prefs);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * PUT /api/v1/customers/:customerId/communication-preferences
     */
    static async updatePreferences(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const validated = CommunicationPreferenceSchema.parse(req.body);
            const updated = await ConsentService.updateCustomerPreferences(customerId, req.auth.organizationId, validated);
            ApiResponse.success(res, updated);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * POST /api/v1/customers/:customerId/devices/tokens
     * Register or update FCM device token.
     */
    static async registerDeviceToken(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const validated = DeviceTokenRegistrationSchema.parse(req.body);
            const tokenRecord = await DeviceTokenService.registerToken(customerId, validated);
            ApiResponse.created(res, tokenRecord);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * PUT /api/v1/customers/:customerId/devices/tokens
     * Refresh FCM device token.
     */
    static async refreshDeviceToken(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            const validated = DeviceTokenRefreshSchema.parse(req.body);
            const tokenRecord = await DeviceTokenService.refreshToken(customerId, validated.deviceId, validated.fcmToken);
            ApiResponse.success(res, tokenRecord);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * DELETE /api/v1/customers/:customerId/devices/tokens/:deviceId
     * Deactivate device token upon logout.
     */
    static async deactivateDeviceToken(req, res, next) {
        try {
            const customerId = req.params['customerId'];
            const deviceId = req.params['deviceId'];
            CustomerNotificationController.verifyCustomerAccess(req, customerId);
            await DeviceTokenService.deactivateToken(customerId, deviceId, 'USER_LOGOUT');
            ApiResponse.success(res, { deactivated: true, deviceId });
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=customer-notification.controller.js.map