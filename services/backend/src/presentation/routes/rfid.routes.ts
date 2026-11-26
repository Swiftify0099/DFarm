import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LookupRfidCustomerUseCase } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const lookupRfid = new LookupRfidCustomerUseCase(customerRepo);

const rfidLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many RFID lookup requests. Please wait a minute.' },
});

// 1. List all RFID Cards for the authorized dairy tenant
router.get(
  '/',
  authenticate,
  authorizePermission('customers:read', 'rfid:manage', 'customers:identify_rfid'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queryOrgId = req.query['organizationId'] as string;
      const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);
      const requestedOrgId = queryOrgId || headerOrgId;

      if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cross-dairy query blocked: Cannot access RFID cards of another dairy.',
        });
        return;
      }

      const organizationId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrgId || req.user?.organizationId)
        : req.user?.organizationId;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
        return;
      }

    const client = await tenantDbManager.getTenantDb(organizationId).catch(() => db);

    const query = `
      SELECT 
        rc.id,
        rc.card_uid,
        rc.card_type,
        rc.status,
        rc.created_at,
        rc.updated_at,
        rca.customer_id,
        c.farmer_code,
        c.full_name
      FROM rfid_cards rc
      LEFT JOIN rfid_card_assignments rca ON rca.rfid_card_id = rc.id AND rca.is_active = TRUE
      LEFT JOIN customers c ON c.id = rca.customer_id
      WHERE rc.organization_id = $1
      ORDER BY rc.created_at DESC;
    `;

    const result = await client.query(query, [organizationId]);

    const cards = result.rows.map((row: any) => ({
      id: row.id,
      cardUid: row.card_uid,
      dairyId: organizationId,
      customerId: row.customer_id || undefined,
      customerCode: row.farmer_code || undefined,
      customerName: row.full_name || undefined,
      status: row.status as 'ACTIVE' | 'LOST' | 'DISABLED' | 'REVOKED' | 'UNASSIGNED',
      issuedAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      issuedBy: 'Dairy Admin Desk',
      lastScannedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
      lastScannedDevice: 'KIOSK_MAIN',
      notes: row.card_type || 'MIFARE_CLASSIC_1K',
    }));

    res.json({ success: true, count: cards.length, data: cards });
  } catch (err) {
    next(err);
  }
});

// 2. Assign RFID Card to Customer (With Duplicate Assignment Check & Replacement Auditing)
router.post(
  '/assign',
  authenticate,
  authorizePermission('rfid:manage', 'customers:update'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cardUid, customerId, operatorName } = req.body;
      const bodyOrgId = (req.body.organizationId as string) || (req.body.dairyId as string);
      const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);
      const requestedOrg = bodyOrgId || headerOrgId;

      if (requestedOrg && req.user?.organizationId && requestedOrg !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Cross-dairy assignment blocked.' });
        return;
      }
      const organizationId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrg || req.user?.organizationId)
        : req.user?.organizationId;

      if (!cardUid || !customerId || !organizationId) {
      res.status(400).json({ success: false, error: 'cardUid, customerId, and dairy context are required' });
      return;
    }

    const client = await tenantDbManager.getTenantDb(organizationId).catch(() => db);

    // Verify customer exists and belongs to this dairy
    const customer = await customerRepo.findById(customerId, organizationId);
    if (!customer || customer.organizationId !== organizationId) {
      res.status(404).json({ success: false, error: 'Customer not found or belongs to another dairy' });
      return;
    }

    // Check if this card is currently actively assigned to ANOTHER customer
    const existingAssignment = await client.query(
      `SELECT rca.customer_id, c.farmer_code, c.full_name
       FROM rfid_cards rc
       JOIN rfid_card_assignments rca ON rca.rfid_card_id = rc.id AND rca.is_active = TRUE
       JOIN customers c ON c.id = rca.customer_id
       WHERE rc.organization_id = $1 AND rc.card_uid = $2 AND rca.customer_id != $3;`,
      [organizationId, cardUid, customerId]
    );

    if (existingAssignment.rows.length > 0) {
      const other = existingAssignment.rows[0];
      res.status(409).json({
        success: false,
        error: `RFID Card ${cardUid} is already actively assigned to another customer: ${other.full_name} (${other.farmer_code}). Please unassign or replace the existing card first.`,
      });
      return;
    }

    // Upsert card in master inventory
    const cardRes = await client.query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'ACTIVE')
       ON CONFLICT (organization_id, card_uid)
       DO UPDATE SET status = 'ACTIVE', updated_at = NOW()
       RETURNING id;`,
      [organizationId, cardUid]
    );
    const cardId = cardRes.rows[0].id;

    // Deactivate previous active assignment for this customer or card, recording replacement reason
    await client.query(
      `UPDATE rfid_card_assignments SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'SUPERSEDED_REPLACED'
       WHERE (customer_id = $1 OR rfid_card_id = $2) AND is_active = TRUE;`,
      [customerId, cardId]
    );

    // Resolve centerId
    const centerRes = await client.query(
      `SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`,
      [organizationId]
    );
    const centerId = centerRes.rows[0]?.id || customer.centerId || req.user?.centerId;
    const assignedBy = req.user!.userId;
    if (!centerId) {
      res.status(400).json({ success: false, error: 'Collection center context could not be resolved' });
      return;
    }

    // Insert new active assignment
    await client.query(
      `INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4);`,
      [cardId, customerId, centerId, assignedBy]
    );

    res.json({
      success: true,
      message: `RFID Card ${cardUid} assigned to ${customer.fullName} (${customer.farmerCode}) successfully.`,
      data: {
        id: cardId,
        cardUid,
        dairyId: organizationId,
        customerId,
        customerCode: customer.farmerCode,
        customerName: customer.fullName,
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        issuedBy: operatorName || 'Dairy Admin',
      },
    });
  } catch (err: any) {
    if (err.code === '23505' || err.message?.includes('uq_active_card_assignment') || err.message?.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        error: `Card UID ${req.body?.cardUid || ''} is already actively assigned to another customer.`,
      });
      return;
    }
    next(err);
  }
});

// 3. Mark RFID Card as Lost / Revoked
router.post(
  '/mark-lost',
  authenticate,
  authorizePermission('rfid:manage', 'customers:update'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cardUid, reason } = req.body;
      const requestedOrg = (req.headers['x-dairy-id'] as string) || (req.body.dairyId as string);
      if (requestedOrg && req.user?.organizationId && requestedOrg !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Cross-dairy card revocation blocked.' });
        return;
      }
      const organizationId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrg || req.user?.organizationId)
        : req.user?.organizationId;

    if (!cardUid || !organizationId) {
      res.status(400).json({ success: false, error: 'cardUid and dairy context are required' });
      return;
    }

    const client = await tenantDbManager.getTenantDb(organizationId).catch(() => db);

    const cardRes = await client.query(
      `UPDATE rfid_cards SET status = 'LOST', updated_at = NOW()
       WHERE card_uid = $1 AND organization_id = $2
       RETURNING id;`,
      [cardUid, organizationId]
    );

    if (cardRes.rows.length > 0) {
      const cardId = cardRes.rows[0].id;
      await client.query(
        `UPDATE rfid_card_assignments 
         SET is_active = FALSE, revoked_at = NOW(), revocation_reason = $1 
         WHERE rfid_card_id = $2;`,
        [reason || 'Marked lost by admin', cardId]
      );
    }

    res.json({ success: true, message: `RFID Card ${cardUid} marked as LOST and deactivated.` });
  } catch (err) {
    next(err);
  }
});

// 4. Unassign RFID Card from Customer (Without Marking as Lost)
router.post(
  '/unassign',
  authenticate,
  authorizePermission('rfid:manage', 'customers:update'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cardUid, customerId } = req.body;
      const requestedOrg = (req.headers['x-dairy-id'] as string) || (req.body.dairyId as string);
      if (requestedOrg && req.user?.organizationId && requestedOrg !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Cross-dairy card unassignment blocked.' });
        return;
      }
      const organizationId = req.user?.role === 'SUPER_ADMIN'
        ? (requestedOrg || req.user?.organizationId)
        : req.user?.organizationId;

    if ((!cardUid && !customerId) || !organizationId) {
      res.status(400).json({ success: false, error: 'cardUid or customerId, and dairy context are required' });
      return;
    }

    const client = await tenantDbManager.getTenantDb(organizationId).catch(() => db);

    if (cardUid) {
      await client.query(
        `UPDATE rfid_cards SET status = 'ACTIVE', updated_at = NOW()
         WHERE card_uid = $1 AND organization_id = $2;`,
        [cardUid, organizationId]
      );

      await client.query(
        `UPDATE rfid_card_assignments
         SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'UNASSIGNED'
         WHERE rfid_card_id IN (SELECT id FROM rfid_cards WHERE card_uid = $1 AND organization_id = $2)
           AND is_active = TRUE;`,
        [cardUid, organizationId]
      );
    } else if (customerId) {
      await client.query(
        `UPDATE rfid_card_assignments
         SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'UNASSIGNED'
         WHERE customer_id = $1 AND is_active = TRUE;`,
        [customerId]
      );
    }

    res.json({ success: true, message: 'RFID Card successfully unassigned from customer.' });
  } catch (err) {
    next(err);
  }
});

// 4. RFID Card Lookup (Terminal / Kiosk)
const handleRfidLookup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cardUid = ((req.params?.uid || req.query['uid'] || req.query['cardUid'] || req.query['tag']) as string) || '';
    if (!cardUid) {
      res.status(400).json({ success: false, error: 'cardUid is required' });
      return;
    }

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      res.status(401).json({ success: false, error: 'Unauthorized: missing dairy tenant context in token' });
      return;
    }

    const queryOrgId = req.query['organizationId'] as string;
    const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);
    if ((queryOrgId && queryOrgId !== organizationId) || (headerOrgId && headerOrgId !== organizationId)) {
      if (req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cross-dairy lookup blocked: Token tenant context does not match requested tenant.',
        });
        return;
      }
    }

    const customer = await lookupRfid.execute(cardUid, organizationId);
    if (!customer) {
      res.status(404).json({ success: false, error: `Customer for card ${cardUid} not found` });
      return;
    }

    // Return strictly MINIMAL customer identification data for Collection App (no bank accounts, biometrics, or full addresses)
    res.json({
      success: true,
      data: {
        id: customer.id,
        farmerCode: customer.farmerCode,
        fullName: customer.fullName,
        status: customer.status,
        defaultMilkType: (customer as any).defaultMilkType || (customer as any).permittedCategories?.[0] || 'COW',
        organizationId: customer.organizationId,
        centerId: customer.centerId,
        canDeliver: customer.status === 'ACTIVE' && ((customer as any).registrationStatus === 'APPROVED' || !(customer as any).registrationStatus),
      },
    });
  } catch (err: any) {
    if (err.name === 'CustomerNotFoundError' || err.message?.includes('not found')) {
      res.status(404).json({
        success: false,
        error: `RFID card is not assigned to any registered customer in this dairy.`,
      });
      return;
    }
    next(err);
  }
};

router.get(
  '/lookup',
  authenticate,
  rfidLookupLimiter,
  authorizePermission('customers:identify_rfid', 'customers:read', 'rfid:manage'),
  handleRfidLookup
);

router.get(
  '/lookup/:uid',
  authenticate,
  rfidLookupLimiter,
  authorizePermission('customers:identify_rfid', 'customers:read', 'rfid:manage'),
  handleRfidLookup
);

export const rfidRoutes = router;
