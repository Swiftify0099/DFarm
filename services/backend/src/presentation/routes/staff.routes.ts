import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate, authenticate } from '../middleware/authenticate.js';
import { PhoneNumber } from '../../domain/value-objects/index.js';
import { logger } from '../../shared/logger/index.js';

const router = Router();

const ROLE_PERMISSIONS: Record<string, string[]> = {
  PRIMARY_DAIRY_ADMIN: [
    'customers:approve',
    'customers:manage',
    'rate_charts:manage',
    'billing:manage',
    'staff:manage',
    'reports:view',
    'sessions:view',
    'collections:view',
  ],
  DAIRY_ADMIN: [
    'customers:approve',
    'customers:manage',
    'rate_charts:read',
    'billing:manage',
    'staff:manage',
    'reports:view',
    'sessions:view',
    'collections:view',
  ],
  COLLECTION_OPERATOR: [
    'sessions:open',
    'sessions:close',
    'collections:intake',
    'collections:read',
    'customers:identify_face',
    'customers:read',
    'rfid:scan',
    'receipts:print',
  ],
  SHIFT_SUPERVISOR: [
    'sessions:open',
    'sessions:close',
    'collections:intake',
    'collections:override',
    'customers:identify_manual',
    'reports:shift',
    'collections:read',
  ],
  ACCOUNTANT: [
    'billing:manage',
    'ledger:read',
    'ledger:export',
    'payouts:maker',
    'reports:financial',
  ],
};

// ============================================================================
// 1. GET /api/v1/staff - List all staff members for dairy
// ============================================================================
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId =
      req.user?.organizationId ||
      (req.headers['x-dairy-id'] as string) ||
      (req.query['organizationId'] as string) ||
      (req.query['dairyId'] as string);

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    const query = `
      SELECT 
        u.id, 
        u.full_name, 
        COALESCE(u.phone_number, u.mobile_number, u.normalized_mobile_number) AS phone_number, 
        u.role, 
        u.status, 
        u.created_at, 
        u.last_login_at,
        uca.center_id,
        dc.name AS center_name,
        dc.code AS center_code
      FROM users u
      LEFT JOIN user_center_assignments uca ON uca.user_id = u.id AND uca.is_primary = TRUE
      LEFT JOIN dairy_centers dc ON dc.id = uca.center_id
      WHERE u.organization_id = $1
        AND u.role NOT IN ('FARMER_CUSTOMER', 'GUEST_FARMER')
      ORDER BY u.full_name ASC;
    `;
    const result = await db.query(query, [organizationId]);
    const staff = result.rows.map((u: any) => ({
      id: u.id,
      dairyId: organizationId,
      fullName: u.full_name,
      mobileNumber: (u.phone_number || '').replace(/^\+91/, ''),
      role: u.role,
      permissions: ROLE_PERMISSIONS[u.role] || ['collections:read'],
      isActive: u.status === 'ACTIVE',
      status: u.status,
      centerId: u.center_id || null,
      centerName: u.center_name || 'All Centers',
      centerCode: u.center_code || 'ALL',
      joinedAt: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : undefined,
    }));

    res.json({ success: true, count: staff.length, data: staff });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. GET /api/v1/staff/centers - List active centers for staff assignment
// ============================================================================
router.get('/centers', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId =
      req.user?.organizationId ||
      (req.headers['x-dairy-id'] as string) ||
      (req.query['organizationId'] as string) ||
      (req.query['dairyId'] as string);

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    const result = await db.query(
      `SELECT id, code, name, village_town, district, status 
       FROM dairy_centers 
       WHERE organization_id = $1 AND status = 'ACTIVE'
       ORDER BY name ASC;`,
      [organizationId]
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. POST /api/v1/staff - Onboard/Register a new staff member or Collection Operator
// ============================================================================
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const caller = req.user;
    if (!caller) {
      res.status(401).json({ success: false, error: 'Unauthorized: missing authentication context' });
      return;
    }

    // Role check: Only Dairy Admins, Owners, or Super Admins can onboard staff
    const allowedActorRoles = ['SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_ADMIN', 'DAIRY_OWNER'];
    if (!allowedActorRoles.includes(caller.role)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: only Dairy Administrators or Super Administrators are authorized to onboard staff members.',
      });
      return;
    }

    const { fullName, mobileNumber, role, centerId, counterName, email } = req.body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ success: false, error: 'Full name is required (at least 2 characters).' });
      return;
    }

    if (!mobileNumber || typeof mobileNumber !== 'string') {
      res.status(400).json({ success: false, error: 'Mobile number is required.' });
      return;
    }

    let phone: PhoneNumber;
    try {
      phone = new PhoneNumber(mobileNumber);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid 10-digit Indian mobile number.' });
      return;
    }

    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);

    const allowedTargetRoles = ['COLLECTION_OPERATOR', 'SHIFT_SUPERVISOR', 'ACCOUNTANT', 'CENTER_MANAGER'];
    const cleanRole = (role || 'COLLECTION_OPERATOR').toUpperCase().trim();
    if (!allowedTargetRoles.includes(cleanRole)) {
      res.status(400).json({
        success: false,
        error: `Invalid role '${cleanRole}'. Allowed staff roles: ${allowedTargetRoles.join(', ')}`,
      });
      return;
    }

    // Resolve target organization
    let targetOrgId = caller.organizationId;
    if (caller.role === 'SUPER_ADMIN' && req.body.organizationId) {
      targetOrgId = req.body.organizationId;
    }
    if (!targetOrgId) {
      res.status(400).json({ success: false, error: 'Target Dairy organizationId is required.' });
      return;
    }

    // Verify center if provided
    let assignedCenterId = centerId;
    let assignedCenterName = 'Main Collection Center';
    let assignedCenterCode = 'C-01';

    if (assignedCenterId) {
      const centerCheck = await db.query(
        `SELECT id, name, code FROM dairy_centers WHERE id = $1 AND organization_id = $2;`,
        [assignedCenterId, targetOrgId]
      );
      if (centerCheck.rows.length === 0) {
        res.status(400).json({ success: false, error: `Center '${assignedCenterId}' does not belong to this Dairy.` });
        return;
      }
      assignedCenterName = centerCheck.rows[0].name;
      assignedCenterCode = centerCheck.rows[0].code;
    } else {
      // Auto-assign primary/first center
      const defaultCenter = await db.query(
        `SELECT id, name, code FROM dairy_centers WHERE organization_id = $1 AND status = 'ACTIVE' LIMIT 1;`,
        [targetOrgId]
      );
      if (defaultCenter.rows.length > 0) {
        assignedCenterId = defaultCenter.rows[0].id;
        assignedCenterName = defaultCenter.rows[0].name;
        assignedCenterCode = defaultCenter.rows[0].code;
      }
    }

    // Check for existing user with this mobile number
    const existingUser = await db.query(
      `SELECT id, organization_id, role, status FROM users 
       WHERE phone_number = $1 OR mobile_number = $1 OR normalized_mobile_number = $1
          OR phone_number LIKE $2 OR mobile_number LIKE $2
       LIMIT 1;`,
      [phone.e164, `%${clean10}`]
    );

    let newUserId: string;

    if (existingUser.rows.length > 0) {
      const ex = existingUser.rows[0];
      if (ex.organization_id === targetOrgId && ex.status === 'ACTIVE' && ex.role === cleanRole) {
        res.status(409).json({
          success: false,
          error: `An active staff member with mobile number ${clean10} is already registered in this Dairy.`,
        });
        return;
      }

      // Update existing record with the new role and active status
      newUserId = ex.id;
      await db.query(
        `UPDATE users 
         SET organization_id = $1, full_name = $2, role = $3, status = 'ACTIVE', updated_at = NOW()
         WHERE id = $4;`,
        [targetOrgId, fullName.trim(), cleanRole, newUserId]
      );
    } else {
      // Create new user
      newUserId = crypto.randomUUID();
      const username = `op_${clean10}`;
      const staffEmail = email?.trim() || `${username}@dfarm.local`;

      await db.query(
        `INSERT INTO users (
           id, organization_id, username, full_name, email,
           phone_number, mobile_number, normalized_mobile_number,
           role, user_role, status, activated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'ACTIVE', NOW());`,
        [
          newUserId,
          targetOrgId,
          username,
          fullName.trim(),
          staffEmail,
          phone.e164,
          clean10,
          phone.e164,
          cleanRole,
        ]
      );
    }

    // Assign center in central database
    if (assignedCenterId) {
      await db.query(
        `INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
        [crypto.randomUUID(), newUserId, assignedCenterId]
      );
    }

    // Dual-write to isolated physical tenant DB if provisioned
    try {
      const tenantClient = await tenantDbManager.getTenantDb(targetOrgId);
      if (tenantClient) {
        await tenantClient.query(
          `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, mobile_number, normalized_mobile_number, role, user_role, status, activated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'ACTIVE', NOW())
           ON CONFLICT (id) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             status = EXCLUDED.status;`,
          [
            newUserId,
            targetOrgId,
            `op_${clean10}`,
            fullName.trim(),
            email?.trim() || `op_${clean10}@dfarm.local`,
            phone.e164,
            clean10,
            phone.e164,
            cleanRole,
          ]
        );

        if (assignedCenterId) {
          await tenantClient.query(
            `INSERT INTO user_center_assignments (id, user_id, center_id, is_primary)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = TRUE;`,
            [crypto.randomUUID(), newUserId, assignedCenterId]
          );
        }
      }
    } catch (tErr: any) {
      logger.warn({ error: tErr.message, orgId: targetOrgId }, 'Tenant DB sync skipped or pending provisioning');
    }

    logger.info(
      {
        operatorId: newUserId,
        mobileNumber: `+91 ******${clean10.slice(-4)}`,
        role: cleanRole,
        dairyId: targetOrgId,
        centerId: assignedCenterId,
      },
      'Collection Operator onboarded successfully'
    );

    res.status(201).json({
      success: true,
      message: `Staff member ${fullName.trim()} successfully onboarded as ${cleanRole.replace(/_/g, ' ')}.`,
      data: {
        id: newUserId,
        dairyId: targetOrgId,
        fullName: fullName.trim(),
        mobileNumber: clean10,
        role: cleanRole,
        permissions: ROLE_PERMISSIONS[cleanRole] || ['collections:read'],
        isActive: true,
        status: 'ACTIVE',
        centerId: assignedCenterId,
        centerName: assignedCenterName,
        centerCode: assignedCenterCode,
        counterName: counterName || 'Counter 1',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. PATCH /api/v1/staff/:id/status - Toggle staff member status (ACTIVE/SUSPENDED)
// ============================================================================
router.patch('/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const caller = req.user;
    if (!caller) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { status } = req.body;
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      res.status(400).json({ success: false, error: "Status must be 'ACTIVE' or 'SUSPENDED'" });
      return;
    }

    const staffId = req.params.id;
    const targetOrgId = caller.organizationId;

    const resUpdate = await db.query(
      `UPDATE users SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND organization_id = $3
       RETURNING id, full_name, status;`,
      [status, staffId, targetOrgId]
    );

    if (resUpdate.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Staff member not found in this Dairy' });
      return;
    }

    // Tenant DB sync
    try {
      const tenantClient = await tenantDbManager.getTenantDb(targetOrgId);
      if (tenantClient) {
        await tenantClient.query(
          `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2;`,
          [status, staffId]
        );
      }
    } catch {}

    res.json({
      success: true,
      message: `Staff member status updated to ${status}.`,
      data: resUpdate.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

export const staffRoutes = router;
