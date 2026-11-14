import { Router } from 'express';
import { ReconciliationController } from './reconciliation.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import {
  BankStatementImportSchema,
  ResolveReconciliationSchema,
} from '@dfarm/shared-validation';

export const reconciliationRouter = Router();

// Gateway Webhook (Protected by HMAC signature and timestamp verification)
reconciliationRouter.post(
  '/webhook',
  ReconciliationController.handleWebhook
);

// All other reconciliation endpoints require Staff Authentication
reconciliationRouter.use(authenticate);

// 1. Import Bank Statement CSV
reconciliationRouter.post(
  '/import',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  validateRequest({ body: BankStatementImportSchema }),
  ReconciliationController.importBankStatement
);

// 2. Query Reconciliation Records
reconciliationRouter.get(
  '/',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  ReconciliationController.getRecords
);

// 3. Resolve Reconciliation Discrepancy
reconciliationRouter.post(
  '/:recordId/resolve',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  validateRequest({ body: ResolveReconciliationSchema }),
  ReconciliationController.resolveRecord
);

