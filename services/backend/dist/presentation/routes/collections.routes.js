import { Router } from 'express';
import { GetActiveShiftSessionUseCase, OpenShiftSessionUseCase, CloseShiftSessionUseCase, ReopenShiftSessionUseCase, ProcessMilkIntakeUseCase, BulkCollectionSyncUseCase, GetCustomerCollectionHistoryUseCase, GetMonthlyMilkSummaryUseCase, } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository, PostgresCustomerMembershipRepository, PostgresShiftSessionRepository, PostgresCollectionTransactionRepository, PostgresRateChartRepository, PostgresLedgerRepository, } from '../../infrastructure/index.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
import { offlineSessionAuthService } from '../../infrastructure/security/OfflineSessionAuthorizationService.js';
import { realtimePublisher } from '../../infrastructure/realtime/RealtimeEventPublisher.js';
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const membershipRepo = new PostgresCustomerMembershipRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();
const getActiveSessionUseCase = new GetActiveShiftSessionUseCase(sessionRepo);
const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
const closeSessionUseCase = new CloseShiftSessionUseCase(sessionRepo);
const reopenSessionUseCase = new ReopenShiftSessionUseCase(sessionRepo);
const processMilkIntakeUseCase = new ProcessMilkIntakeUseCase(customerRepo, sessionRepo, transactionRepo, rateChartRepo, ledgerRepo);
const bulkCollectionSyncUseCase = new BulkCollectionSyncUseCase(customerRepo, sessionRepo, transactionRepo);
const getHistoryUseCase = new GetCustomerCollectionHistoryUseCase(transactionRepo);
const getSummaryUseCase = new GetMonthlyMilkSummaryUseCase(transactionRepo);
// 1. Get all shift sessions for dairy
router.get('/sessions', authenticate, authorizePermission('collections:view_all', 'collections:view_session', 'sessions:active', 'sessions:read', 'sessions:manage'), async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy session query blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const query = `
      SELECT 
        s.id,
        s.session_code,
        s.organization_id,
        s.business_date,
        s.shift,
        s.status,
        s.opened_at,
        s.closed_at,
        s.opening_operator_id,
        s.closing_operator_id,
        s.device_identifier,
        s.device_name,
        s.total_liters,
        s.cow_liters,
        s.buffalo_liters,
        s.transaction_count,
        s.total_amount,
        s.average_fat,
        s.average_snf
      FROM kiosk_shift_sessions s
      WHERE s.organization_id = $1
      ORDER BY s.opened_at DESC;
    `;
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        const result = await tenantDb.query(query, [organizationId]);
        const sessions = result.rows.map((s) => ({
            id: s.id,
            sessionId: s.session_code,
            dairyId: s.organization_id,
            date: s.business_date instanceof Date ? s.business_date.toISOString().split('T')[0] : String(s.business_date),
            shift: s.shift,
            status: s.status,
            openedAt: s.opened_at ? new Date(s.opened_at).toISOString() : new Date().toISOString(),
            closedAt: s.closed_at ? new Date(s.closed_at).toISOString() : undefined,
            openingOperatorId: s.opening_operator_id,
            openingOperatorName: 'Counter Operator',
            closingOperatorId: s.closing_operator_id,
            closingOperatorName: s.closing_operator_id ? 'Counter Operator' : undefined,
            deviceId: s.device_identifier,
            deviceName: s.device_name || 'Counter Kiosk',
            totals: {
                transactionCount: Number(s.transaction_count) || 0,
                totalLiters: Number(s.total_liters) || 0,
                cowLiters: Number(s.cow_liters) || 0,
                buffaloLiters: Number(s.buffalo_liters) || 0,
                averageFat: Number(s.average_fat) || 0,
                averageSnf: Number(s.average_snf) || 0,
                totalAmount: Number(s.total_amount) || 0,
            },
            syncStatus: 'SYNCED',
        }));
        res.json({ success: true, count: sessions.length, data: sessions });
    }
    catch (err) {
        next(err);
    }
});
// 1b. Get active shift session
router.get('/sessions/active', authenticate, authorizePermission('sessions:active', 'sessions:open', 'collections:view_session', 'collections:view_all'), async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy active session lookup blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!organizationId || !operatorId) {
            res.status(400).json({ success: false, error: 'Authenticated dairy organization and operator context are required.' });
            return;
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        let centerId = req.user?.centerId ||
            req.query['centerId'] ||
            req.headers['x-center-id'];
        if (!centerId) {
            const cRes = await tenantDb.query(`SELECT id FROM dairy_centers WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`, [organizationId]);
            centerId = cRes.rows[0]?.id;
        }
        if (!centerId) {
            res.status(400).json({ success: false, error: 'Collection center ID (centerId) is required.' });
            return;
        }
        const deviceId = req.user?.deviceId || req.query['deviceId'] || req.headers['x-device-id'] || 'KIOSK_MAIN';
        const timezone = req.headers['x-timezone'] || req.query['timezone'] || undefined;
        const session = await getActiveSessionUseCase.execute({
            centerId,
            organizationId,
            operatorId,
            operatorName: req.user?.fullName || 'Counter Operator',
            deviceIdentifier: deviceId,
            timezone,
        });
        if (req.user?.organizationId && session.organizationId !== req.user.organizationId) {
            res.status(404).json({
                success: false,
                error: 'Active session not found for caller organization',
            });
            return;
        }
        const sessionData = session.toJSON();
        if (session.isOpen) {
            const offlineAuth = offlineSessionAuthService.generateAuthorization({
                organizationId: session.organizationId,
                centerId: session.centerId,
                sessionId: session.id,
                sessionCode: session.sessionCode,
                businessDate: session.businessDate,
                shift: session.shift,
                deviceIdentifier: session.deviceIdentifier,
                operatorId: session.openingOperatorId || operatorId,
                operatorName: session.openingOperatorName,
                timezone: session.timezone,
                validFrom: session.openedAt,
            });
            sessionData.offlineAuthorization = offlineAuth;
        }
        try {
            realtimePublisher.broadcast({
                eventId: `EVT-SESS-OPEN-${session.id}`,
                eventType: 'SESSION_OPENED',
                schemaVersion: 1,
                organizationId: session.organizationId,
                centerId: session.centerId,
                entityId: session.id,
                aggregateVersion: 1,
                occurredAt: session.openedAt,
                publishedAt: new Date().toISOString(),
                payload: {
                    sessionId: session.id,
                    sessionCode: session.sessionCode,
                    shift: session.shift,
                    businessDate: session.businessDate,
                    operatorName: session.openingOperatorName,
                    deviceIdentifier: session.deviceIdentifier,
                },
            });
        }
        catch { }
        res.json({
            success: true,
            data: sessionData,
        });
    }
    catch (err) {
        next(err);
    }
});
// 2. Open new shift session
const handleOpenSession = async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy shift session open blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!organizationId || !operatorId) {
            res.status(400).json({ success: false, error: 'Authenticated dairy organization and operator context are required.' });
            return;
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        let centerId = req.user?.centerId || req.body?.centerId || req.headers['x-center-id'];
        if (!centerId) {
            const cRes = await tenantDb.query(`SELECT id FROM dairy_centers WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`, [organizationId]);
            centerId = cRes.rows[0]?.id;
        }
        if (!centerId) {
            res.status(400).json({ success: false, error: 'Collection center ID (centerId) is required.' });
            return;
        }
        const deviceId = req.user?.deviceId || req.body?.deviceId || 'KIOSK_MAIN';
        const shift = req.body?.shift || 'MORNING';
        const timezone = req.headers['x-timezone'] || req.body?.timezone || undefined;
        const session = await openSessionUseCase.execute({
            centerId,
            organizationId,
            operatorId,
            operatorName: req.body?.operatorName || req.user?.fullName || 'Counter Operator',
            shift,
            businessDate: req.body?.businessDate,
            deviceIdentifier: deviceId,
            timezone,
        });
        const sessionData = session.toJSON();
        if (session.isOpen) {
            const offlineAuth = offlineSessionAuthService.generateAuthorization({
                organizationId: session.organizationId,
                centerId: session.centerId,
                sessionId: session.id,
                sessionCode: session.sessionCode,
                businessDate: session.businessDate,
                shift: session.shift,
                deviceIdentifier: session.deviceIdentifier,
                operatorId: session.openingOperatorId || operatorId,
                operatorName: session.openingOperatorName,
                timezone: session.timezone,
                validFrom: session.openedAt,
            });
            sessionData.offlineAuthorization = offlineAuth;
        }
        try {
            realtimePublisher.broadcast({
                eventId: `EVT-SESS-OPEN-${session.id}`,
                eventType: 'SESSION_OPENED',
                schemaVersion: 1,
                organizationId: session.organizationId,
                centerId: session.centerId,
                entityId: session.id,
                aggregateVersion: 1,
                occurredAt: session.openedAt,
                publishedAt: new Date().toISOString(),
                payload: {
                    sessionId: session.id,
                    sessionCode: session.sessionCode,
                    shift: session.shift,
                    businessDate: session.businessDate,
                    operatorName: session.openingOperatorName,
                    deviceIdentifier: session.deviceIdentifier,
                },
            });
        }
        catch { }
        res.status(201).json({
            success: true,
            message: `Shift session ${session.sessionCode} opened successfully.`,
            data: sessionData,
        });
    }
    catch (err) {
        next(err);
    }
};
router.post('/sessions/open', authenticate, authorizePermission('sessions:open', 'sessions:manage'), handleOpenSession);
router.post('/sessions', authenticate, authorizePermission('sessions:open', 'sessions:manage'), handleOpenSession);
router.patch('/sessions/:sessionId/open', authenticate, authorizePermission('sessions:open', 'sessions:manage'), handleOpenSession);
// 3. Close active shift session
const handleCloseSession = async (req, res, next) => {
    try {
        const rawSessionCode = req.params.sessionId || req.body?.sessionCode || req.body?.sessionId;
        const sessionCode = Array.isArray(rawSessionCode) ? rawSessionCode[0] : rawSessionCode;
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy shift session close blocked.' });
            return;
        }
        const operatorId = req.user?.userId;
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!operatorId || !organizationId) {
            res.status(400).json({ success: false, error: 'Authenticated dairy organization and operator context are required.' });
            return;
        }
        const session = await closeSessionUseCase.execute({
            sessionCode,
            operatorId,
            operatorName: req.body?.operatorName || req.user?.fullName || 'Counter Operator',
            organizationId,
        });
        try {
            realtimePublisher.broadcast({
                eventId: `EVT-SESS-CLOSE-${session.id}`,
                eventType: 'SESSION_CLOSED',
                schemaVersion: 1,
                organizationId: session.organizationId,
                centerId: session.centerId,
                entityId: session.id,
                aggregateVersion: 1,
                occurredAt: session.closedAt || new Date().toISOString(),
                publishedAt: new Date().toISOString(),
                payload: {
                    sessionId: session.id,
                    sessionCode: session.sessionCode,
                    shift: session.shift,
                    businessDate: session.businessDate,
                    totalLiters: session.totals.totalLiters,
                    transactionCount: session.totals.transactionCount,
                    totalAmount: session.totals.totalAmount,
                },
            });
        }
        catch { }
        res.json({
            success: true,
            message: `Shift session ${sessionCode} closed successfully.`,
            data: session.toJSON(),
        });
    }
    catch (err) {
        next(err);
    }
};
router.post('/sessions/:sessionId/close', authenticate, authorizePermission('sessions:close', 'sessions:manage'), handleCloseSession);
router.patch('/sessions/:sessionId/close', authenticate, authorizePermission('sessions:close', 'sessions:manage'), handleCloseSession);
router.post('/sessions/close', authenticate, authorizePermission('sessions:close', 'sessions:manage'), handleCloseSession);
router.patch('/sessions/close', authenticate, authorizePermission('sessions:close', 'sessions:manage'), handleCloseSession);
// 3. Reopen Concluded Shift Session
const handleReopenSession = async (req, res, next) => {
    try {
        const rawCode = req.params['sessionCode'] || req.params['sessionId'] || req.body?.sessionCode || req.body?.sessionId;
        const sessionCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy shift session reopen blocked.' });
            return;
        }
        const orgId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!sessionCode || !orgId || !operatorId) {
            res.status(400).json({ success: false, error: 'Session code, organizationId, and operatorId are required to reopen shift session' });
            return;
        }
        const session = await reopenSessionUseCase.execute({
            sessionCode,
            operatorId,
            operatorName: req.body?.operatorName || req.user?.fullName || 'Counter Operator',
            organizationId: orgId,
        });
        res.json({
            success: true,
            message: `Shift session ${sessionCode} reopened successfully.`,
            data: session.toJSON(),
        });
    }
    catch (err) {
        next(err);
    }
};
router.post('/sessions/:sessionCode/reopen', authenticate, authorizePermission('sessions:manage', 'sessions:open'), handleReopenSession);
router.patch('/sessions/:sessionCode/reopen', authenticate, authorizePermission('sessions:manage', 'sessions:open'), handleReopenSession);
router.post('/sessions/reopen', authenticate, authorizePermission('sessions:manage', 'sessions:open'), handleReopenSession);
// 4. Atomic Milk Intake Transaction
const handleIntakeTransaction = async (req, res, next) => {
    try {
        const body = req.body;
        const operatorId = req.user?.userId;
        if (!operatorId) {
            res.status(401).json({ success: false, error: 'Authenticated operator ID is required' });
            return;
        }
        const requestedOrgId = req.body?.organizationId ||
            req.body?.dairyId ||
            req.headers['x-organization-id'] ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy collection blocked: Organization mismatch' });
            return;
        }
        const resolvedOrgId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!resolvedOrgId) {
            res.status(400).json({ success: false, error: 'Authenticated organization context is required for milk collection' });
            return;
        }
        const customer = await customerRepo.findById(body.customerId, resolvedOrgId);
        if (!customer) {
            res.status(404).json({ success: false, error: `Customer ${body.customerId} not found` });
            return;
        }
        // Strict multi-dairy isolation: verify customer belongs to operator's dairy
        if (customer.organizationId !== resolvedOrgId) {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy collection blocked: Customer does not belong to authorized dairy.',
            });
            return;
        }
        const result = await processMilkIntakeUseCase.execute({
            organizationId: resolvedOrgId,
            sessionId: body.sessionId,
            sessionCode: body.sessionCode,
            customerId: customer.id,
            milkCategory: body.milkCategory || body.category,
            weightLiters: Number(body.weightLiters || body.netWeight || body.quantity),
            fatPercentage: Number(body.fatPercentage || body.fat),
            snfPercentage: Number(body.snfPercentage || body.snf),
            clrDensity: body.clrDensity ? Number(body.clrDensity) : undefined,
            identificationMethod: body.identificationMethod || 'MANUAL_SEARCH',
            deviceId: body.deviceId || 'KIOSK_MAIN',
            operatorId,
            operatorName: req.user?.fullName || 'Counter Operator',
            idempotencyKey: body.idempotencyKey || req.headers['idempotency-key'],
        });
        res.status(201).json({
            success: true,
            data: result.transaction.toJSON(),
            receiptNumber: result.receiptNumber,
            customerId: customer.id,
            farmerId: customer.id,
            farmerCode: customer.farmerCode,
            farmerName: customer.fullName,
            customerBalanceAfter: result.customerBalanceAfter,
            isIdempotentReplay: result.isIdempotentReplay,
        });
    }
    catch (err) {
        next(err);
    }
};
router.post('/transactions', authenticate, authorizePermission('collections:intake'), handleIntakeTransaction);
router.post('/intake', authenticate, authorizePermission('collections:intake'), handleIntakeTransaction);
// 4c. Bulk Offline Collection Synchronization Gateway (Prompt 4)
const handleBulkSync = async (req, res, next) => {
    try {
        const orgId = req.user?.organizationId;
        const operatorId = req.user?.userId;
        if (!orgId || !operatorId) {
            res.status(401).json({ success: false, error: 'Authenticated organization and operator context is required for bulk sync' });
            return;
        }
        const requestedOrgId = req.headers['x-organization-id'] ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.body?.organizationId ||
            req.body?.dairyId;
        if (requestedOrgId && requestedOrgId !== orgId) {
            res.status(403).json({ success: false, error: 'Cross-tenant bulk sync blocked: Organization ID mismatch' });
            return;
        }
        const operatorName = req.user?.fullName || 'Counter Operator';
        const authenticatedDeviceId = req.user?.deviceId;
        const requestId = req.headers['x-request-id'] || `req-${Date.now().toString(36)}`;
        const { batchId, schemaVersion, deviceId, transactions } = req.body;
        if (!Array.isArray(transactions)) {
            res.status(400).json({ success: false, error: 'Invalid batch: transactions must be an array' });
            return;
        }
        const result = await bulkCollectionSyncUseCase.execute({
            organizationId: orgId,
            operatorId,
            operatorName,
            authenticatedDeviceId,
            requestId,
            batch: {
                batchId: batchId || `batch-${Date.now().toString(36)}`,
                schemaVersion: schemaVersion || 1,
                deviceId: deviceId || 'KIOSK_MAIN',
                transactions,
            },
        });
        res.status(200).json({
            success: true,
            ...result,
        });
    }
    catch (err) {
        if (err.statusCode === 413 || err.code === 'BATCH_SIZE_EXCEEDED') {
            res.status(413).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
};
router.post('/sync/bulk', authenticate, authorizePermission('collections:intake'), handleBulkSync);
router.post('/bulk', authenticate, authorizePermission('collections:intake'), handleBulkSync);
// 4b. All Dairy-Scoped Transactions (Dairy Admin & Kiosk Register)
const handleGetTransactions = async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy transaction query blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const { date, sessionId } = req.query;
        let effectiveCustomerId = req.query['customerId'];
        if (req.user?.role === 'FARMER_CUSTOMER') {
            if (effectiveCustomerId && effectiveCustomerId !== req.user.userId) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own transactions.',
                });
                return;
            }
            effectiveCustomerId = req.user.userId;
        }
        let query = `
      SELECT 
        mc.id,
        mc.session_id,
        mc.customer_id,
        mc.business_date,
        mc.shift_type,
        mc.milk_category,
        mc.net_weight,
        mc.fat_percentage,
        mc.snf_percentage,
        mc.rate_chart_version_id,
        mc.applied_rate_per_unit,
        mc.total_amount,
        mc.transaction_status,
        mc.client_intake_uuid,
        mc.created_at,
        c.farmer_code,
        c.full_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      WHERE c.organization_id = $1
    `;
        const params = [organizationId];
        if (effectiveCustomerId) {
            params.push(effectiveCustomerId);
            query += ` AND (mc.customer_id = $${params.length} OR c.global_customer_id = $${params.length})`;
        }
        if (date) {
            params.push(date);
            query += ` AND mc.business_date = $${params.length}`;
        }
        if (sessionId) {
            params.push(sessionId);
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sessionId));
            if (isUuid) {
                query += ` AND (
          mc.session_id = $${params.length}
          OR (
            mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE id = $${params.length} LIMIT 1)
            AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE id = $${params.length} LIMIT 1)
            AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE id = $${params.length} LIMIT 1)
          )
        )`;
            }
            else {
                query += ` AND (
          mc.center_id = (SELECT center_id FROM kiosk_shift_sessions WHERE session_code = $${params.length} LIMIT 1)
          AND mc.business_date = (SELECT business_date FROM kiosk_shift_sessions WHERE session_code = $${params.length} LIMIT 1)
          AND mc.shift_type = (SELECT shift FROM kiosk_shift_sessions WHERE session_code = $${params.length} LIMIT 1)
        )`;
            }
        }
        query += ` ORDER BY mc.created_at DESC LIMIT 200;`;
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        const result = await tenantDb.query(query, params);
        const txns = result.rows.map((t) => ({
            id: t.id,
            transactionId: t.client_intake_uuid ? `TXN-${String(t.client_intake_uuid).slice(0, 8)}` : `TXN-${t.id.slice(0, 8)}`,
            transactionCode: t.client_intake_uuid ? `TXN-${String(t.client_intake_uuid).slice(0, 8)}` : `TXN-${t.id.slice(0, 8)}`,
            dairyId: organizationId,
            sessionId: t.session_id,
            customerId: t.customer_id,
            customerCode: t.farmer_code || 'C-100',
            customerName: t.full_name || 'Farmer',
            timestamp: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
            date: t.business_date instanceof Date ? t.business_date.toISOString().split('T')[0] : String(t.business_date),
            shift: t.shift_type,
            milkCategory: t.milk_category,
            weightLiters: Number(t.net_weight),
            fatPercentage: Number(t.fat_percentage),
            snfPercentage: Number(t.snf_percentage),
            appliedRatePerLiter: Number(t.applied_rate_per_unit),
            rateChartVersion: 1,
            rateChartId: t.rate_chart_version_id || 'rc-default-01',
            totalAmount: Number(t.total_amount),
            deviceId: 'KIOSK_MAIN',
            operatorId: req.user?.userId || t.operator_id || undefined,
            operatorName: 'Counter Operator',
            identificationMethod: 'FACE_YUNET_SFACE',
            status: t.transaction_status === 'COMPLETED' ? 'CONFIRMED' : t.transaction_status,
            syncState: 'SYNCED',
        }));
        res.json({ success: true, count: txns.length, data: txns });
    }
    catch (err) {
        next(err);
    }
};
router.get('/transactions', authenticate, authorizePermission('collections:view_all', 'collections:view_session', 'passbook:view_own'), handleGetTransactions);
router.get('/transactions/recent', authenticate, authorizePermission('collections:view_all', 'collections:view_session', 'passbook:view_own'), handleGetTransactions);
// 4c. Non-Destructive Weight/Amount Adjustment with Ledger Diff
router.post('/transactions/:id/adjust', authenticate, authorizePermission('collections:review_exceptions', 'sessions:manage', 'billing:manage'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newWeight, reason, operatorName } = req.body;
        const parsedWeight = Number(newWeight);
        if (!parsedWeight || parsedWeight <= 0) {
            res.status(400).json({ success: false, error: 'A valid positive new weight is required' });
            return;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.body?.organizationId;
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy transaction adjustment blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        const txnRes = await tenantDb.query(`SELECT mc.*, c.organization_id AS cust_org_id
         FROM milk_collections mc
         JOIN customers c ON c.id = mc.customer_id
         WHERE mc.id = $1 AND c.organization_id = $2`, [id, organizationId]);
        if (txnRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Collection transaction not found' });
            return;
        }
        const txn = txnRes.rows[0];
        if (organizationId && txn.cust_org_id !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy transaction adjustment blocked.' });
            return;
        }
        const oldWeight = Number(txn.net_weight);
        const rate = Number(txn.applied_rate_per_unit);
        const newAmount = Number((parsedWeight * rate).toFixed(2));
        const diffAmount = newAmount - Number(txn.total_amount);
        await tenantDb.query(`UPDATE milk_collections 
         SET net_weight = $1, total_amount = $2, transaction_status = 'ADJUSTED'
         WHERE id = $3;`, [parsedWeight, newAmount, id]);
        // If amount changed, post adjustment to customer ledger
        if (diffAmount !== 0) {
            const entryType = diffAmount > 0 ? 'CREDIT' : 'DEBIT';
            const absDiff = Math.abs(diffAmount);
            await ledgerRepo.appendEntry({
                organizationId,
                customerId: txn.customer_id,
                operatorId: req.user.userId,
                entryType,
                amount: absDiff,
                balanceAfter: 0,
                referenceId: typeof id === 'string' ? id : String(id),
                sourceModule: 'COLLECTION_ADJUSTMENT',
                description: `Weight adjusted from ${oldWeight}L to ${parsedWeight}L by ${operatorName || req.user?.fullName || 'Admin'}: ${reason || 'Correction'}`,
            });
        }
        res.json({
            success: true,
            message: `Transaction ${id} adjusted to ${parsedWeight}L (₹${newAmount}) successfully.`,
            data: {
                id,
                weightLiters: parsedWeight,
                totalAmount: newAmount,
                status: 'ADJUSTED',
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 4d. Dairy Quality Readings Register
router.get('/quality/readings', authenticate, authorizePermission('collections:view_all', 'collections:view_session', 'hardware:kiosk_read'), async (req, res, next) => {
    try {
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy quality reading lookup blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const query = `
      SELECT 
        mc.id,
        mc.created_at,
        mc.business_date,
        mc.shift_type,
        mc.milk_category,
        mc.fat_percentage,
        mc.snf_percentage,
        mc.net_weight,
        c.farmer_code,
        c.full_name
      FROM milk_collections mc
      JOIN customers c ON c.id = mc.customer_id
      WHERE c.organization_id = $1
      ORDER BY mc.created_at DESC
      LIMIT 100;
    `;
        const tenantDb = await tenantDbManager.getStrictTenantDb(organizationId);
        const result = await tenantDb.query(query, [organizationId]);
        const readings = result.rows.map((r) => ({
            id: r.id,
            timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            customerId: r.farmer_code || 'C-100',
            customerName: r.full_name || 'Farmer',
            shift: r.shift_type,
            milkCategory: r.milk_category,
            fatPercentage: Number(r.fat_percentage),
            snfPercentage: Number(r.snf_percentage),
            clrDensity: 28.5,
            weightLiters: Number(r.net_weight),
            validationStatus: 'VALID',
            readingSource: 'HARDWARE_INTERFACE',
        }));
        res.json({ success: true, count: readings.length, data: readings });
    }
    catch (err) {
        next(err);
    }
});
// 5. Customer Delivery History (Farmer App)
router.get('/history', authenticate, authorizePermission('passbook:view_own', 'collections:view_all', 'collections:view_session'), async (req, res, next) => {
    try {
        let customerId = req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.query['customerId'];
            if (queryId && queryId !== req.user.userId && (!req.user.globalCustomerId || queryId !== req.user.globalCustomerId)) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own delivery history.',
                });
                return;
            }
        }
        else {
            customerId = req.query['customerId'] || req.user?.userId;
        }
        const page = Math.max(1, Number(req.query['page'] || 1));
        const limit = Math.max(1, Number(req.query['limit'] || req.query['pageSize'] || 50));
        const offset = req.query['offset'] !== undefined ? Number(req.query['offset']) : (page - 1) * limit;
        const scope = String(req.query['scope'] || '').toLowerCase();
        // Explicit consolidated multi-dairy history via authoritative central membership index only
        if (scope === 'consolidated' && req.user?.role === 'FARMER_CUSTOMER') {
            if (!req.user.globalCustomerId) {
                res.status(400).json({
                    success: false,
                    code: 'MISSING_GLOBAL_IDENTITY',
                    error: 'Global customer identity is required for consolidated multi-dairy history.',
                });
                return;
            }
            const memberships = await membershipRepo.listMembershipsByGlobalId(req.user.globalCustomerId);
            const authorizedMemberships = memberships
                .filter((m) => m.membershipStatus === 'APPROVED')
                .map((m) => ({
                organizationId: m.organizationId,
                tenantCustomerId: m.tenantCustomerId,
                dairyName: m.dairyName,
            }));
            const consolidated = await transactionRepo.listConsolidatedForMemberships({
                memberships: authorizedMemberships,
                limit,
                offset,
            });
            res.json({
                success: true,
                partial: consolidated.partial,
                unavailableDairies: consolidated.unavailableDairies,
                data: consolidated.transactions.map((r) => r.toJSON()),
            });
            return;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy collection history query blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const data = await getHistoryUseCase.execute(customerId, limit, offset, organizationId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
// 6. Monthly Milk Summary (Farmer App)
router.get('/summary/monthly', authenticate, authorizePermission('passbook:view_own', 'collections:view_all', 'collections:view_session'), async (req, res, next) => {
    try {
        let customerId = req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.query['customerId'];
            if (queryId && queryId !== req.user.userId && (!req.user.globalCustomerId || queryId !== req.user.globalCustomerId)) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-customer query blocked: customer can only view their own summary.',
                });
                return;
            }
        }
        else {
            customerId = req.query['customerId'] || req.user?.userId;
        }
        const requestedOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
        if (requestedOrgId && req.user?.organizationId && requestedOrgId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy monthly summary query blocked.' });
            return;
        }
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (requestedOrgId || req.user?.organizationId)
            : req.user?.organizationId;
        if (!organizationId) {
            res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
            return;
        }
        const monthYear = req.query['monthYear'];
        const data = await getSummaryUseCase.execute(customerId, monthYear, organizationId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
export const collectionRoutes = router;
//# sourceMappingURL=collections.routes.js.map