import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../../shared/response/api-response.js';
import { NotificationService } from '../services/notification.service.js';
import { TemplateEngine } from '../templates/template.engine.js';
import { SendNotificationRequestSchema } from '@dfarm/shared-validation';
import { query } from '../../../db.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export class NotificationController {
  /**
   * Dispatches a notification through the durable outbox.
   */
  public static async enqueueNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const validated = SendNotificationRequestSchema.parse(req.body);

      const records = await NotificationService.enqueueNotification({
        organizationId: req.auth.organizationId,
        centerId: req.auth.centerId,
        ...validated,
      });

      ApiResponse.created(res, records);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Manually trigger the notification retry worker.
   */
  public static async processRetries(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await NotificationService.processRetries();
      ApiResponse.success(res, stats);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists active notification templates.
   */
  public static async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const dbRes = await query(
        `SELECT * FROM notification_templates
         WHERE organization_id = $1 OR organization_id IS NULL
         ORDER BY template_code ASC, language ASC;`,
        [req.auth.organizationId]
      );
      ApiResponse.success(res, dbRes.rows);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Previews a rendered template without sending.
   */
  public static async renderPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { eventType, channel, language, variables } = req.body;
      const preview = await TemplateEngine.render(
        eventType,
        channel,
        language || 'mr',
        variables || {},
        req.auth?.organizationId
      );
      ApiResponse.success(res, preview);
    } catch (err) {
      next(err);
    }
  }
}
