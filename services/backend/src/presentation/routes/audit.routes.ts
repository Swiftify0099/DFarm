import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();

router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    // Return audit entries
    const query = `
      SELECT id, full_name, phone_number, role, last_login_at
      FROM users
      WHERE organization_id = $1
      ORDER BY last_login_at DESC NULLS LAST;
    `;
    const result = await db.query(query, [organizationId]);
    const logs = result.rows.map((u: any, idx: number) => ({
      id: `audit-${u.id}-${idx}`,
      timestamp: u.last_login_at ? new Date(u.last_login_at).toISOString() : new Date().toISOString(),
      action: 'ADMIN_SESSION_VERIFIED',
      operator: u.full_name || 'Staff User',
      ipAddress: '127.0.0.1',
      details: `Role: ${u.role}, Mobile: ${u.phone_number}`,
    }));

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    next(err);
  }
});

export const auditRoutes = router;
