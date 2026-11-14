import { Request, Response, NextFunction } from 'express';
export declare class NotificationController {
    /**
     * Dispatches a notification through the durable outbox.
     */
    static enqueueNotification(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * Manually trigger the notification retry worker.
     */
    static processRetries(_req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * Lists active notification templates.
     */
    static listTemplates(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * Previews a rendered template without sending.
     */
    static renderPreview(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=notification.controller.d.ts.map