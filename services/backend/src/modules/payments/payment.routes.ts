import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { UserRole } from '@dfarm/shared-types';
import {
  CreatePayoutInputSchema,
  ApprovePayoutInputSchema,
  SubmitPayoutInputSchema,
  ConfirmPayoutInputSchema,
  FailPayoutInputSchema,
  ReversePayoutInputSchema,
  CreateReceiptInputSchema,
  ConfirmReceiptInputSchema,
  CreatePaymentBatchSchema,
  ReconcileBatchSchema,
} from '@dfarm/shared-validation';

export const paymentRouter = Router();

// Ephemeral Token Bank File Download (Pre-authenticated by token, browser stream compatible)
paymentRouter.get(
  '/batches/:batchId/download',
  PaymentController.downloadBatch
);

// All other payment routes require valid authentication
paymentRouter.use(authenticate);

// ----------------------------------------------------
// Farmer Payment Overview & Calculation (Prompt 7)
// ----------------------------------------------------

// Overview Metrics
paymentRouter.get(
  '/overview',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  PaymentController.getFarmerPaymentOverview
);

// Preview Settlement Payable Calculation for Period
paymentRouter.get(
  '/settlement/preview',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.calculateSettlementPreview
);

paymentRouter.post(
  '/settlement/preview',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.calculateSettlementPreview
);

// Beneficiary Bank Detail Management & Audit Logs
paymentRouter.get(
  '/beneficiaries/:customerId/history',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.getBeneficiaryAuditHistory
);

paymentRouter.put(
  '/beneficiaries/:customerId',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.updateBeneficiaryBankDetails
);

// Batch Workflow Actions (Prompt 7)
paymentRouter.post(
  '/batches/:batchId/review',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.submitForReview
);

paymentRouter.post(
  '/batches/:batchId/reject',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.SUPERVISOR,
  ]),
  PaymentController.rejectBatch
);

paymentRouter.post(
  '/batches/:batchId/submit-union-bank',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.submitBatchToUnionBank
);

paymentRouter.post(
  '/batches/:batchId/reconcile-union-bank',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.reconcileBatchWithUnionBank
);

paymentRouter.get(
  '/items/:itemId/status-inquiry',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  PaymentController.queryBatchItemStatus
);

paymentRouter.post(
  '/batches/:batchId/timeout',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.markBatchTimeout
);

// ----------------------------------------------------
// Individual Farmer Payouts
// ----------------------------------------------------

// 1. Create Payout Draft / Request
paymentRouter.post(
  '/payouts',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: CreatePayoutInputSchema }),
  PaymentController.createPayout
);

// 2. Approve Payout
paymentRouter.post(
  '/payouts/:payoutId/approve',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: ApprovePayoutInputSchema }),
  PaymentController.approvePayout
);

// 3. Submit Payout to Financial Channel
paymentRouter.post(
  '/payouts/:payoutId/submit',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: SubmitPayoutInputSchema }),
  PaymentController.submitPayout
);

// 4. Confirm / Settle Payout (Posts atomic ledger debit)
paymentRouter.post(
  '/payouts/:payoutId/confirm',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: ConfirmPayoutInputSchema }),
  PaymentController.confirmPayout
);

// 5. Fail Payout
paymentRouter.post(
  '/payouts/:payoutId/fail',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: FailPayoutInputSchema }),
  PaymentController.failPayout
);

// 6. Reverse Payout (Compensating reversal)
paymentRouter.post(
  '/payouts/:payoutId/reverse',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  validateRequest({ body: ReversePayoutInputSchema }),
  PaymentController.reversePayout
);

// ----------------------------------------------------
// Customer Repayment (Receipts - Farmer Pays Dairy)
// ----------------------------------------------------

// 7. Create Customer Receipt
paymentRouter.post(
  '/receipts',
  validateRequest({ body: CreateReceiptInputSchema }),
  PaymentController.createReceipt
);

// 8. Confirm Customer Receipt (Posts atomic ledger credit)
paymentRouter.post(
  '/receipts/:receiptId/confirm',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  validateRequest({ body: ConfirmReceiptInputSchema }),
  PaymentController.confirmReceipt
);

// 9. Get Receipt By ID
paymentRouter.get(
  '/receipts/:receiptId',
  PaymentController.getReceiptById
);

// ----------------------------------------------------
// Bulk Payment Batches
// ----------------------------------------------------

// 10. Create Bulk Batch
paymentRouter.post(
  '/batches',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  validateRequest({ body: CreatePaymentBatchSchema }),
  PaymentController.createBatch
);

// 11. Get Batch By ID
paymentRouter.get(
  '/batches/:batchId',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SUPERVISOR,
  ]),
  PaymentController.getBatchById
);

// 12. Approve Batch
paymentRouter.post(
  '/batches/:batchId/approve',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  PaymentController.approveBatch
);

// 13. Submit Batch
paymentRouter.post(
  '/batches/:batchId/submit',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.submitBatch
);

// 14. Reconcile Batch Beneficiaries
paymentRouter.post(
  '/batches/:batchId/reconcile',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  validateRequest({ body: ReconcileBatchSchema }),
  PaymentController.reconcileBatch
);

// 14b. Export Batch as Bank File (NEFT / SBI CMP)
paymentRouter.get(
  '/batches/:batchId/export',
  requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
  ]),
  PaymentController.exportBatch
);

// ----------------------------------------------------
// Customer Payment History & Receipt Slips
// ----------------------------------------------------

// 15. Customer Payment History
paymentRouter.get(
  '/customers/:customerId',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  PaymentController.getCustomerPayouts
);

// 16. Customer Payment Summary
paymentRouter.get(
  '/customers/:customerId/summary',
  requireCustomerOwnership(req => req.params['customerId'] as string),
  PaymentController.getCustomerPaymentSummary
);

// 17. Single Payment Details
paymentRouter.get(
  '/:paymentId',
  PaymentController.getPayoutById
);

// 18. Printable / Thermal Receipt Slip
paymentRouter.get(
  '/:paymentId/receipt',
  PaymentController.getPayoutReceipt
);

