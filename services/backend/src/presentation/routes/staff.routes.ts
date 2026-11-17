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

    const query = `
      SELECT id, full_name, phone_number, role, status, created_at, last_login_at
      FROM users
      WHERE organization_id = $1
      ORDER BY full_name ASC;
    `;
    const result = await db.query(query, [organizationId]);
    const staff = result.rows.map((u: any) => ({
      id: u.id,
      fullName: u.full_name,
      mobileNumber: u.phone_number,
      role: u.role,
      status: u.status,
      joinedAt: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : undefined,
    }));

    res.json({ success: true, count: staff.length, data: staff });
  } catch (err) {
    next(err);
  }
});

export const staffRoutes = router;
