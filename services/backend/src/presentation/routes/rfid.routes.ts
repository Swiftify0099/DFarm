import { Router, Request, Response, NextFunction } from 'express';
import { LookupRfidCustomerUseCase } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const lookupRfid = new LookupRfidCustomerUseCase(customerRepo);

// 1. List all RFID Cards for the authorized dairy tenant
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

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

    const result = await db.query(query, [organizationId]);

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

// 2. Assign RFID Card to Customer
router.post('/assign', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cardUid, customerId, operatorName } = req.body;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.body.dairyId as string);

    if (!cardUid || !customerId || !organizationId) {
      res.status(400).json({ success: false, error: 'cardUid, customerId, and dairy context are required' });
      return;
    }

    // Verify customer exists and belongs to this dairy
    const customer = await customerRepo.findById(customerId);
    if (!customer || customer.organizationId !== organizationId) {
      res.status(404).json({ success: false, error: 'Customer not found or belongs to another dairy' });
      return;
    }

    // Upsert card in master inventory
    const cardRes = await db.query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, 'MIFARE_CLASSIC_1K', 'ACTIVE')
       ON CONFLICT (organization_id, card_uid)
       DO UPDATE SET status = 'ACTIVE', updated_at = NOW()
       RETURNING id;`,
      [organizationId, cardUid]
    );
    const cardId = cardRes.rows[0].id;

    // Deactivate previous active assignment for this customer and card
    await db.query(
      `UPDATE rfid_card_assignments SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'SUPERSEDED'
       WHERE (customer_id = $1 OR rfid_card_id = $2) AND is_active = TRUE;`,
      [customerId, cardId]
    );

    // Resolve centerId
    const centerRes = await db.query(
      `SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`,
      [organizationId]
    );
    const centerId = centerRes.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
    const assignedBy = req.user?.userId || '00000000-0000-0000-0000-000000000003';

    // Insert new assignment
    await db.query(
      `INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4);`,
      [cardId, customerId, centerId, assignedBy]
    );

    // Update customer table with rfid_card_uid
    await db.query(
      `UPDATE customers SET rfid_card_uid = $1, updated_at = NOW() WHERE id = $2;`,
      [cardUid, customerId]
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
  } catch (err) {
    next(err);
  }
});

// 3. Mark RFID Card as Lost / Revoked
router.post('/mark-lost', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cardUid, reason } = req.body;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);

    if (!cardUid || !organizationId) {
      res.status(400).json({ success: false, error: 'cardUid and dairy context are required' });
      return;
    }

    const cardRes = await db.query(
      `UPDATE rfid_cards SET status = 'LOST', updated_at = NOW()
       WHERE card_uid = $1 AND organization_id = $2
       RETURNING id;`,
      [cardUid, organizationId]
    );

    if (cardRes.rows.length > 0) {
      const cardId = cardRes.rows[0].id;
      await db.query(
        `UPDATE rfid_card_assignments 
         SET is_active = FALSE, revoked_at = NOW(), revocation_reason = $1 
         WHERE rfid_card_id = $2;`,
        [reason || 'Marked lost by admin', cardId]
      );
    }

    await db.query(
      `UPDATE customers SET rfid_card_uid = NULL WHERE rfid_card_uid = $1 AND organization_id = $2;`,
      [cardUid, organizationId]
    );

    res.json({ success: true, message: `RFID Card ${cardUid} marked as LOST and deactivated.` });
  } catch (err) {
    next(err);
  }
});

// 4. RFID Card Lookup (Terminal / Kiosk)
router.get('/lookup', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cardUid = (req.query['uid'] || req.query['cardUid'] || req.query['tag']) as string;
    const organizationId = req.user?.organizationId || (req.query['organizationId'] as string);

    const customer = await lookupRfid.execute(cardUid, organizationId);
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

router.get('/lookup/:uid', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.params.uid;
    const cardUid = (Array.isArray(uid) ? uid[0] : uid) || '';
    const organizationId = req.user?.organizationId || (req.query['organizationId'] as string);

    const customer = await lookupRfid.execute(cardUid, organizationId);
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

export const rfidRoutes = router;
