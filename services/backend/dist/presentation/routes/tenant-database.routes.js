import { Router } from 'express';
import { tenantDbControlService } from '../../infrastructure/database/TenantDatabaseControlService.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router({ mergeParams: true });
function getParam(req, name) {
    const raw = req.params[name];
    if (Array.isArray(raw))
        return raw[0] || '';
    return raw || '';
}
function getAuditContext(req) {
    return {
        userId: req.user?.userId || req.user?.id || '00000000-0000-0000-0000-000000000000',
        userRole: req.user?.role || 'SUPER_ADMIN',
        fullName: req.user?.fullName || 'Super Administrator',
        reason: req.body?.reason || req.headers['x-audit-reason'] || 'Super Admin Database Management',
        ipAddress: req.ip,
        correlationId: req.headers['x-request-id'] || req.headers['x-correlation-id'],
    };
}
// 1. Database Overview
router.get('/overview', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const overview = await tenantDbControlService.getDatabaseOverview(dairyId);
        res.json({ success: true, data: overview });
    }
    catch (err) {
        next(err);
    }
});
// 2. All Dynamic Tables Listing
router.get('/tables', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tables = await tenantDbControlService.listTables(dairyId);
        res.json({ success: true, count: tables.length, data: tables });
    }
    catch (err) {
        next(err);
    }
});
// 3. Table Schema & Metadata Detail
router.get('/tables/:tableName/schema', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const schema = await tenantDbControlService.getTableSchema(dairyId, tableName);
        res.json({ success: true, data: schema });
    }
    catch (err) {
        next(err);
    }
});
router.get('/tables/:tableName', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const schema = await tenantDbControlService.getTableSchema(dairyId, tableName);
        res.json({ success: true, data: schema });
    }
    catch (err) {
        next(err);
    }
});
// 4. Paginated Table Records
router.get('/tables/:tableName/records', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
        const search = req.query.search ? String(req.query.search) : undefined;
        const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined;
        const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
        const filterField = req.query.filterField ? String(req.query.filterField) : undefined;
        const filterValue = req.query.filterValue ? String(req.query.filterValue) : undefined;
        const result = await tenantDbControlService.getTableRecords(dairyId, tableName, {
            page,
            limit,
            search,
            sortBy,
            sortOrder,
            filterField,
            filterValue,
        });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
// 5. Single Record Detail
router.get('/tables/:tableName/records/:recordId', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const recordId = getParam(req, 'recordId');
        const record = await tenantDbControlService.getRecordById(dairyId, tableName, recordId);
        if (!record) {
            res.status(404).json({ success: false, error: `Record '${recordId}' not found in table '${tableName}'.` });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (err) {
        next(err);
    }
});
// 6. Controlled Insert Record
router.post('/tables/:tableName/records', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const data = req.body?.data || req.body;
        const audit = getAuditContext(req);
        const inserted = await tenantDbControlService.insertRecord(dairyId, tableName, data, audit);
        res.status(201).json({ success: true, message: 'Record created successfully', data: inserted });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// 7. Controlled Update Record
router.put('/tables/:tableName/records/:recordId', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const recordId = getParam(req, 'recordId');
        const updates = req.body?.updates || req.body?.data || req.body;
        const audit = getAuditContext(req);
        const updated = await tenantDbControlService.updateRecord(dairyId, tableName, recordId, updates, audit);
        res.json({ success: true, message: 'Record updated successfully', data: updated });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// 8. Controlled Soft Delete Record
router.delete('/tables/:tableName/records/:recordId', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const tableName = getParam(req, 'tableName');
        const recordId = getParam(req, 'recordId');
        const audit = getAuditContext(req);
        const result = await tenantDbControlService.deleteRecord(dairyId, tableName, recordId, audit);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// 9. Actions: Verify Connection
router.post('/actions/verify-connection', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const result = await tenantDbControlService.verifyConnection(dairyId);
        res.json({ success: result.success, data: result });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 10. Actions: Validate Schema
router.post('/actions/validate-schema', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const result = await tenantDbControlService.validateSchema(dairyId);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
// 11. Actions: Migration History
router.get('/migrations', optionalAuthenticate, async (req, res, next) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const result = await tenantDbControlService.getMigrationHistory(dairyId);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
// 12. Actions: Retry Provisioning
router.post('/actions/retry-provisioning', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const mapping = tenantDbManager.getTenantMapping(dairyId);
        const code = mapping?.dairyCode || 'DAIRY';
        const name = `Cooperative Dairy ${code}`;
        const newMapping = await tenantDbManager.provisionTenantDatabase(dairyId, code, name);
        res.json({ success: true, message: 'Tenant database provisioning completed.', data: newMapping });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 13. Actions: Reconcile Mapping
router.post('/actions/reconcile-mapping', optionalAuthenticate, async (req, res) => {
    try {
        const dairyId = getParam(req, 'dairyId');
        const overview = await tenantDbControlService.getDatabaseOverview(dairyId);
        res.json({ success: true, message: 'Tenant mapping reconciled with physical database catalog', data: overview });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
export const tenantDatabaseRoutes = router;
//# sourceMappingURL=tenant-database.routes.js.map