import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import {
  GetCustomersUseCase,
  GetCustomerByIdUseCase,
  RegisterCustomerUseCase,
  GetCustomerStatusUseCase,
  GetPendingCustomerRegistrationsUseCase,
  ApproveCustomerRegistrationUseCase,
  RejectCustomerRegistrationUseCase,
  UpdateCustomerBiometricsUseCase,
} from '../../application/use-cases/index.js';
import {
  PostgresCustomerRepository,
  Aes256GcmBiometricEncryptor,
} from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const biometricEncryptor = new Aes256GcmBiometricEncryptor();

const getCustomersUseCase = new GetCustomersUseCase(customerRepo);
const getCustomerByIdUseCase = new GetCustomerByIdUseCase(customerRepo);
const registerCustomerUseCase = new RegisterCustomerUseCase(customerRepo);
const getCustomerStatusUseCase = new GetCustomerStatusUseCase(customerRepo);
const getPendingRegistrationsUseCase = new GetPendingCustomerRegistrationsUseCase(customerRepo);
const approveRegistrationUseCase = new ApproveCustomerRegistrationUseCase(customerRepo);
const rejectRegistrationUseCase = new RejectCustomerRegistrationUseCase(customerRepo);
const updateBiometricsUseCase = new UpdateCustomerBiometricsUseCase(customerRepo, biometricEncryptor);

// 1. List / Search Customers (Kiosk and Admin)
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let organizationId = req.user?.organizationId;
    if (!organizationId) {
      organizationId = (req.query['organizationId'] as string) || (req.headers['x-dairy-id'] as string) || (req.headers['x-dairy-tenant-id'] as string);
    } else if (req.query['organizationId'] && req.query['organizationId'] !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy query blocked: Cannot query customer data of another dairy.',
      });
      return;
    }

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Dairy context (organizationId) is required.',
      });
      return;
    }

    const centerId = (req.query['centerId'] as string) || req.user?.centerId;
    const search = req.query['search'] as string;
    const category = req.query['category'] as any;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 100;
    const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
    const includeSoftDeleted = req.query['includeSoftDeleted'] === 'true' || req.query['showDeleted'] === 'true';

    const data = await getCustomersUseCase.execute({
      organizationId,
      centerId,
      search,
      category,
      limit,
      offset,
      includeSoftDeleted,
    });

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// 2. Authenticated Customer Profile (Farmer App)
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.user!.userId;
    const data = await getCustomerByIdUseCase.execute(customerId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 3. Register Customer (Self-registration)
router.post('/register', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body;
    const userPhone = req.user?.userId?.startsWith('unregistered:')
      ? req.user.userId.replace('unregistered:', '')
      : undefined;
    const phone = body.mobileNumber || body.phone || userPhone;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'Mobile number is mandatory for producer registration.',
      });
      return;
    }

    const targetOrgId = body.organizationId || body.dairyId || body.selectedDairyId;
    if (!targetOrgId) {
      res.status(400).json({
        success: false,
        error: 'Dairy selection (organizationId) is required for customer registration.',
      });
      return;
    }

    // Resolve primary center for this dairy
    let centerId = body.centerId;
    if (!centerId) {
      try {
        const centerRes = await db.query(
          `SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`,
          [targetOrgId]
        );
        if (centerRes.rows.length > 0) {
          centerId = centerRes.rows[0].id;
        } else {
          const newCenterId = crypto.randomUUID();
          await db.query(
            `INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, status)
             VALUES ($1, $2, 'C-01', 'Main Collection Center', 'Center Road', 'Local', 'District', 'State', '400001', 'ACTIVE')
             ON CONFLICT DO NOTHING;`,
            [newCenterId, targetOrgId]
          );
          centerId = newCenterId;
        }
      } catch {
        centerId = '00000000-0000-0000-0000-000000000002';
      }
    }

    const categories = body.categories || (body.milkSupplyType ? (body.milkSupplyType === 'BOTH' ? ['COW', 'BUFFALO'] : [body.milkSupplyType]) : (body.category ? [body.category] : ['COW']));

    const data = await registerCustomerUseCase.execute({
      fullName: body.fullName || body.name || 'Registered Producer',
      mobileNumber: phone,
      organizationId: targetOrgId,
      centerId,
      village: body.village,
      categories,
      bankDetails: body.bankDetails,
    });

    // If face biometric embedding is submitted, encrypt and save
    if (body.faceTemplate?.embedding && Array.isArray(body.faceTemplate.embedding)) {
      try {
        await updateBiometricsUseCase.execute({
          customerId: data.id,
          embedding: body.faceTemplate.embedding,
          modelVersion: body.faceTemplate.modelVersion || 'sface_int8_2021dec',
        });
      } catch {
        // Biometric vector stored as best effort
      }
    }

    res.status(201).json({
      success: true,
      data,
      customerUuid: data.id,
      status: data.registrationStatus,
      submissionTimestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// 4. List Pending Customer Registrations (Dairy Admin Approvals Queue)
router.get('/pending', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.user?.organizationId || (req.query['organizationId'] as string) || (req.headers['x-dairy-id'] as string) || (req.headers['x-dairy-tenant-id'] as string) || undefined;
    const data = await getPendingRegistrationsUseCase.execute(orgId);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// 5. Get Customer Registration Status
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const data = await getCustomerStatusUseCase.execute(customerId);

    let assignedDairyName = 'DFarm Dairy Cooperative';
    if (data.organizationId) {
      try {
        const orgRes = await db.query(
          `SELECT name FROM organizations WHERE id = $1 LIMIT 1;`,
          [data.organizationId]
        );
        if (orgRes.rows.length > 0 && orgRes.rows[0].name) {
          assignedDairyName = orgRes.rows[0].name;
        }
      } catch {
        // ignore
      }
    }

    res.json({
      success: true,
      data,
      status: data.registrationStatus,
      registrationStatus: data.registrationStatus,
      reason: data.rejectionReason,
      rejectionReason: data.rejectionReason,
      assignedDairyName,
      customerCode: data.farmerCode,
      fullName: data.fullName,
    });
  } catch (err) {
    next(err);
  }
});

// 6. Approve Pending Customer Registration (Administrative Activation)
router.post('/:id/approve', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const customCode = req.body?.customerCode || req.body?.farmerCode;
    const data = await approveRegistrationUseCase.execute(customerId, operatorName, customCode);
    res.json({
      success: true,
      message: `Successfully approved farmer registration for ${data.fullName} (Assigned Code: ${data.farmerCode || data.customerCode}).`,
      data,
    });
  } catch (err) {
    next(err);
  }
});

// 7. Reject Pending Customer Registration with Mandatory Detailed Reason
router.post('/:id/reject', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const reason = req.body?.reason;
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const data = await rejectRegistrationUseCase.execute(customerId, reason, operatorName);
    res.json({
      success: true,
      message: 'Registration request successfully rejected with audit reason.',
      data,
    });
  } catch (err) {
    next(err);
  }
});

// 8. Soft Delete Customer
router.post('/:id/soft-delete', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const reason = req.body?.reason || 'Soft-deleted by administrator';
    await db.query(
      `UPDATE customers SET is_deleted = TRUE, deletion_reason = $1, updated_at = NOW() WHERE id = $2;`,
      [reason, customerId]
    );
    res.json({ success: true, message: 'Customer account marked as soft-deleted in audit records.' });
  } catch (err) {
    next(err);
  }
});

// 9. Restore Soft Deleted Customer
router.post('/:id/restore', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    await db.query(
      `UPDATE customers SET is_deleted = FALSE, deletion_reason = NULL, updated_at = NOW() WHERE id = $1;`,
      [customerId]
    );
    res.json({ success: true, message: 'Customer account successfully restored to active status.' });
  } catch (err) {
    next(err);
  }
});

// 10. Update Biometric Face Enrollment (128-dim vector) - supports both PUT and POST
const handleBiometricsUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    let customerId = (Array.isArray(id) ? id[0] : id) || '';
    if (customerId === 'me' && req.user?.userId) {
      customerId = req.user.userId;
    }
    const { embedding, modelVersion } = req.body;
    const data = await updateBiometricsUseCase.execute({
      customerId,
      embedding,
      modelVersion,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
};

router.put('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);

// 11. Get Customer By ID
router.get('/:id', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const data = await getCustomerByIdUseCase.execute(customerId);

    // Multi-dairy isolation check
    if (req.user?.organizationId && data.organizationId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy access blocked: Customer does not belong to authorized dairy.',
      });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export const customerRoutes = router;
