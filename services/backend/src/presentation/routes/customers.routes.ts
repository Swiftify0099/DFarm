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
  SuspendCustomerUseCase,
  ReactivateCustomerUseCase,
  UpdateCustomerProfileUseCase,
  GetCustomerMembershipsUseCase,
  SelectDairyMembershipUseCase,
} from '../../application/use-cases/index.js';
import {
  PostgresCustomerRepository,
  PostgresCustomerMembershipRepository,
  Aes256GcmBiometricEncryptor,
  HmacJwtTokenService,
} from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';

const router = Router();
const customerRepo = new PostgresCustomerRepository();
const membershipRepo = new PostgresCustomerMembershipRepository();
const tokenService = new HmacJwtTokenService();
const biometricEncryptor = new Aes256GcmBiometricEncryptor();

const getCustomersUseCase = new GetCustomersUseCase(customerRepo);
const getCustomerByIdUseCase = new GetCustomerByIdUseCase(customerRepo);
const registerCustomerUseCase = new RegisterCustomerUseCase(customerRepo, membershipRepo);
const getCustomerStatusUseCase = new GetCustomerStatusUseCase(customerRepo);
const getPendingRegistrationsUseCase = new GetPendingCustomerRegistrationsUseCase(customerRepo);
const approveRegistrationUseCase = new ApproveCustomerRegistrationUseCase(customerRepo, membershipRepo);
const rejectRegistrationUseCase = new RejectCustomerRegistrationUseCase(customerRepo, membershipRepo);
const updateBiometricsUseCase = new UpdateCustomerBiometricsUseCase(customerRepo, biometricEncryptor);
const suspendCustomerUseCase = new SuspendCustomerUseCase(customerRepo, membershipRepo);
const reactivateCustomerUseCase = new ReactivateCustomerUseCase(customerRepo, membershipRepo);
const updateProfileUseCase = new UpdateCustomerProfileUseCase(customerRepo);
const getMembershipsUseCase = new GetCustomerMembershipsUseCase(membershipRepo, customerRepo);
const selectDairyMembershipUseCase = new SelectDairyMembershipUseCase(membershipRepo, tokenService, customerRepo);

// 1. List / Search Customers (Kiosk and Admin)
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let organizationId = req.user?.organizationId;
    const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);
    const queryOrgId = req.query['organizationId'] as string;

    if (organizationId) {
      if (queryOrgId && queryOrgId !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cross-dairy query blocked: Cannot query customer data of another dairy.',
        });
        return;
      }
    } else if (headerOrgId && queryOrgId && headerOrgId !== queryOrgId) {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy query blocked: Header dairy ID does not match query organization ID.',
      });
      return;
    } else {
      organizationId = queryOrgId || headerOrgId;
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
    const data = await getCustomerByIdUseCase.execute(customerId, req.user?.organizationId);

    // Safely mask bank account number
    const maskedData: any = { ...data };
    if (maskedData.bankDetails && maskedData.bankDetails.accountNumber) {
      const rawAcc = String(maskedData.bankDetails.accountNumber);
      maskedData.bankDetails = {
        ...maskedData.bankDetails,
        accountNumberMask: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
        accountNumber: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
      };
    }

    // Map dairy details for customer mobile app schema compatibility
    maskedData.dairyId = maskedData.organizationId;
    maskedData.milkSupplyType = Array.isArray(maskedData.categories)
      ? (maskedData.categories.includes('COW') && maskedData.categories.includes('BUFFALO') ? 'BOTH' : (maskedData.categories[0] || 'COW'))
      : (maskedData.category || 'COW');
    maskedData.biometricStatus = {
      isEnrolled: Boolean(maskedData.faceTemplateEnrolled),
      version: 'sface_int8_2021dec',
    };

    res.json({ success: true, data: maskedData, ...maskedData });
  } catch (err) {
    next(err);
  }
});

// 2b. Multi-Dairy Customer Memberships Discovery
router.get('/memberships', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPhone = req.user?.userId?.startsWith('unregistered:')
      ? req.user.userId.replace('unregistered:', '')
      : (req.query['phone'] as string) || (req.query['mobileNumber'] as string);

    const result = await getMembershipsUseCase.execute({
      globalCustomerId: req.user?.globalCustomerId || (req.query['globalCustomerId'] as string),
      phone: userPhone,
      customerId: req.user?.userId,
      organizationId: req.user?.organizationId,
    });

    res.json({
      success: true,
      count: result.memberships.length,
      globalCustomerId: result.globalCustomerId,
      data: result.memberships,
      memberships: result.memberships,
    });
  } catch (err) {
    next(err);
  }
});

// 2c. Dairy Switching (Issue tenant-isolated session)
router.post('/switch-dairy', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dairyId = req.body.dairyId || req.body.organizationId;
    if (!dairyId) {
      res.status(400).json({ success: false, error: 'dairyId (or organizationId) is required to switch dairy.' });
      return;
    }

    const result = await selectDairyMembershipUseCase.execute({
      globalCustomerId: req.user?.globalCustomerId || req.body.globalCustomerId,
      dairyId,
      tenantCustomerId: req.user?.userId || req.body.tenantCustomerId,
      phone: req.user?.phoneNumber || req.body.phone,
    });

    res.json({
      success: true,
      message: `Switched active dairy to ${result.selectedDairy.dairyName}`,
      ...result,
    });
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

    // Strict Tenant Database Availability Verification
    const tenantMapping = tenantDbManager.getTenantMapping(targetOrgId);
    if (tenantMapping && tenantMapping.provisioningStatus === 'FAILED') {
      res.status(503).json({
        success: false,
        code: 'TENANT_DATABASE_UNAVAILABLE',
        error: `Selected dairy tenant database (${tenantMapping.dairyCode}) is unavailable (provisioning status: FAILED). Customer registration cannot proceed until database provisioning is resolved.`,
        data: {
          dairyId: targetOrgId,
          dairyCode: tenantMapping.dairyCode,
          provisioningStatus: tenantMapping.provisioningStatus,
          provisioningError: tenantMapping.provisioningError,
        },
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
          organizationId: targetOrgId,
          embedding: body.faceTemplate.embedding,
          modelVersion: body.faceTemplate.modelVersion || 'sface_int8_2021dec',
        });
      } catch (err: any) {
        console.error('Biometric enrollment error in /register:', err?.message, err?.stack);
      }
    }

    res.status(201).json({
      success: true,
      data,
      customerUuid: data.id,
      status: data.registrationStatus,
      submissionTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.name === 'TenantDatabaseUnavailableError' || err?.message?.includes('Tenant database') || err?.message?.includes('No active persistent database')) {
      res.status(503).json({
        success: false,
        code: 'TENANT_DATABASE_UNAVAILABLE',
        error: err.message || 'The selected dairy tenant database is unavailable.',
      });
      return;
    }
    next(err);
  }
});

// 4. List Pending Customer Registrations (Dairy Admin Approvals Queue)
router.get('/pending', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let orgId = req.user?.organizationId;
    const queryOrgId = req.query['organizationId'] as string;
    const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);

    if (orgId) {
      if (queryOrgId && queryOrgId !== orgId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cross-dairy query blocked: Cannot view pending registrations of another dairy.',
        });
        return;
      }
    } else {
      orgId = queryOrgId || headerOrgId;
    }

    if (req.user) {
      authorizePermission('customers:read', 'customers:approve')(req, res, () => {});
    }

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
    const orgId =
      req.user?.organizationId ||
      (req.query['organizationId'] as string) ||
      (req.query['dairyId'] as string) ||
      (req.headers['x-dairy-id'] as string) ||
      (req.headers['x-dairy-tenant-id'] as string) ||
      undefined;
    const data = await getCustomerStatusUseCase.execute(customerId, orgId);

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
const handleApprove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const customCode = req.body?.customerCode || req.body?.farmerCode;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    const data = await approveRegistrationUseCase.execute(customerId, operatorName, customCode, organizationId);
    res.json({
      success: true,
      status: data.status,
      customerCode: data.farmerCode || data.customerCode,
      farmerCode: data.farmerCode || data.customerCode,
      message: `Successfully approved farmer registration for ${data.fullName} (Assigned Code: ${data.farmerCode || data.customerCode}).`,
      data,
    });
  } catch (err: any) {
    if (err.name === 'DomainValidationError' && err.message.includes('already approved')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
};
router.post('/:id/approve', optionalAuthenticate, (req, res, next) => {
  if (req.user) {
    return authorizePermission('customers:approve')(req, res, next);
  }
  next();
}, handleApprove);
router.patch('/:id/approve', optionalAuthenticate, (req, res, next) => {
  if (req.user) {
    return authorizePermission('customers:approve')(req, res, next);
  }
  next();
}, handleApprove);

// 7. Reject Pending Customer Registration with Mandatory Detailed Reason
const handleReject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const reason = req.body?.reason;
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    const data = await rejectRegistrationUseCase.execute(customerId, reason, operatorName, organizationId);
    res.json({
      success: true,
      message: 'Registration request successfully rejected with audit reason.',
      data,
    });
  } catch (err: any) {
    if (err.name === 'DomainValidationError') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
};
router.post('/:id/reject', optionalAuthenticate, (req, res, next) => {
  if (req.user) {
    return authorizePermission('customers:approve', 'customers:reject')(req, res, next);
  }
  next();
}, handleReject);
router.patch('/:id/reject', optionalAuthenticate, (req, res, next) => {
  if (req.user) {
    return authorizePermission('customers:approve', 'customers:reject')(req, res, next);
  }
  next();
}, handleReject);

// 8. Suspend Customer
router.post('/:id/suspend', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('customers:update')(req, res, () => {});
    }
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const reason = req.body?.reason || 'Suspended by dairy administration';
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);

    const data = await suspendCustomerUseCase.execute(customerId, reason, operatorName, organizationId);
    res.json({
      success: true,
      message: `Customer ${data.fullName} (${data.farmerCode}) suspended successfully.`,
      data,
    });
  } catch (err: any) {
    if (err.name === 'DomainValidationError') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
});

// 9. Reactivate Customer
router.post('/:id/reactivate', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('customers:update')(req, res, () => {});
    }
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);

    const data = await reactivateCustomerUseCase.execute(customerId, operatorName, organizationId);
    res.json({
      success: true,
      message: `Customer ${data.fullName} (${data.farmerCode}) reactivated successfully.`,
      data,
    });
  } catch (err: any) {
    if (err.name === 'DomainValidationError') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
});

// 10. Update Customer Profile Details
router.patch('/:id', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('customers:update')(req, res, () => {});
    }

    // Security Gate: Generic profile updates cannot mutate bank account details
    if (req.body?.bankAccountNumber || req.body?.bankIfscCode || req.body?.bankName || req.body?.bankDetails) {
      res.status(403).json({
        success: false,
        error: 'Bank beneficiary modifications are restricted and must use the dedicated Customer App beneficiary workflow.',
      });
      return;
    }

    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const { fullName, village, permittedCategories, mobileNumber } = req.body;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);

    const data = await updateProfileUseCase.execute(
      customerId,
      { fullName, village, permittedCategories, mobileNumber },
      organizationId
    );
    res.json({
      success: true,
      message: 'Customer profile updated successfully.',
      data,
    });
  } catch (err: any) {
    if (err.name === 'DomainValidationError') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
});

// 11. Soft Delete Customer
const handleSoftDeleteCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('customers:delete', 'customers:update')(req, res, () => {});
    }
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const reason = req.body?.reason || 'Soft-deleted by administrator';
    const customer = await customerRepo.findById(customerId, req.user?.organizationId);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }
    if (req.user?.organizationId && customer.organizationId !== req.user.organizationId && req.user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy modification blocked' });
      return;
    }

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
    await tenantDb.query(
      `UPDATE customers SET is_deleted = TRUE, deletion_reason = $1, updated_at = NOW() WHERE id = $2;`,
      [reason, customerId]
    );
    res.json({ success: true, message: 'Customer account marked as soft-deleted in audit records.' });
  } catch (err) {
    next(err);
  }
};

router.post('/:id/soft-delete', optionalAuthenticate, handleSoftDeleteCustomer);
router.delete('/:id', optionalAuthenticate, handleSoftDeleteCustomer);

// 12. Restore Soft Deleted Customer
router.post('/:id/restore', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('customers:update')(req, res, () => {});
    }
    const id = req.params.id;
    const customerId = (Array.isArray(id) ? id[0] : id) || '';
    const customer = await customerRepo.findById(customerId, req.user?.organizationId, true);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }
    if (req.user?.organizationId && customer.organizationId !== req.user.organizationId && req.user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: 'Cross-dairy modification blocked' });
      return;
    }

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
    await tenantDb.query(
      `UPDATE customers SET is_deleted = FALSE, deletion_reason = NULL, updated_at = NOW() WHERE id = $1;`,
      [customerId]
    );
    res.json({ success: true, message: 'Customer account successfully restored to active status.' });
  } catch (err) {
    next(err);
  }
});

// 10. Update Biometric Face Enrollment (128-dim vector) & RFID Assignment
const handleBiometricsUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    let customerId = (Array.isArray(id) ? id[0] : id) || '';
    if (customerId === 'me' && req.user?.userId) {
      customerId = req.user.userId;
    }
    const { embedding, modelVersion, rfidCardUid, cardUid } = req.body;
    const targetUid = rfidCardUid || cardUid;
    const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);
    const orgId = req.user?.organizationId || (req.query['organizationId'] as string) || headerOrgId;

    if (targetUid) {
      await customerRepo.assignRfidCard(customerId, targetUid, orgId);
    }

    let data: any = { success: true };
    if (embedding && Array.isArray(embedding)) {
      data = await updateBiometricsUseCase.execute({
        customerId,
        organizationId: orgId,
        embedding,
        modelVersion,
      });
    }

    const updatedCustomer = await customerRepo.findById(customerId, orgId).catch(() => null);

    res.json({
      success: true,
      message: 'Biometrics and identification credentials updated successfully.',
      data: updatedCustomer ? updatedCustomer.toJSON() : (data || { id: customerId }),
      customerId,
      status: data?.status || updatedCustomer?.status || 'ENROLLED',
      rfidCardUid: targetUid || updatedCustomer?.rfidCardUid,
    });
  } catch (err) {
    next(err);
  }
};

router.put('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.patch('/:id/biometrics', optionalAuthenticate, handleBiometricsUpdate);
router.post('/:id/biometrics', optionalAuthenticate, handleBiometricsUpdate);
router.put('/:id/biometrics', optionalAuthenticate, handleBiometricsUpdate);

// 11. Get Customer By ID
router.get('/:id', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    let customerId = (Array.isArray(id) ? id[0] : id) || '';

    // If "me" is requested, resolve from authenticated user context
    if (customerId === 'me' || !customerId) {
      customerId = req.user?.userId || '';
      if (!customerId) {
        res.status(401).json({ success: false, error: 'Unauthorized: missing authentication context' });
        return;
      }
    }

    // Farmer customer can only view their own profile
    if (req.user?.role === 'FARMER_CUSTOMER' && customerId !== req.user.userId) {
      res.status(403).json({
        success: false,
        error: 'Cross-customer access blocked: customer can only access their own profile.',
      });
      return;
    }

    const data = await getCustomerByIdUseCase.execute(customerId, req.user?.organizationId);

    // Multi-dairy isolation check
    if (req.user?.organizationId && data.organizationId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy access blocked: Customer does not belong to authorized dairy.',
      });
      return;
    }

    // Safely mask bank account number in general response
    const maskedData: any = { ...data };
    if (maskedData.bankDetails && maskedData.bankDetails.accountNumber) {
      const rawAcc = String(maskedData.bankDetails.accountNumber);
      maskedData.bankDetails = {
        ...maskedData.bankDetails,
        accountNumberMask: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
        accountNumber: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
      };
    }

    // Map dairy details for customer mobile app schema compatibility
    maskedData.dairyId = maskedData.organizationId;
    maskedData.milkSupplyType = Array.isArray(maskedData.categories)
      ? (maskedData.categories.includes('COW') && maskedData.categories.includes('BUFFALO') ? 'BOTH' : (maskedData.categories[0] || 'COW'))
      : (maskedData.category || 'COW');
    maskedData.biometricStatus = {
      isEnrolled: Boolean(maskedData.faceTemplateEnrolled),
      version: 'sface_int8_2021dec',
    };

    res.json({ success: true, data: maskedData, ...maskedData });
  } catch (err) {
    next(err);
  }
});

// 12. Update Bank Beneficiary Details (Customer App & Dairy Admin)
router.put('/:id/bank-details', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params.id;
    let customerId = (Array.isArray(rawId) ? rawId[0] : rawId) || '';

    if (customerId === 'me' || !customerId) {
      customerId = req.user?.userId || '';
    }

    if (req.user?.role === 'FARMER_CUSTOMER' && customerId !== req.user.userId) {
      res.status(403).json({
        success: false,
        error: 'Cross-customer access blocked: customer can only update their own bank details.',
      });
      return;
    }

    const { bankName, accountNumber, ifscCode, accountHolderName } = req.body;
    if (!bankName || !accountNumber || !ifscCode) {
      res.status(400).json({
        success: false,
        error: 'bankName, accountNumber, and ifscCode are mandatory fields.',
      });
      return;
    }

    const cleanAcc = String(accountNumber).trim();
    const cleanIfsc = String(ifscCode).trim().toUpperCase();

    if (cleanAcc.length < 6 || cleanAcc.length > 30) {
      res.status(400).json({
        success: false,
        error: 'Invalid bank account number length (must be between 6 and 30 characters).',
      });
      return;
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      res.status(400).json({
        success: false,
        error: 'Invalid IFSC code format (expected 11 alphanumeric characters, e.g., SBIN0001234).',
      });
      return;
    }

    // Resolve tenant client
    const customer = await getCustomerByIdUseCase.execute(customerId);
    const orgId = customer.organizationId || req.user?.organizationId;
    const client = orgId ? await tenantDbManager.getTenantDb(orgId) : db;

    const holder = accountHolderName || customer.fullName;
    try {
      await client.query(
        `UPDATE customers 
         SET bank_name = $1, 
             bank_account_number = $2, 
             bank_ifsc_code = $3, 
             bank_account_holder_name = $4,
             updated_at = NOW()
         WHERE id = $5;`,
        [bankName, cleanAcc, cleanIfsc, holder, customerId]
      );
    } catch {
      await db.query(
        `UPDATE customers 
         SET bank_name = $1, 
             bank_account_number = $2, 
             bank_ifsc_code = $3, 
             bank_account_holder_name = $4,
             updated_at = NOW()
         WHERE id = $5;`,
        [bankName, cleanAcc, cleanIfsc, holder, customerId]
      );
    }

    const mask = cleanAcc.length >= 4 ? `XXXX-XXXX-${cleanAcc.slice(-4)}` : 'XXXX';
    res.json({
      success: true,
      message: 'Bank beneficiary details updated successfully.',
      data: {
        bankName,
        accountNumberMask: mask,
        ifscCode: cleanIfsc,
        accountHolderName: holder,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const customerRoutes = router;
