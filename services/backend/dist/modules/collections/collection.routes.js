import { Router } from 'express';
import { CollectionService } from './collection.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole, requireCustomerOwnership } from '../../middleware/authorize.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { UserRole, Shift } from '@dfarm/shared-types';
export const collectionRouter = Router();
collectionRouter.use(authenticate);
/**
 * POST /api/v1/collections/sessions
 * Initializes a new collection session.
 */
collectionRouter.post('/sessions', async (req, res, next) => {
    try {
        const result = await CollectionService.createSession(req.body, req.auth);
        ApiResponse.success(res, result, 201);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/collections/sessions/:sessionId/measurements
 * Ingests measurements into session.
 */
collectionRouter.post('/sessions/:sessionId/measurements', async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const result = await CollectionService.recordMeasurements(sessionId, req.body, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/collections/sessions/:sessionId/validate
 * Validates session measurements.
 */
collectionRouter.post('/sessions/:sessionId/validate', async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const result = await CollectionService.recordMeasurements(sessionId, req.body, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/collections/sessions/:sessionId/complete
 * Atomically completes collection session and posts double-entry ledger entries.
 */
collectionRouter.post('/sessions/:sessionId/complete', async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const result = await CollectionService.completeSession(sessionId, req.body, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/collections/sessions/:sessionId/cancel
 * Cancels active collection session with audit reason.
 */
collectionRouter.post('/sessions/:sessionId/cancel', async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const { reason } = req.body;
        const result = await CollectionService.cancelSession(sessionId, reason, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/collections/sessions/:sessionId/adjust
 * Supervisor correction or reversal with audit trail.
 */
collectionRouter.post('/sessions/:sessionId/adjust', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.SUPERVISOR]), async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const result = await CollectionService.adjustCollection(sessionId, req.body, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/collections/sessions/:sessionId/receipt
 * Retrieves 40-column thermal slip text.
 */
collectionRouter.get('/sessions/:sessionId/receipt', async (req, res, next) => {
    try {
        const sessionId = (req.params['sessionId'] || '');
        const receiptText = await CollectionService.getReceiptText(sessionId, req.auth);
        ApiResponse.success(res, { receiptText });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/collections/shift-summary
 */
collectionRouter.get('/shift-summary', async (req, res, next) => {
    try {
        const centerId = (req.query['centerId'] || req.auth?.primaryCenterId || '');
        const shift = req.query['shift'] || Shift.MORNING;
        const date = (req.query['date'] || new Date().toISOString().split('T')[0]);
        const summary = await CollectionService.getShiftSummary(centerId, shift, date, req.auth);
        ApiResponse.success(res, summary);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/collections/history
 */
collectionRouter.get('/history', async (req, res, next) => {
    try {
        const centerId = (req.query['centerId'] || req.auth?.primaryCenterId || '');
        const date = req.query['date'] ? req.query['date'].trim() : undefined;
        const shift = req.query['shift'];
        const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : undefined;
        const history = await CollectionService.getHistory(centerId, date, shift, req.auth, limit);
        ApiResponse.success(res, history);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/collections/customer/:customerId
 * Customer milk collection history (P18 Mobile App restricted access).
 */
collectionRouter.get('/customer/:customerId', requireCustomerOwnership(req => req.params['customerId']), async (req, res, next) => {
    try {
        const customerId = req.params['customerId'];
        const filters = {
            startDate: req.query['startDate'],
            endDate: req.query['endDate'],
            category: req.query['category'],
            shift: req.query['shift'],
            limit: req.query['limit'] ? parseInt(req.query['limit'], 10) : 50,
            offset: req.query['offset'] ? parseInt(req.query['offset'], 10) : 0,
        };
        const result = await CollectionService.getCustomerCollections(customerId, filters, req.auth);
        ApiResponse.success(res, result);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=collection.routes.js.map