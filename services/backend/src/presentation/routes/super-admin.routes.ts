import { Router, Request, Response, NextFunction } from 'express';
import { superAdminRepo } from '../../infrastructure/repositories/PostgresSuperAdminRepository.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();

function getParamId(req: Request, paramName = 'id'): string {
  const raw = req.params[paramName];
  if (Array.isArray(raw)) return raw[0] || '';
  return raw || '';
}

/**
 * Access Control Middleware for Platform Staff (Super Admin or Platform Operator)
 */
export function requirePlatformStaffRole(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication token required for Super Admin endpoints',
    });
    return;
  }

  const role = (req.user.role || '').toUpperCase();
  if (role !== 'SUPER_ADMIN' && role !== 'PLATFORM_OPERATOR' && role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Super Admin or Platform Operator privileges required',
    });
    return;
  }
  next();
}

/**
 * Access Control Middleware strictly requiring SUPER_ADMIN authority
 */
export function requireSuperAdminRole(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication token required for Super Admin endpoints',
    });
    return;
  }

  const role = (req.user.role || '').toUpperCase();
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Super Admin privileges required for this administrative operation',
    });
    return;
  }
  next();
}

// Attach token extraction and base platform staff role check
router.use(optionalAuthenticate);
router.use(requirePlatformStaffRole);

// ============================================================================
// 1. Dashboard Metrics & Analytics
// ============================================================================
router.get('/dashboard/metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await superAdminRepo.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard/analytics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const analytics = await superAdminRepo.getGlobalAnalytics();
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. Audit Trail
// ============================================================================
router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const logs = await superAdminRepo.getAuditLogs({ action, entityType, limit, offset });
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    next(err);
  }
});

router.post('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, entityType, entityId, details, status } = req.body;
    if (!action || !entityType || !entityId) {
      res.status(400).json({ success: false, error: 'action, entityType, and entityId are required.' });
      return;
    }

    await superAdminRepo.logAudit({
      actorId: req.user?.userId || '00000000-0000-0000-0000-000000000099',
      actorRole: req.user?.role || 'SUPER_ADMIN',
      actorName: req.user?.fullName || 'Super Administrator',
      action,
      entityType,
      entityId,
      details,
      status,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1',
    });

    res.status(201).json({ success: true, message: 'Audit entry recorded successfully' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. Platform Alerts
// ============================================================================
router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;

    const alerts = await superAdminRepo.listAlerts({ status, severity });
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    next(err);
  }
});

router.post('/alerts/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const result = await superAdminRepo.acknowledgeAlert(id, req.user?.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/alerts/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const result = await superAdminRepo.resolveAlert(id, req.user?.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. System & Cluster Health
// ============================================================================
router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await superAdminRepo.getSystemHealth();
    res.json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. Central Hardware Inventory
// ============================================================================
router.get('/hardware', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const dairyId = req.query.dairyId as string | undefined;

    const hardware = await superAdminRepo.listHardware({ status, category, dairyId });
    res.json({ success: true, count: hardware.length, data: hardware });
  } catch (err) {
    next(err);
  }
});

router.post('/hardware', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serialNumber, deviceCategory, manufacturer, model, warrantyUntil, notes } = req.body;
    if (!serialNumber || !deviceCategory || !manufacturer || !model) {
      res.status(400).json({
        success: false,
        error: 'serialNumber, deviceCategory, manufacturer, and model are required.',
      });
      return;
    }

    const device = await superAdminRepo.registerHardware(
      {
        serialNumber,
        deviceCategory,
        manufacturer,
        model,
        warrantyUntil,
        notes,
      },
      req.user?.userId
    );

    res.status(201).json({ success: true, data: device });
  } catch (err: any) {
    if (err.message && err.message.includes('already registered')) {
      res.status(409).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
});

router.post('/hardware/:id/assign', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { dairyId, notes } = req.body;
    if (!dairyId) {
      res.status(400).json({ success: false, error: 'dairyId is required to assign hardware.' });
      return;
    }

    const result = await superAdminRepo.assignHardware(id, dairyId, req.user?.userId, notes);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/hardware/:id/unassign', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { notes } = req.body;
    const result = await superAdminRepo.unassignHardware(id, req.user?.userId, notes);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/hardware/:id/status', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { status, notes } = req.body;
    if (!status) {
      res.status(400).json({ success: false, error: 'status is required.' });
      return;
    }

    const result = await superAdminRepo.updateHardwareStatus(id, status, req.user?.userId, notes);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. Central AMC Plans & Subscriptions
// ============================================================================
router.get('/amc/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await superAdminRepo.listAmcPlans();
    res.json({ success: true, count: plans.length, data: plans });
  } catch (err) {
    next(err);
  }
});

router.post('/amc/plans', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, durationMonths, priceInr, description } = req.body;
    if (!name || !durationMonths || priceInr === undefined) {
      res.status(400).json({
        success: false,
        error: 'name, durationMonths, and priceInr are required.',
      });
      return;
    }

    const plan = await superAdminRepo.createAmcPlan(
      {
        name,
        durationMonths: Number(durationMonths),
        priceInr: Number(priceInr),
        description,
      },
      req.user?.userId
    );

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
});

router.get('/amc/subscriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dairyId = req.query.dairyId as string | undefined;
    const subs = await superAdminRepo.listAmcSubscriptions(dairyId);
    res.json({ success: true, count: subs.length, data: subs });
  } catch (err) {
    next(err);
  }
});

router.post('/amc/subscriptions', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { dairyId, planId, startDate } = req.body;
    if (!dairyId || !planId) {
      res.status(400).json({ success: false, error: 'dairyId and planId are required.' });
      return;
    }

    const sub = await superAdminRepo.createAmcSubscription(
      {
        dairyId,
        planId,
        startDate,
      },
      req.user?.userId
    );

    res.status(201).json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/amc/subscriptions/:id/verify-payment', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayPaymentId) {
      res.status(400).json({ success: false, error: 'razorpayPaymentId is required to verify payment.' });
      return;
    }

    const result = await superAdminRepo.verifyAmcPayment(
      id,
      razorpayPaymentId,
      razorpaySignature || '',
      req.user?.userId
    );

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 7. Dairy Admins & Platform Users
// ============================================================================
router.get('/admins', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const dairyId = req.query.dairyId as string | undefined;

    const admins = await superAdminRepo.getAllDairyAdmins({ search, status, dairyId });
    res.json({ success: true, count: admins.length, data: admins });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await superAdminRepo.getPlatformUsers();
    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    next(err);
  }
});

router.post('/users', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, email, mobile, role } = req.body;
    if (!fullName || !email || !mobile || !role) {
      res.status(400).json({ success: false, error: 'fullName, email, mobile, and role are required.' });
      return;
    }
    const cleanRole = (role || '').toUpperCase();
    if (cleanRole !== 'SUPER_ADMIN' && cleanRole !== 'PLATFORM_OPERATOR') {
      res.status(400).json({ success: false, error: "role must be either 'SUPER_ADMIN' or 'PLATFORM_OPERATOR'." });
      return;
    }

    const newUser = await superAdminRepo.createPlatformUser(
      {
        fullName,
        email,
        mobile,
        role: cleanRole,
      },
      req.user?.userId
    );

    res.status(201).json({ success: true, data: newUser });
  } catch (err: any) {
    if (err.message && err.message.includes('unique')) {
      res.status(409).json({ success: false, error: 'A user with this mobile number or email already exists.' });
      return;
    }
    next(err);
  }
});

// ============================================================================
// 8. Platform Reports
// ============================================================================
router.post('/reports/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportType, startDate, endDate, dairyId, statusFilter } = req.body;
    if (!reportType) {
      res.status(400).json({ success: false, error: 'reportType is required.' });
      return;
    }

    const report = await superAdminRepo.generateReport(
      {
        reportType,
        startDate: startDate || new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
        endDate: endDate || new Date().toISOString(),
        dairyId,
        statusFilter,
      },
      req.user?.fullName
    );

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 9. Dairy Bank Details (Encrypted Storage & Masked Retrieval)
// ============================================================================
router.get('/dairies/:id/bank-details', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const details = await superAdminRepo.getDairyBankDetails(id);
    if (!details) {
      res.status(404).json({ success: false, error: 'Bank details not registered for this dairy.' });
      return;
    }
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
});

router.put('/dairies/:id/bank-details', requireSuperAdminRole, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { bankName, accountNumber, ifscCode, accountHolderName } = req.body;
    if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
      res.status(400).json({
        success: false,
        error: 'bankName, accountNumber, ifscCode, and accountHolderName are required.',
      });
      return;
    }

    const saved = await superAdminRepo.saveDairyBankDetails(
      {
        organizationId: id,
        bankName,
        accountNumber,
        ifscCode,
        accountHolderName,
      },
      req.user?.userId
    );

    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 10. Controlled Diagnostic Support Sessions
// ============================================================================
router.get('/support/active', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await superAdminRepo.getActiveSupportSession();
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

router.get('/support/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await superAdminRepo.getAllSupportSessions();
    res.json({ success: true, count: sessions.length, data: sessions });
  } catch (err) {
    next(err);
  }
});

router.post('/support/sessions', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dairyId, justificationReason, supportTicketRef, durationMinutes, authorizedScope } = req.body;
    if (!dairyId || !justificationReason || !durationMinutes || !authorizedScope) {
      res.status(400).json({
        success: false,
        error: 'dairyId, justificationReason, durationMinutes, and authorizedScope are required.',
      });
      return;
    }

    const session = await superAdminRepo.requestSupportSession(
      {
        dairyId,
        justificationReason,
        supportTicketRef,
        durationMinutes: Number(durationMinutes),
        authorizedScope,
      },
      {
        userId: req.user?.userId,
        fullName: req.user?.fullName,
      }
    );

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

router.post('/support/sessions/:id/revoke', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { reason } = req.body;
    const session = await superAdminRepo.revokeSupportSession(
      id,
      reason || 'Revoked by administrator',
      req.user?.userId,
      req.user?.fullName
    );
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 12. Global Rate Policy Management
// ============================================================================
router.get('/policies/rate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await superAdminRepo.listGlobalRatePolicies();
    res.json({ success: true, count: policies.length, data: policies });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/rate', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { policyCode, name, description, policyType } = req.body;
    if (!policyCode || !name) {
      res.status(400).json({ success: false, error: 'policyCode and name are required.' });
      return;
    }
    const policy = await superAdminRepo.createGlobalRatePolicy(
      { policyCode, name, description, policyType },
      req.user?.userId
    );
    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/rate/:id/versions', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { effectiveFrom, effectiveTo, parameters, changeSummary } = req.body;
    if (!effectiveFrom || !parameters) {
      res.status(400).json({ success: false, error: 'effectiveFrom and parameters are required.' });
      return;
    }
    const version = await superAdminRepo.createGlobalRatePolicyVersion(
      id,
      { effectiveFrom, effectiveTo, parameters, changeSummary },
      { userId: req.user?.userId, fullName: req.user?.fullName }
    );
    res.status(201).json({ success: true, data: version });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/rate/:id/versions/:vId/publish', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vId = getParamId(req, 'vId');
    const published = await superAdminRepo.publishGlobalRatePolicyVersion(vId, {
      userId: req.user?.userId,
      fullName: req.user?.fullName,
    });
    res.json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 13. Global FAT/SNF Adjustment Policy Management
// ============================================================================
router.get('/policies/fat-snf', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await superAdminRepo.listGlobalFatSnfPolicies();
    res.json({ success: true, count: policies.length, data: policies });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/fat-snf', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { policyCode, name, description } = req.body;
    if (!policyCode || !name) {
      res.status(400).json({ success: false, error: 'policyCode and name are required.' });
      return;
    }
    const policy = await superAdminRepo.createGlobalFatSnfPolicy(
      { policyCode, name, description },
      req.user?.userId
    );
    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/fat-snf/:id/versions', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamId(req);
    const { effectiveFrom, effectiveTo, milkCategory, fatAdjustmentRules, snfAdjustmentRules, roundingPolicy, changeSummary } = req.body;
    if (!effectiveFrom) {
      res.status(400).json({ success: false, error: 'effectiveFrom is required.' });
      return;
    }
    const version = await superAdminRepo.createGlobalFatSnfPolicyVersion(
      id,
      {
        effectiveFrom,
        effectiveTo,
        milkCategory,
        fatAdjustmentRules,
        snfAdjustmentRules,
        roundingPolicy,
        changeSummary,
      },
      { userId: req.user?.userId, fullName: req.user?.fullName }
    );
    res.status(201).json({ success: true, data: version });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/fat-snf/:id/versions/:vId/publish', requireSuperAdminRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vId = getParamId(req, 'vId');
    const published = await superAdminRepo.publishGlobalFatSnfPolicyVersion(vId, {
      userId: req.user?.userId,
      fullName: req.user?.fullName,
    });
    res.json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 14. Platform Settings
// ============================================================================
router.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await superAdminRepo.getPlatformSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

export const superAdminRoutes = router;
