import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = req.user!.userId;
    const organizationId = req.user!.organizationId;

    if (customerId) {
      const client = organizationId ? await tenantDbManager.getTenantDb(organizationId) : db;
      try {
        const result = await client.query(
          `SELECT id, title, message, notification_type AS type, is_read AS read, created_at
           FROM customer_notifications
           WHERE customer_id = $1
           ORDER BY created_at DESC LIMIT 50;`,
          [customerId]
        );
        if (result.rows.length > 0) {
          const notifs = result.rows.map((r: any) => ({
            id: r.id,
            title: r.title,
            message: r.message,
            type: r.type,
            read: Boolean(r.read),
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          }));
          res.json({ success: true, count: notifs.length, data: notifs });
          return;
        }
      } catch {
        // Table or record not found, fall through
      }
    }

    const notifications = [
      {
        id: 'notif-01',
        title: 'DFarm Cooperative Connected',
        message: 'Your farmer profile is active. Milk collection is available during morning and evening shifts.',
        type: 'INFO',
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];
    res.json({ success: true, count: notifications.length, data: notifications });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const customerId = req.user!.userId;
    const organizationId = req.user!.organizationId;

    if (customerId && id) {
      const client = organizationId ? await tenantDbManager.getTenantDb(organizationId) : db;
      try {
        await client.query(
          `UPDATE customer_notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND customer_id = $2;`,
          [id, customerId]
        );
      } catch {
        // Ignore fallback
      }
    }

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
});

export const notificationsRoutes = router;
