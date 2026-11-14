import { Router } from 'express';
import { LedgerController } from './ledger.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import { CustomerLedgerQuerySchema, CustomerStatementQuerySchema, CreateAdvanceSchema, ApproveAdvanceSchema, RejectAdvanceSchema, RecoverAdvanceSchema, CreateDeductionSchema, CreateOpeningBalanceSchema, CreateAdjustmentSchema, ReconcileQuerySchema, LedgerAccountsQuerySchema, ReportFilterSchema, } from './ledger.schemas.js';
// 1. Router for /api/v1/ledger
export const ledgerRouter = Router();
ledgerRouter.use(authenticate);
// Financial Reports (Must be registered before parameterized :customerId routes)
ledgerRouter.get('/reports/balances', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]), validateRequest({ query: ReportFilterSchema }), LedgerController.getBalancesReport);
ledgerRouter.get('/reports/daily-summary', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ query: ReportFilterSchema }), LedgerController.getDailySummaryReport);
ledgerRouter.get('/reports/center-liabilities', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]), validateRequest({ query: ReportFilterSchema }), LedgerController.getCenterLiabilitiesReport);
ledgerRouter.get('/reports/advances', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ query: ReportFilterSchema }), LedgerController.getOutstandingAdvancesReport);
ledgerRouter.get('/reports/register', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]), validateRequest({ query: ReportFilterSchema }), LedgerController.getTransactionRegisterReport);
// Account List
ledgerRouter.get('/accounts', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ query: LedgerAccountsQuerySchema }), LedgerController.getAccounts);
// Account Reconciliation
ledgerRouter.post('/reconcile', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ body: ReconcileQuerySchema }), LedgerController.reconcile);
// Advance Approvals, Rejections & Recoveries
ledgerRouter.post('/advances/:advanceId/approve', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]), validateRequest({ body: ApproveAdvanceSchema }), LedgerController.approveAdvance);
ledgerRouter.post('/advances/:advanceId/reject', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]), validateRequest({ body: RejectAdvanceSchema }), LedgerController.rejectAdvance);
ledgerRouter.post('/advances/:advanceId/recover', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR, UserRole.COLLECTION_OPERATOR]), validateRequest({ body: RecoverAdvanceSchema }), LedgerController.recoverAdvance);
// Feed Purchase Debit Contract Integration
ledgerRouter.post('/feed-debit', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.INVENTORY_MANAGER, UserRole.ACCOUNTANT]), LedgerController.processFeedPurchase);
const FINANCIAL_REPORT_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
];
// Customer-specific Ledger Actions under /api/v1/ledger/:customerId
ledgerRouter.get('/:customerId/summary', requireCustomerOwnership(req => req.params['customerId']), LedgerController.getSummary);
ledgerRouter.get('/:customerId/transactions', requireCustomerOwnership(req => req.params['customerId'], FINANCIAL_REPORT_ROLES), validateRequest({ query: CustomerLedgerQuerySchema }), LedgerController.getTransactions);
ledgerRouter.post('/:customerId/advances', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ body: CreateAdvanceSchema }), LedgerController.createAdvance);
ledgerRouter.post('/:customerId/deductions', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT, UserRole.SUPERVISOR]), validateRequest({ body: CreateDeductionSchema }), LedgerController.createDeduction);
ledgerRouter.post('/:customerId/opening-balance', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER]), validateRequest({ body: CreateOpeningBalanceSchema }), LedgerController.createOpeningBalance);
ledgerRouter.post('/:customerId/adjustments', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]), validateRequest({ body: CreateAdjustmentSchema }), LedgerController.createAdjustment);
// 2. Router for /api/v1/customers/:customerId/ledger* (Section 6 endpoints)
export const customerLedgerRouter = Router({ mergeParams: true });
customerLedgerRouter.use(authenticate);
customerLedgerRouter.get('/:customerId/ledger', requireCustomerOwnership(req => req.params['customerId'], FINANCIAL_REPORT_ROLES), validateRequest({ query: CustomerLedgerQuerySchema }), LedgerController.getCustomerLedger);
customerLedgerRouter.get('/:customerId/ledger/summary', requireCustomerOwnership(req => req.params['customerId']), LedgerController.getSummary);
customerLedgerRouter.get('/:customerId/ledger/transactions', requireCustomerOwnership(req => req.params['customerId'], FINANCIAL_REPORT_ROLES), validateRequest({ query: CustomerLedgerQuerySchema }), LedgerController.getTransactions);
customerLedgerRouter.get('/:customerId/ledger/statement', requireCustomerOwnership(req => req.params['customerId'], FINANCIAL_REPORT_ROLES), validateRequest({ query: CustomerStatementQuerySchema }), LedgerController.getStatement);
//# sourceMappingURL=ledger.routes.js.map