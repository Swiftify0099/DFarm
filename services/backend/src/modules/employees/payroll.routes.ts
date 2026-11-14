import { Router } from 'express';
import { PayrollController } from './payroll.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';

const router = Router();

router.use(authenticate);

// Lifecycle
router.post(
  '/',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.ACCOUNTANT]),
  PayrollController.initiatePayrollRun
);

router.post(
  '/:id/calculate',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.ACCOUNTANT]),
  PayrollController.calculatePayrollRun
);

router.post(
  '/:id/approve',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  PayrollController.approvePayrollRun
);

router.post(
  '/:id/finalize',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  PayrollController.finalizePayrollRun
);

router.post(
  '/payments',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.ACCOUNTANT]),
  PayrollController.recordSalaryPayment
);

router.get(
  '/',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.CENTER_MANAGER,
  ]),
  PayrollController.listPayrollRuns
);

router.get(
  '/:id',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.CENTER_MANAGER,
  ]),
  PayrollController.getPayrollRun
);

router.get(
  '/payslips/:id',
  PayrollController.getPayslip
);

export const payrollRouter = router;
