import { Router } from 'express';
import { GetActiveShiftSessionUseCase, OpenShiftSessionUseCase, CloseShiftSessionUseCase, ReopenShiftSessionUseCase, ProcessMilkIntakeUseCase, GetCustomerCollectionHistoryUseCase, GetMonthlyMilkSummaryUseCase, } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository, PostgresShiftSessionRepository, PostgresCollectionTransactionRepository, PostgresRateChartRepository, PostgresLedgerRepository, } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const sessionRepo = new PostgresShiftSessionRepository();
const transactionRepo = new PostgresCollectionTransactionRepository();
const rateChartRepo = new PostgresRateChartRepository();
const ledgerRepo = new PostgresLedgerRepository();
const getActiveSessionUseCase = new GetActiveShiftSessionUseCase(sessionRepo);
const openSessionUseCase = new OpenShiftSessionUseCase(sessionRepo);
const closeSessionUseCase = new CloseShiftSessionUseCase(sessionRepo);
const reopenSessionUseCase = new ReopenShiftSessionUseCase(sessionRepo);
const processMilkIntakeUseCase = new ProcessMilkIntakeUseCase(customerRepo, sessionRepo, transactionRepo, rateChartRepo, ledgerRepo);
const getHistoryUseCase = new GetCustomerCollectionHistoryUseCase(transactionRepo);
const getSummaryUseCase = new GetMonthlyMilkSummaryUseCase(transactionRepo);
// 1. Get all shift sessions for dairy
router.get('/sessions', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
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
        const tenantDb = await tenantDbManager.getTenantDb(organizationId);
        let result;
        try {
            result = await tenantDb.query(query, [organizationId]);
        }
        catch {
            result = await db.query(query, [organizationId]);
        }
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
router.get('/sessions/active', optionalAuthenticate, async (req, res, next) => {
    try {
        const centerId = req.query['centerId'] ||
            req.headers['x-center-id'] ||
            req.user?.centerId ||
            '00000000-0000-0000-0000-000000000002';
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'] ||
            '00000000-0000-0000-0000-000000000001';
        const operatorId = req.query['operatorId'] ||
            req.headers['x-operator-id'] ||
            req.user?.userId ||
            '00000000-0000-0000-0000-000000000003';
        const deviceId = req.query['deviceId'] || req.headers['x-device-id'] || 'KIOSK_MAIN';
        const session = await getActiveSessionUseCase.execute({
            centerId,
            organizationId,
            operatorId,
            operatorName: req.user?.fullName || 'Counter Operator',
            deviceIdentifier: deviceId,
        });
        if (req.user?.organizationId && session.organizationId !== req.user.organizationId) {
            res.status(404).json({
                success: false,
                error: 'Active session not found for caller organization',
            });
            return;
        }
        res.json({
            success: true,
            data: session.toJSON(),
        });
    }
    catch (err) {
        next(err);
    }
});
// 2. Open new shift session
const handleOpenSession = async (req, res, next) => {
    try {
        const centerId = req.user?.centerId || req.body?.centerId || req.headers['x-center-id'] || '00000000-0000-0000-0000-000000000002';
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.headers['x-organization-id'] || req.body?.organizationId || '00000000-0000-0000-0000-000000000001';
        const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
        const deviceId = req.body?.deviceId || 'KIOSK_MAIN';
        const shift = req.body?.shift || 'MORNING';
        const businessDate = req.body?.businessDate || new Date().toISOString().split('T')[0];
        const session = await openSessionUseCase.execute({
            centerId,
            organizationId,
            operatorId,
            operatorName: req.body?.operatorName || req.user?.fullName || 'Counter Operator',
            shift,
            businessDate,
            deviceIdentifier: deviceId,
        });
        res.status(201).json({
            success: true,
            message: `Shift session ${session.sessionCode} opened successfully.`,
            data: session.toJSON(),
        });
    }
    catch (err) {
        next(err);
    }
};
router.post('/sessions/open', optionalAuthenticate, handleOpenSession);
router.post('/sessions', optionalAuthenticate, handleOpenSession);
router.patch('/sessions/:sessionId/open', optionalAuthenticate, handleOpenSession);
// 3. Close active shift session
const handleCloseSession = async (req, res, next) => {
    try {
        const sessionCode = req.params.sessionId || req.body?.sessionCode || req.body?.sessionId;
        const operatorId = req.user?.userId || '00000000-0000-0000-0000-000000000003';
        const session = await closeSessionUseCase.execute({
            sessionCode,
            operatorId,
            operatorName: req.body?.operatorName || req.user?.fullName || 'Counter Operator',
        });
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
router.post('/sessions/:sessionId/close', optionalAuthenticate, handleCloseSession);
router.patch('/sessions/:sessionId/close', optionalAuthenticate, handleCloseSession);
router.post('/sessions/close', optionalAuthenticate, handleCloseSession);
router.patch('/sessions/close', optionalAuthenticate, handleCloseSession);
// 3. Reopen Concluded Shift Session
const handleReopenSession = async (req, res, next) => {
    try {
        const rawCode = req.params['sessionCode'] || req.params['sessionId'] || req.body?.sessionCode || req.body?.sessionId;
        const sessionCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
        const orgId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'];
        if (!sessionCode) {
            res.status(400).json({ success: false, error: 'Session code or ID is required to reopen shift session' });
            return;
        }
        const session = await reopenSessionUseCase.execute({
            sessionCode,
            operatorId: req.user?.userId || '00000000-0000-0000-0000-000000000003',
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
router.post('/sessions/:sessionCode/reopen', optionalAuthenticate, handleReopenSession);
router.patch('/sessions/:sessionCode/reopen', optionalAuthenticate, handleReopenSession);
router.post('/sessions/reopen', optionalAuthenticate, handleReopenSession);
// 4. Atomic Milk Intake Transaction
const handleIntakeTransaction = async (req, res, next) => {
    try {
        const body = req.body;
        const orgId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'];
        const customer = await customerRepo.findById(body.customerId, orgId);
        if (!customer) {
            res.status(404).json({ success: false, error: `Customer ${body.customerId} not found` });
            return;
        }
        // Strict multi-dairy isolation: verify customer belongs to operator's dairy
        if (req.user?.organizationId && customer.organizationId !== req.user.organizationId) {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy collection blocked: Customer does not belong to authorized dairy.',
            });
            return;
        }
        const result = await processMilkIntakeUseCase.execute({
            organizationId: orgId,
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
            operatorId: req.user?.userId || '00000000-0000-0000-0000-000000000003',
            operatorName: 'Counter Operator',
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
router.post('/transactions', authenticate, handleIntakeTransaction);
router.post('/intake', authenticate, handleIntakeTransaction);
// 4b. All Dairy-Scoped Transactions (Dairy Admin & Kiosk Register)
const handleGetTransactions = async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
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
        const tenantDb = await tenantDbManager.getTenantDb(organizationId);
        let result;
        try {
            result = await tenantDb.query(query, params);
        }
        catch {
            result = await db.query(query, params);
        }
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
            operatorId: '00000000-0000-0000-0000-000000000003',
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
router.get('/transactions', optionalAuthenticate, handleGetTransactions);
router.get('/transactions/recent', optionalAuthenticate, handleGetTransactions);
// 4c. Non-Destructive Weight/Amount Adjustment with Ledger Diff
router.post('/transactions/:id/adjust', optionalAuthenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newWeight, reason, operatorName } = req.body;
        const parsedWeight = Number(newWeight);
        if (!parsedWeight || parsedWeight <= 0) {
            res.status(400).json({ success: false, error: 'A valid positive new weight is required' });
            return;
        }
        const txnRes = await db.query(`SELECT * FROM milk_collections WHERE id = $1`, [id]);
        if (txnRes.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Collection transaction not found' });
            return;
        }
        const txn = txnRes.rows[0];
        const oldWeight = Number(txn.net_weight);
        const rate = Number(txn.applied_rate_per_unit);
        const newAmount = Number((parsedWeight * rate).toFixed(2));
        const diffAmount = newAmount - Number(txn.total_amount);
        await db.query(`UPDATE milk_collections 
       SET net_weight = $1, total_amount = $2, transaction_status = 'ADJUSTED'
       WHERE id = $3;`, [parsedWeight, newAmount, id]);
        // If amount changed, post adjustment to customer ledger
        if (diffAmount !== 0) {
            const entryType = diffAmount > 0 ? 'CREDIT' : 'DEBIT';
            const absDiff = Math.abs(diffAmount);
            await ledgerRepo.appendEntry({
                customerId: txn.customer_id,
                entryType,
                amount: absDiff,
                balanceAfter: 0,
                referenceId: typeof id === 'string' ? id : String(id),
                sourceModule: 'COLLECTION_ADJUSTMENT',
                description: `Weight adjusted from ${oldWeight}L to ${parsedWeight}L by ${operatorName || 'Admin'}: ${reason || 'Correction'}`,
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
router.get('/quality/readings', optionalAuthenticate, async (req, res, next) => {
    try {
        const organizationId = req.user?.organizationId ||
            req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'] ||
            req.query['organizationId'] ||
            req.query['dairyId'];
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
        const tenantDb = await tenantDbManager.getTenantDb(organizationId);
        let result;
        try {
            result = await tenantDb.query(query, [organizationId]);
        }
        catch {
            result = await db.query(query, [organizationId]);
        }
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
// 4. Recent transactions for session
router.get('/transactions/recent', async (req, res, next) => {
    try {
        const sessionId = req.query['sessionId'];
        if (!sessionId) {
            res.json({ success: true, data: [] });
            return;
        }
        const list = await transactionRepo.listRecentBySession(sessionId);
        res.json({ success: true, data: list.map((t) => t.toJSON()) });
    }
    catch (err) {
        next(err);
    }
});
// 5. Customer Delivery History (Farmer App)
router.get('/history', authenticate, async (req, res, next) => {
    try {
        let customerId = req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.query['customerId'];
            if (queryId && queryId !== req.user.userId) {
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
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        const data = await getHistoryUseCase.execute(customerId, limit, offset, organizationId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
// 6. Monthly Milk Summary (Farmer App)
router.get('/summary/monthly', authenticate, async (req, res, next) => {
    try {
        let customerId = req.user?.userId;
        if (req.user?.role === 'FARMER_CUSTOMER') {
            const queryId = req.query['customerId'];
            if (queryId && queryId !== req.user.userId) {
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
        const monthYear = req.query['monthYear'];
        const organizationId = req.user?.organizationId || req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'] || req.query['organizationId'];
        const data = await getSummaryUseCase.execute(customerId, monthYear, organizationId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
export const collectionRoutes = router;
//# sourceMappingURL=collections.routes.js.map