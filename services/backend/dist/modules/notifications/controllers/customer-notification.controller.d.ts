import { Request, Response, NextFunction } from 'express';
export declare class CustomerNotificationController {
    private static verifyCustomerAccess;
    /**
     * GET /api/v1/customers/:customerId/notifications
     * In-App notification inbox for mobile app.
     */
    static listNotifications(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * PATCH /api/v1/customers/:customerId/notifications/:notificationId/read
     * Mark a single notification as read.
     */
    static markAsRead(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * PATCH /api/v1/customers/:customerId/notifications/read-all
     * Mark all notifications as read for customer.
     */
    static markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * GET /api/v1/customers/:customerId/notifications/:notificationId/receipt
     * View transaction details or receipt attached to notification.
     */
    static getReceipt(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * GET /api/v1/customers/:customerId/communication-preferences
     */
    static getPreferences(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * PUT /api/v1/customers/:customerId/communication-preferences
     */
    static updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * POST /api/v1/customers/:customerId/devices/tokens
     * Register or update FCM device token.
     */
    static registerDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * PUT /api/v1/customers/:customerId/devices/tokens
     * Refresh FCM device token.
     */
    static refreshDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * DELETE /api/v1/customers/:customerId/devices/tokens/:deviceId
     * Deactivate device token upon logout.
     */
    static deactivateDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=customer-notification.controller.d.ts.map