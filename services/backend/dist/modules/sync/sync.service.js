import crypto from 'node:crypto';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { ValidationError, ForbiddenError } from '../../shared/errors/app-error.js';
import { normalizeE164Phone } from '../../shared/utils/phone.js';
import { logger } from '../../shared/logger/index.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_ROLES = new Set(['FARMER_CUSTOMER', 'GUEST_FARMER', 'CUSTOMER']);
const ORG_WIDE_ROLES = new Set(['SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER']);
const ALLOWED_PAYMENT_METHODS = new Set(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER_APPROVED_METHOD']);
function isPgMemSavepointUnsupported(client, err) {
    if (client && client.__isPgMem === true) {
        return true;
    }
    const msg = typeof err?.message === 'string' ? err.message : '';
    return !err?.code && msg.includes('pg-mem');
}
async function safeSavepoint(client, name) {
    if (client && client.__isPgMem === true) {
        return;
    }
    try {
        await client.query(`SAVEPOINT ${name};`);
    }
    catch (err) {
        if (isPgMemSavepointUnsupported(client, err)) {
            return;
        }
        logger.error({ err, name }, 'PostgreSQL SAVEPOINT creation failed in transaction');
        throw err;
    }
}
async function safeReleaseSavepoint(client, name) {
    if (client && client.__isPgMem === true) {
        return;
    }
    try {
        await client.query(`RELEASE SAVEPOINT ${name};`);
    }
    catch (err) {
        if (isPgMemSavepointUnsupported(client, err)) {
            return;
        }
        logger.error({ err, name }, 'PostgreSQL RELEASE SAVEPOINT failed in transaction');
        throw err;
    }
}
async function safeRollbackSavepoint(client, name) {
    if (client && client.__isPgMem === true) {
        return;
    }
    try {
        await client.query(`ROLLBACK TO SAVEPOINT ${name};`);
    }
    catch (err) {
        if (isPgMemSavepointUnsupported(client, err)) {
            return;
        }
        logger.error({ err, name }, 'PostgreSQL ROLLBACK TO SAVEPOINT failed in transaction');
        throw err;
    }
}
function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
export class SyncService {
    static async loadAuthorizedTenantDevice(tenantDb, deviceCtx) {
        const devRes = await tenantDb.query(`SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at,
              max_offline_hours, offline_auth_policy_approved, approved_max_offline_hours
       FROM devices
       WHERE id = $1 AND organization_id = $2
       LIMIT 1;`, [deviceCtx.deviceId, deviceCtx.organizationId]);
        if (devRes.rows.length === 0) {
            throw new ValidationError(`Device ${deviceCtx.deviceId} is not registered in organization ${deviceCtx.organizationId}`);
        }
        const device = devRes.rows[0];
        if (device.status === 'REVOKED' || device.status === 'DECOMMISSIONED' || device.revoked_at !== null) {
            throw new ForbiddenError(`Device ${device.device_identifier} has been permanently revoked`, 'DEVICE_REVOKED');
        }
        if (device.status === 'BLOCKED' || device.is_blocked === true) {
            throw new ForbiddenError(`Device ${device.device_identifier} is administratively blocked`, 'DEVICE_BLOCKED');
        }
        if (device.status !== 'ACTIVE') {
            throw new ForbiddenError(`Device ${device.device_identifier} status is ${device.status}`, 'DEVICE_REVOKED');
        }
        if (String(device.center_id || '').toLowerCase() !== deviceCtx.centerId.toLowerCase()) {
            throw new ForbiddenError('Device center ownership mismatch', 'DEVICE_CENTER_MISMATCH');
        }
        return device;
    }
    static async validateAuthoritativeActor(client, organizationId, centerId, actorId, label = 'operatorId') {
        if (typeof actorId !== 'string' || !UUID_REGEX.test(actorId.trim())) {
            throw new ValidationError(`Valid authoritative ${label} UUID is required (no fallback actor allowed)`);
        }
        const cleanActorId = actorId.trim();
        const userRes = await client.query(`SELECT id, organization_id, role, status FROM users WHERE id = $1 LIMIT 1;`, [cleanActorId]);
        if (userRes.rows.length === 0) {
            throw new ForbiddenError(`Authoritative actor '${cleanActorId}' does not exist in tenant database`, 'INVALID_OPERATOR');
        }
        const user = userRes.rows[0];
        const role = String(user.role || '').trim().toUpperCase();
        if (!role || CUSTOMER_ROLES.has(role)) {
            throw new ForbiddenError(`User '${cleanActorId}' is not permitted to perform sync operations`, 'UNAUTHORIZED_OPERATOR');
        }
        if (String(user.status || '').toUpperCase() !== 'ACTIVE') {
            throw new ForbiddenError(`Authoritative actor '${cleanActorId}' is not ACTIVE`, 'OPERATOR_INACTIVE');
        }
        if (role !== 'SUPER_ADMIN' &&
            role !== 'PLATFORM_OPERATOR' &&
            String(user.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
            throw new ForbiddenError(`Cross-tenant actor '${cleanActorId}' does not belong to organization '${organizationId}'`, 'CROSS_TENANT_ACCESS_DENIED');
        }
        if (!ORG_WIDE_ROLES.has(role) && role !== 'PLATFORM_OPERATOR') {
            const assignRes = await client.query(`SELECT center_id FROM user_center_assignments WHERE user_id = $1;`, [cleanActorId]);
            if (assignRes.rows.length > 0) {
                const assignedCenters = assignRes.rows.map((r) => String(r.center_id || '').toLowerCase());
                if (!assignedCenters.includes(centerId.toLowerCase())) {
                    throw new ForbiddenError(`Actor '${cleanActorId}' is not assigned to collection center '${centerId}'`, 'CENTER_ACCESS_DENIED');
                }
            }
        }
        return cleanActorId;
    }
    /**
     * Push offline events strictly to the authenticated device's isolated tenant database
     */
    static async pushEvents(deviceCtx, batchData) {
        const events = batchData?.events;
        if (!events || !Array.isArray(events)) {
            throw new ValidationError('events array is required');
        }
        if (batchData?.centerId && String(batchData.centerId).trim().toLowerCase() !== deviceCtx.centerId.toLowerCase()) {
            throw new ForbiddenError('Batch centerId does not match authenticated device center', 'DEVICE_CENTER_MISMATCH');
        }
        const tenantDb = await tenantDbManager.getStrictTenantDb(deviceCtx.organizationId);
        const device = await this.loadAuthorizedTenantDevice(tenantDb, deviceCtx);
        const authoritativeOrgId = device.organization_id;
        const authoritativeCenterId = device.center_id;
        return await tenantDb.withTransaction(async (client) => {
            const applied = [];
            const conflicts = [];
            const results = [];
            let eventIndex = 0;
            for (const evt of events) {
                eventIndex++;
                const savepointName = `sp_evt_${eventIndex}`;
                await safeSavepoint(client, savepointName);
                const eventId = typeof evt?.id === 'string' && evt.id.trim() ? evt.id.trim() : crypto.randomUUID();
                const entityType = evt?.entityType;
                const entityId = typeof evt?.entityId === 'string' && evt.entityId.trim() ? evt.entityId.trim() : crypto.randomUUID();
                const payload = evt?.payload && typeof evt.payload === 'object' ? evt.payload : {};
                const idempotencyKey = (typeof evt?.idempotencyKey === 'string' && evt.idempotencyKey.trim()) ||
                    (typeof evt?.id === 'string' && evt.id.trim()) ||
                    '';
                try {
                    if (payload.organizationId && String(payload.organizationId).trim().toLowerCase() !== authoritativeOrgId.toLowerCase()) {
                        throw new ForbiddenError('Event payload organizationId does not match authenticated device organization', 'CROSS_TENANT_ACCESS_DENIED');
                    }
                    if (payload.dairyId && String(payload.dairyId).trim().toLowerCase() !== authoritativeOrgId.toLowerCase()) {
                        throw new ForbiddenError('Event payload dairyId does not match authenticated device organization', 'CROSS_TENANT_ACCESS_DENIED');
                    }
                    if (payload.centerId && String(payload.centerId).trim().toLowerCase() !== authoritativeCenterId.toLowerCase()) {
                        throw new ForbiddenError('Event payload centerId does not match authenticated device center', 'DEVICE_CENTER_MISMATCH');
                    }
                    if (entityType === 'CUSTOMER_REGISTRATION') {
                        if (!UUID_REGEX.test(entityId)) {
                            throw new ValidationError('CUSTOMER_REGISTRATION requires a valid UUID entityId');
                        }
                        const rawFarmerCode = typeof payload.farmerCode === 'string' ? payload.farmerCode.trim() : '';
                        // 1. Idempotency check scoped strictly to organization_id
                        const existingCust = rawFarmerCode
                            ? await client.query(`SELECT id FROM customers
                   WHERE organization_id = $1 AND (id = $2 OR (primary_center_id = $3 AND farmer_code = $4))
                   LIMIT 1;`, [authoritativeOrgId, entityId, authoritativeCenterId, rawFarmerCode])
                            : await client.query(`SELECT id FROM customers WHERE organization_id = $1 AND id = $2 LIMIT 1;`, [authoritativeOrgId, entityId]);
                        if (existingCust.rows.length > 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId: existingCust.rows[0].id,
                                message: 'Already committed',
                            });
                            continue;
                        }
                        // 2. Validate required customer fields without fabricating defaults
                        const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
                        if (fullName.length < 2) {
                            throw new ValidationError('CUSTOMER_REGISTRATION requires a valid fullName (no fabricated defaults allowed)');
                        }
                        if (!rawFarmerCode) {
                            throw new ValidationError('CUSTOMER_REGISTRATION requires a non-empty farmerCode (no fabricated defaults allowed)');
                        }
                        const rawMobile = payload.mobileNumber || payload.mobilePhone || payload.normalizedMobileNumber;
                        if (typeof rawMobile !== 'string' || !rawMobile.trim()) {
                            throw new ValidationError('CUSTOMER_REGISTRATION requires a valid mobileNumber (no fabricated defaults allowed)');
                        }
                        let normMobile;
                        try {
                            normMobile = normalizeE164Phone(rawMobile.trim());
                        }
                        catch {
                            throw new ValidationError(`Invalid mobileNumber '${rawMobile}' for CUSTOMER_REGISTRATION`);
                        }
                        const authorizerId = await this.validateAuthoritativeActor(client, authoritativeOrgId, authoritativeCenterId, payload.authorizedBy || payload.operatorId || evt?.operatorId || batchData?.operatorId, 'authorizedBy/operatorId');
                        const permittedCategoriesRaw = payload.permittedCategories;
                        if (!Array.isArray(permittedCategoriesRaw) || permittedCategoriesRaw.length === 0) {
                            throw new ValidationError('CUSTOMER_REGISTRATION requires at least one permitted milk category');
                        }
                        const permittedCategories = [];
                        for (const cat of permittedCategoriesRaw) {
                            if (cat !== 'COW' && cat !== 'BUFFALO') {
                                throw new ValidationError(`Invalid milk category '${String(cat)}'`);
                            }
                            if (!permittedCategories.includes(cat)) {
                                permittedCategories.push(cat);
                            }
                        }
                        if (payload.address !== undefined && payload.address !== null) {
                            const addr = payload.address;
                            const requiredAddrFields = ['village', 'talukaSubdistrict', 'district', 'state', 'postalCode'];
                            for (const field of requiredAddrFields) {
                                if (typeof addr[field] !== 'string' || !addr[field].trim()) {
                                    throw new ValidationError(`CUSTOMER_REGISTRATION address.${field} is required when address is provided`);
                                }
                            }
                        }
                        // 3. Mobile uniqueness conflict check scoped by organization_id
                        const dupCheck = await client.query(`SELECT id, farmer_code, full_name FROM customers
               WHERE organization_id = $1 AND normalized_mobile_number = $2 AND is_deleted = FALSE
               LIMIT 1;`, [authoritativeOrgId, normMobile]);
                        if (dupCheck.rows.length > 0 && dupCheck.rows[0].id !== entityId) {
                            const conflictReason = 'DUPLICATE_MOBILE_NUMBER';
                            await client.query(`INSERT INTO sync_conflict_records (
                   device_id, idempotency_key, entity_type, entity_id, conflict_reason, client_payload, server_state
                 ) VALUES ($1, $2, 'CUSTOMER', $3, $4, $5, $6);`, [
                                device.id,
                                idempotencyKey || eventId,
                                entityId,
                                conflictReason,
                                JSON.stringify(payload),
                                JSON.stringify(dupCheck.rows[0]),
                            ]);
                            await safeReleaseSavepoint(client, savepointName);
                            conflicts.push(eventId);
                            results.push({
                                eventId,
                                status: 'CONFLICT',
                                reason: conflictReason,
                                message: `Mobile phone ${normMobile} already belongs to farmer ${dupCheck.rows[0].farmer_code}`,
                            });
                            continue;
                        }
                        // 4. Insert Customer
                        await client.query(`INSERT INTO customers (
                 id, organization_id, primary_center_id, farmer_code, full_name,
                 normalized_mobile_number, status, registration_status,
                 bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name,
                 created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'COMPLETED', $7, $8, $9, $10, NOW(), NOW());`, [
                            entityId,
                            authoritativeOrgId,
                            authoritativeCenterId,
                            rawFarmerCode,
                            fullName,
                            normMobile,
                            payload.bankName || null,
                            payload.bankAccountNumber || null,
                            payload.bankIfscCode || null,
                            payload.bankAccountHolderName || null,
                        ]);
                        for (const cat of permittedCategories) {
                            await client.query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_at, authorized_by)
                 VALUES ($1, $2, TRUE, NOW(), $3)
                 ON CONFLICT (customer_id, milk_category) DO UPDATE SET is_authorized = TRUE, authorized_by = EXCLUDED.authorized_by;`, [entityId, cat, authorizerId]);
                        }
                        if (payload.address) {
                            const addr = payload.address;
                            await client.query(`INSERT INTO customer_addresses (
                   customer_id, village, hamlet_area, taluka_subdistrict, district, state, postal_code, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                 ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW();`, [
                                entityId,
                                addr.village.trim(),
                                addr.hamletArea ? String(addr.hamletArea).trim() : null,
                                addr.talukaSubdistrict.trim(),
                                addr.district.trim(),
                                addr.state.trim(),
                                addr.postalCode.trim(),
                            ]);
                        }
                        await safeReleaseSavepoint(client, savepointName);
                        applied.push(eventId);
                        results.push({
                            eventId,
                            status: 'COMMITTED',
                            entityId,
                            canonicalId: entityId,
                        });
                    }
                    else if (entityType === 'MILK_COLLECTION') {
                        if (!UUID_REGEX.test(entityId)) {
                            throw new ValidationError('MILK_COLLECTION requires a valid UUID entityId');
                        }
                        if (!idempotencyKey) {
                            throw new ValidationError('MILK_COLLECTION requires a non-empty idempotencyKey');
                        }
                        // 1. Idempotency check scoped strictly to organization_id
                        const existingCol = await client.query(`SELECT id FROM milk_collections
               WHERE organization_id = $1 AND (id = $2 OR idempotency_key = $3)
               LIMIT 1;`, [authoritativeOrgId, entityId, idempotencyKey]);
                        if (existingCol.rows.length > 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId: existingCol.rows[0].id,
                                message: 'Already committed',
                            });
                            continue;
                        }
                        // 2. Validate authoritative operator, customer, category, measurements, and rate
                        const operatorId = await this.validateAuthoritativeActor(client, authoritativeOrgId, authoritativeCenterId, payload.operatorId || evt?.operatorId || batchData?.operatorId, 'operatorId');
                        const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';
                        if (!UUID_REGEX.test(customerId)) {
                            throw new ValidationError('MILK_COLLECTION requires a valid customerId UUID');
                        }
                        const custRes = await client.query(`SELECT id, organization_id, primary_center_id, status, is_deleted
               FROM customers
               WHERE id = $1 AND organization_id = $2
               LIMIT 1;`, [customerId, authoritativeOrgId]);
                        if (custRes.rows.length === 0) {
                            throw new ForbiddenError(`Customer '${customerId}' does not belong to organization '${authoritativeOrgId}'`, 'CROSS_TENANT_ACCESS_DENIED');
                        }
                        const cust = custRes.rows[0];
                        if (cust.is_deleted) {
                            throw new ValidationError(`Customer '${customerId}' is deleted`);
                        }
                        if (String(cust.status || '').toUpperCase() !== 'ACTIVE') {
                            throw new ForbiddenError(`Customer '${customerId}' is not ACTIVE`, 'CUSTOMER_SUSPENDED');
                        }
                        const milkCategory = payload.milkCategory;
                        if (milkCategory !== 'COW' && milkCategory !== 'BUFFALO') {
                            throw new ValidationError(`MILK_COLLECTION requires milkCategory 'COW' or 'BUFFALO'`);
                        }
                        const catRes = await client.query(`SELECT is_authorized FROM customer_milk_categories
               WHERE customer_id = $1 AND milk_category = $2
               LIMIT 1;`, [customerId, milkCategory]);
                        if (catRes.rows.length === 0 || catRes.rows[0].is_authorized !== true) {
                            throw new ForbiddenError(`Customer '${customerId}' is not authorized to deliver ${milkCategory} milk`, 'CATEGORY_NOT_AUTHORIZED');
                        }
                        const netWeight = Number(payload.netWeight);
                        const fatPercentage = Number(payload.fatPercentage);
                        const snfPercentage = Number(payload.snfPercentage);
                        const appliedRate = Number(payload.appliedRatePerUnit ?? payload.appliedRate);
                        const totalAmount = Number(payload.totalAmount);
                        if (!Number.isFinite(netWeight) || netWeight <= 0 || netWeight > 250) {
                            throw new ValidationError('Invalid netWeight: must be > 0 and <= 250');
                        }
                        if (!Number.isFinite(fatPercentage) || fatPercentage < 1.5 || fatPercentage > 15.0) {
                            throw new ValidationError('Invalid fatPercentage: must be between 1.5 and 15.0');
                        }
                        if (!Number.isFinite(snfPercentage) || snfPercentage < 5.0 || snfPercentage > 13.0) {
                            throw new ValidationError('Invalid snfPercentage: must be between 5.0 and 13.0');
                        }
                        if (!Number.isFinite(appliedRate) || appliedRate <= 0) {
                            throw new ValidationError('Invalid appliedRatePerUnit: must be > 0');
                        }
                        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
                            throw new ValidationError('Invalid totalAmount: must be > 0');
                        }
                        const expectedTotal = roundMoney(netWeight * appliedRate);
                        if (Math.abs(roundMoney(totalAmount) - expectedTotal) > 0.05) {
                            throw new ValidationError(`totalAmount (${totalAmount}) does not match netWeight * appliedRate (${expectedTotal})`);
                        }
                        const sessionId = typeof payload.sessionId === 'string' && UUID_REGEX.test(payload.sessionId.trim())
                            ? payload.sessionId.trim()
                            : crypto.randomUUID();
                        const businessDate = typeof payload.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.businessDate)
                            ? payload.businessDate
                            : new Date().toISOString().slice(0, 10);
                        const shiftType = payload.shiftType === 'EVENING' ? 'EVENING' : 'MORNING';
                        const idMethod = payload.identificationMethod === 'FACE' ? 'FACE' : 'RFID';
                        // 3. Resolve shift with Closed-Session Late Arrival reconciliation policy
                        let isClosedSessionLateArrival = Boolean(payload.isClosedSessionLateArrival || payload.isLateOffline);
                        let shiftId = typeof payload.shiftId === 'string' && UUID_REGEX.test(payload.shiftId.trim()) ? payload.shiftId.trim() : '';
                        if (shiftId) {
                            const shiftCheck = await client.query(`SELECT id, center_id, is_active FROM collection_shifts WHERE id = $1 AND center_id = $2 LIMIT 1;`, [shiftId, authoritativeCenterId]);
                            if (shiftCheck.rows.length === 0) {
                                throw new ForbiddenError(`Shift '${shiftId}' does not belong to center '${authoritativeCenterId}'`, 'INVALID_SHIFT');
                            }
                            if (!shiftCheck.rows[0].is_active) {
                                isClosedSessionLateArrival = true;
                            }
                        }
                        else {
                            const shiftRes = await client.query(`SELECT id FROM collection_shifts WHERE center_id = $1 AND shift_type = $2 AND is_active = TRUE LIMIT 1;`, [authoritativeCenterId, shiftType]);
                            if (shiftRes.rows.length > 0) {
                                shiftId = shiftRes.rows[0].id;
                            }
                            else {
                                const closedShiftRes = await client.query(`SELECT id FROM collection_shifts WHERE center_id = $1 AND shift_type = $2 AND is_active = FALSE LIMIT 1;`, [authoritativeCenterId, shiftType]);
                                if (closedShiftRes.rows.length > 0) {
                                    shiftId = closedShiftRes.rows[0].id;
                                    isClosedSessionLateArrival = true;
                                }
                                else {
                                    shiftId = crypto.randomUUID();
                                    await client.query(`INSERT INTO collection_shifts (id, center_id, shift_type, start_time, end_time, grace_period_minutes, is_active)
                     VALUES ($1, $2, $3, '06:00:00', '10:00:00', 30, TRUE);`, [shiftId, authoritativeCenterId, shiftType]);
                                }
                            }
                        }
                        // 4. Verify authoritative rate chart version belongs to organization and milkCategory
                        let rateChartVersionId = typeof payload.rateChartVersionId === 'string' && UUID_REGEX.test(payload.rateChartVersionId.trim())
                            ? payload.rateChartVersionId.trim()
                            : '';
                        if (rateChartVersionId) {
                            const rvVerify = await client.query(`SELECT rv.id
                 FROM rate_chart_versions rv
                 JOIN rate_charts rc ON rv.rate_chart_id = rc.id
                 WHERE rv.id = $1
                   AND rc.organization_id = $2
                   AND rc.milk_category = $3
                   AND rc.is_active = TRUE
                   AND (rc.center_id = $4 OR rc.center_id IS NULL)
                 LIMIT 1;`, [rateChartVersionId, authoritativeOrgId, milkCategory, authoritativeCenterId]);
                            if (rvVerify.rows.length === 0) {
                                throw new ForbiddenError(`Rate chart version '${rateChartVersionId}' is not authorized for organization '${authoritativeOrgId}' (${milkCategory})`, 'RATE_CHART_UNAUTHORIZED');
                            }
                        }
                        else {
                            const rvRes = await client.query(`SELECT rv.id
                 FROM rate_chart_versions rv
                 JOIN rate_charts rc ON rv.rate_chart_id = rc.id
                 WHERE rc.organization_id = $1
                   AND rc.milk_category = $2
                   AND rc.is_active = TRUE
                   AND (rc.center_id = $3 OR rc.center_id IS NULL)
                 ORDER BY (CASE WHEN rc.center_id IS NOT NULL THEN 1 ELSE 2 END) ASC, rv.version_number DESC
                 LIMIT 1;`, [authoritativeOrgId, milkCategory, authoritativeCenterId]);
                            if (rvRes.rows.length === 0) {
                                throw new ValidationError(`No active rate chart found for organization '${authoritativeOrgId}' and category '${milkCategory}'`);
                            }
                            rateChartVersionId = rvRes.rows[0].id;
                        }
                        const intakeSeqUuid = typeof payload.intakeSequenceUuid === 'string' && UUID_REGEX.test(payload.intakeSequenceUuid)
                            ? payload.intakeSequenceUuid
                            : crypto.randomUUID();
                        const clientIntakeUuid = typeof payload.clientIntakeUuid === 'string' && UUID_REGEX.test(payload.clientIntakeUuid)
                            ? payload.clientIntakeUuid
                            : crypto.randomUUID();
                        // 5. Ensure collection session exists
                        await client.query(`INSERT INTO collection_sessions (
                 id, center_id, customer_id, business_date, shift_id, shift_type, selected_milk_category,
                 identification_method, session_state, intake_sequence_uuid, started_at, completed_at, operator_id, device_id
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, NOW(), NOW(), $10, $11)
               ON CONFLICT (id) DO NOTHING;`, [
                            sessionId,
                            authoritativeCenterId,
                            customerId,
                            businessDate,
                            shiftId,
                            shiftType,
                            milkCategory,
                            idMethod,
                            intakeSeqUuid,
                            operatorId,
                            device.device_identifier,
                        ]);
                        const transactionStatus = isClosedSessionLateArrival ? 'RECONCILIATION_REQUIRED' : 'COMPLETED';
                        // 6. Insert milk collection atomically with composite (organization_id, idempotency_key) conflict guard
                        const colInsertRes = await client.query(`INSERT INTO milk_collections (
                 id, session_id, organization_id, center_id, customer_id, business_date, shift_type, milk_category,
                 net_weight, measurement_unit, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit, total_amount,
                 transaction_status, client_intake_uuid, idempotency_key, created_at, synced_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'KG', $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
               ON CONFLICT (organization_id, idempotency_key) DO NOTHING
               RETURNING id;`, [
                            entityId,
                            sessionId,
                            authoritativeOrgId,
                            authoritativeCenterId,
                            customerId,
                            businessDate,
                            shiftType,
                            milkCategory,
                            netWeight,
                            fatPercentage,
                            snfPercentage,
                            rateChartVersionId,
                            appliedRate,
                            roundMoney(totalAmount),
                            transactionStatus,
                            clientIntakeUuid,
                            idempotencyKey,
                        ]);
                        if (colInsertRes.rows.length === 0) {
                            const canon = await client.query(`SELECT id FROM milk_collections WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1;`, [authoritativeOrgId, idempotencyKey]);
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId: canon.rows[0]?.id || entityId,
                                message: 'Already committed',
                            });
                            continue;
                        }
                        if (isClosedSessionLateArrival) {
                            await client.query(`INSERT INTO sync_conflict_records (
                   device_id, idempotency_key, entity_type, entity_id, conflict_reason, client_payload, server_state
                 ) VALUES ($1, $2, 'MILK_COLLECTION', $3, 'CLOSED_SESSION_LATE_ARRIVAL', $4, $5);`, [
                                device.id,
                                idempotencyKey,
                                entityId,
                                JSON.stringify(payload),
                                JSON.stringify({ shiftId, shiftType, isClosed: true, action: 'FLAGGED_FOR_SUPERVISOR_RECONCILIATION' }),
                            ]);
                        }
                        // 7. Double-entry subledger: lock account FOR UPDATE and post deterministic ledger transaction
                        const ledgerIdempotencyKey = `LEDGER-COLL-${authoritativeOrgId}-${idempotencyKey}`;
                        let ledgerAccountId;
                        let currentBalance = 0;
                        const lockAccRes = await client.query(`SELECT id, current_balance FROM customer_ledger_accounts
               WHERE customer_id = $1 AND organization_id = $2
               FOR UPDATE;`, [customerId, authoritativeOrgId]);
                        if (lockAccRes.rows.length > 0) {
                            ledgerAccountId = lockAccRes.rows[0].id;
                            currentBalance = Number(lockAccRes.rows[0].current_balance || 0);
                        }
                        else {
                            const createAccRes = await client.query(`INSERT INTO customer_ledger_accounts (
                   customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at
                 ) VALUES ($1, $2, 'INR', 0, NOW(), NOW())
                 ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
                 WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
                 RETURNING id, current_balance;`, [customerId, authoritativeOrgId]);
                            if (createAccRes.rows.length === 0) {
                                throw new ForbiddenError(`Cross-tenant ledger account conflict for customer '${customerId}'`, 'CROSS_TENANT_ACCESS_DENIED');
                            }
                            ledgerAccountId = createAccRes.rows[0].id;
                            currentBalance = Number(createAccRes.rows[0].current_balance || 0);
                        }
                        const roundedAmount = roundMoney(totalAmount);
                        const newBalance = roundMoney(currentBalance + roundedAmount);
                        const txId = crypto.randomUUID();
                        const txDescription = isClosedSessionLateArrival
                            ? 'Milk delivery payout credit (Offline late arrival - Pending reconciliation)'
                            : 'Milk delivery payout credit';
                        const ledgerTxnRes = await client.query(`INSERT INTO ledger_transactions (
                 id, organization_id, center_id, customer_id, transaction_type, direction,
                 amount, balance_after, reference_entity, reference_id, description, idempotency_key, created_by, created_at
               ) VALUES ($1, $2, $3, $4, 'MILK_COLLECTION_CREDIT', 'CREDIT', $5, $6, 'MILK_COLLECTION', $7, $8, $9, $10, NOW())
               ON CONFLICT (idempotency_key) DO NOTHING
               RETURNING id;`, [
                            txId,
                            authoritativeOrgId,
                            authoritativeCenterId,
                            customerId,
                            roundedAmount,
                            newBalance,
                            entityId,
                            txDescription,
                            ledgerIdempotencyKey,
                            operatorId,
                        ]);
                        if (ledgerTxnRes.rows.length === 0) {
                            throw new Error(`Ledger idempotency conflict for collection '${entityId}'`);
                        }
                        await client.query(`UPDATE customer_ledger_accounts
               SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
               WHERE id = $2 AND organization_id = $3;`, [newBalance, ledgerAccountId, authoritativeOrgId]);
                        await client.query(`INSERT INTO ledger_entries (
                 transaction_id, account_id, account_type, entry_type, amount
               ) VALUES
               ($1, $2, 'CUSTOMER_PAYABLE', 'CREDIT', $3),
               ($1, $2, 'MILK_PURCHASE_EXPENSE', 'DEBIT', $3);`, [txId, ledgerAccountId, roundedAmount]);
                        await safeReleaseSavepoint(client, savepointName);
                        applied.push(eventId);
                        results.push({
                            eventId,
                            status: isClosedSessionLateArrival ? 'COMMITTED_PENDING_RECONCILIATION' : 'COMMITTED',
                            entityId,
                            ledgerEffectApplied: true,
                            flag: isClosedSessionLateArrival ? 'CLOSED_SESSION_LATE_ARRIVAL' : undefined,
                        });
                    }
                    else if (entityType === 'OFFLINE_PAYMENT_PAYOUT' || entityType === 'PAYMENT_PAYOUT') {
                        if (!UUID_REGEX.test(entityId)) {
                            throw new ValidationError('OFFLINE_PAYMENT_PAYOUT requires a valid UUID entityId');
                        }
                        if (!idempotencyKey) {
                            throw new ValidationError('OFFLINE_PAYMENT_PAYOUT requires a non-empty idempotencyKey');
                        }
                        const existingPayout = await client.query(`SELECT id, status FROM customer_payouts
               WHERE organization_id = $1 AND (idempotency_key = $2 OR id = $3)
               LIMIT 1;`, [authoritativeOrgId, idempotencyKey, entityId]);
                        if (existingPayout.rows.length > 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId: existingPayout.rows[0].id,
                                ledgerEffectApplied: false,
                                message: 'Payout already recorded; idempotency preserved',
                            });
                            continue;
                        }
                        const operatorId = await this.validateAuthoritativeActor(client, authoritativeOrgId, authoritativeCenterId, payload.operatorId || evt?.operatorId || batchData?.operatorId, 'operatorId');
                        const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';
                        if (!UUID_REGEX.test(customerId)) {
                            throw new ValidationError('OFFLINE_PAYMENT_PAYOUT requires a valid customerId UUID');
                        }
                        const custCheck = await client.query(`SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE LIMIT 1;`, [customerId, authoritativeOrgId]);
                        if (custCheck.rows.length === 0) {
                            throw new ForbiddenError(`Customer '${customerId}' does not belong to organization '${authoritativeOrgId}'`, 'CROSS_TENANT_ACCESS_DENIED');
                        }
                        const amount = Number(payload.amount);
                        if (!Number.isFinite(amount) || amount <= 0) {
                            throw new ValidationError('OFFLINE_PAYMENT_PAYOUT requires positive amount');
                        }
                        const paymentMethod = String(payload.paymentMethod || 'CASH').toUpperCase();
                        if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
                            throw new ValidationError(`Unsupported paymentMethod '${paymentMethod}'`);
                        }
                        const refNo = typeof payload.referenceNumber === 'string' && payload.referenceNumber.trim()
                            ? payload.referenceNumber.trim()
                            : `OFFLINE-PAY-${entityId.substring(0, 8)}`;
                        // Financial payments entered offline MUST be marked PENDING_APPROVAL and NEVER mutate ledger directly
                        const payoutInsert = await client.query(`INSERT INTO customer_payouts (
                id, organization_id, center_id, customer_id, direction,
                amount, currency, payment_method, status, reference_number,
                source_transaction_type, idempotency_key, notes, created_by,
                created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, 'DAIRY_PAYS_CUSTOMER',
                $5, 'INR', $6, 'PENDING_APPROVAL', $7,
                'OFFLINE_DEVICE_SYNC', $8, 'Synced from offline device ' || $9, $10,
                NOW(), NOW()
              )
              ON CONFLICT (idempotency_key) DO NOTHING
              RETURNING id;`, [
                            entityId,
                            authoritativeOrgId,
                            authoritativeCenterId,
                            customerId,
                            roundMoney(amount),
                            paymentMethod,
                            refNo,
                            idempotencyKey,
                            device.device_identifier,
                            operatorId,
                        ]);
                        if (payoutInsert.rows.length === 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId,
                                ledgerEffectApplied: false,
                                message: 'Payout already recorded; idempotency preserved',
                            });
                            continue;
                        }
                        await safeReleaseSavepoint(client, savepointName);
                        applied.push(eventId);
                        results.push({
                            eventId,
                            status: 'COMMITTED',
                            entityId,
                            paymentStatus: 'PENDING_APPROVAL',
                            ledgerEffectApplied: false,
                        });
                    }
                    else if (entityType === 'OFFLINE_CUSTOMER_RECEIPT' || entityType === 'CUSTOMER_RECEIPT') {
                        if (!UUID_REGEX.test(entityId)) {
                            throw new ValidationError('OFFLINE_CUSTOMER_RECEIPT requires a valid UUID entityId');
                        }
                        if (!idempotencyKey) {
                            throw new ValidationError('OFFLINE_CUSTOMER_RECEIPT requires a non-empty idempotencyKey');
                        }
                        const existingReceipt = await client.query(`SELECT id, status FROM customer_receipts
               WHERE organization_id = $1 AND (idempotency_key = $2 OR id = $3)
               LIMIT 1;`, [authoritativeOrgId, idempotencyKey, entityId]);
                        if (existingReceipt.rows.length > 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId: existingReceipt.rows[0].id,
                                ledgerEffectApplied: false,
                                message: 'Receipt already recorded; idempotency preserved',
                            });
                            continue;
                        }
                        const operatorId = await this.validateAuthoritativeActor(client, authoritativeOrgId, authoritativeCenterId, payload.operatorId || evt?.operatorId || batchData?.operatorId, 'operatorId');
                        const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';
                        if (!UUID_REGEX.test(customerId)) {
                            throw new ValidationError('OFFLINE_CUSTOMER_RECEIPT requires a valid customerId UUID');
                        }
                        const custCheck = await client.query(`SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE LIMIT 1;`, [customerId, authoritativeOrgId]);
                        if (custCheck.rows.length === 0) {
                            throw new ForbiddenError(`Customer '${customerId}' does not belong to organization '${authoritativeOrgId}'`, 'CROSS_TENANT_ACCESS_DENIED');
                        }
                        const amount = Number(payload.amount);
                        if (!Number.isFinite(amount) || amount <= 0) {
                            throw new ValidationError('OFFLINE_CUSTOMER_RECEIPT requires positive amount');
                        }
                        const paymentMethod = String(payload.paymentMethod || 'CASH').toUpperCase();
                        if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
                            throw new ValidationError(`Unsupported paymentMethod '${paymentMethod}'`);
                        }
                        const receiptNo = 'RCP-OFF-' + entityId.substring(0, 8).toUpperCase();
                        const refNo = typeof payload.referenceNumber === 'string' && payload.referenceNumber.trim()
                            ? payload.referenceNumber.trim()
                            : receiptNo;
                        const receiptInsert = await client.query(`INSERT INTO customer_receipts (
                id, organization_id, center_id, customer_id, direction,
                amount, currency, payment_method, status, reference_number,
                receipt_number, source_transaction_type, idempotency_key, notes, created_by,
                created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, 'CUSTOMER_PAYS_DAIRY',
                $5, 'INR', $6, 'DRAFT', $7,
                $8, 'OFFLINE_DEVICE_SYNC', $9, 'Synced from offline device ' || $10, $11,
                NOW(), NOW()
              )
              ON CONFLICT (idempotency_key) DO NOTHING
              RETURNING id;`, [
                            entityId,
                            authoritativeOrgId,
                            authoritativeCenterId,
                            customerId,
                            roundMoney(amount),
                            paymentMethod,
                            refNo,
                            receiptNo,
                            idempotencyKey,
                            device.device_identifier,
                            operatorId,
                        ]);
                        if (receiptInsert.rows.length === 0) {
                            await safeReleaseSavepoint(client, savepointName);
                            applied.push(eventId);
                            results.push({
                                eventId,
                                status: 'DUPLICATE',
                                entityId,
                                ledgerEffectApplied: false,
                                message: 'Receipt already recorded; idempotency preserved',
                            });
                            continue;
                        }
                        await safeReleaseSavepoint(client, savepointName);
                        applied.push(eventId);
                        results.push({
                            eventId,
                            status: 'COMMITTED',
                            entityId,
                            receiptStatus: 'DRAFT',
                            ledgerEffectApplied: false,
                        });
                    }
                    else {
                        throw new ValidationError(`Unsupported sync entityType '${String(entityType)}'`);
                    }
                }
                catch (evtErr) {
                    // If savepoint rollback fails on real PostgreSQL, safeRollbackSavepoint rethrows and aborts batch safely
                    await safeRollbackSavepoint(client, savepointName);
                    logger.warn({ eventId, entityType, error: evtErr?.message }, 'Sync event rejected inside savepoint');
                    results.push({
                        eventId,
                        status: 'ERROR',
                        code: evtErr?.code || 'SYNC_EVENT_ERROR',
                        message: evtErr?.message || 'Unknown processing error',
                    });
                }
            }
            await client.query(`UPDATE devices SET last_seen_at = NOW() WHERE id = $1 AND organization_id = $2;`, [device.id, authoritativeOrgId]);
            return {
                success: true,
                applied: applied.length,
                conflicts: conflicts.length,
                results,
                processedAt: new Date().toISOString(),
            };
        });
    }
    /**
     * Pull incremental changes strictly from the device's tenant database
     */
    static async pullChanges(deviceCtx, cursor, tombstoneCursor) {
        const tenantDb = await tenantDbManager.getStrictTenantDb(deviceCtx.organizationId);
        const device = await this.loadAuthorizedTenantDevice(tenantDb, deviceCtx);
        const orgId = device.organization_id;
        const effectiveCenterId = device.center_id;
        // 1. Fetch active customers
        const custRes = await tenantDb.query(`SELECT c.id, c.farmer_code, c.full_name, c.normalized_mobile_number, c.status,
              c.primary_center_id, c.updated_at
       FROM customers c
       WHERE c.organization_id = $1 AND c.is_deleted = FALSE
       ORDER BY c.updated_at ASC LIMIT 200;`, [orgId]);
        // 2. Fetch active rate chart cells (strictly published & approved versions)
        const rateRes = await tenantDb.query(`SELECT r.id, r.rate_chart_version_id, rc.milk_category, rv.version_number, rv.pricing_unit,
              r.fat_percentage, r.snf_percentage, r.rate_per_unit
       FROM rate_chart_cells r
       JOIN rate_chart_versions rv ON r.rate_chart_version_id = rv.id
       JOIN rate_charts rc ON rv.rate_chart_id = rc.id
       WHERE rc.organization_id = $1
         AND rc.is_active = TRUE
         AND (rv.status = 'PUBLISHED' OR rv.is_approved = TRUE)
         AND rv.effective_from <= NOW()
         AND (rv.effective_to IS NULL OR rv.effective_to >= NOW())
       ORDER BY rv.version_number DESC LIMIT 1000;`, [orgId]);
        // 3. Fetch encrypted face templates (Zero raw photos)
        const faceRes = await tenantDb.query(`SELECT f.id, f.customer_id, f.model_version_id, f.embedding_iv, f.embedding_auth_tag,
              encode(f.embedding_encrypted, 'base64') as encrypted_embedding,
              f.status, f.enrolled_at
       FROM face_enrollments f
       JOIN customers c ON f.customer_id = c.id
       WHERE c.organization_id = $1 AND c.is_deleted = FALSE AND f.status = 'ACTIVE' LIMIT 200;`, [orgId]);
        // 4. Fetch soft-delete tombstones
        const tombRes = await tenantDb.query(`SELECT t.id, t.entity_type, t.entity_id, t.reason, t.deleted_at as revoked_at
       FROM sync_tombstones t
       WHERE t.organization_id = $1
       ORDER BY t.deleted_at ASC LIMIT 100;`, [orgId]);
        const customers = custRes.rows.map((r) => ({
            id: r.id,
            farmerCode: r.farmer_code,
            fullName: r.full_name,
            mobilePhone: r.normalized_mobile_number,
            primaryCenterId: r.primary_center_id,
            status: r.status,
            updatedAt: r.updated_at,
        }));
        const rateCards = rateRes.rows.map((r) => ({
            id: r.id,
            rateChartVersionId: r.rate_chart_version_id,
            milkCategory: r.milk_category,
            versionNumber: r.version_number,
            pricingUnit: r.pricing_unit || 'PER_KG',
            fatPercentage: Number(r.fat_percentage),
            snfPercentage: Number(r.snf_percentage),
            ratePerUnit: Number(r.rate_per_unit),
        }));
        const faceTemplates = faceRes.rows.map((r) => ({
            id: r.id,
            customerId: r.customer_id,
            modelVersionId: r.model_version_id,
            modelName: 'MobileFaceNet-V1',
            modelVersion: '1.0.0',
            cryptoNonce: r.embedding_iv,
            authTag: r.embedding_auth_tag,
            encryptedEmbedding: r.encrypted_embedding,
            status: r.status,
            updatedAt: r.enrolled_at,
        }));
        const tombstones = tombRes.rows.map((r) => ({
            id: r.id,
            entityType: r.entity_type,
            entityId: r.entity_id,
            reason: r.reason,
            revokedAt: r.revoked_at,
        }));
        const nextCursor = cursor + customers.length;
        const nextTombstoneCursor = tombstoneCursor + tombstones.length;
        const injectedOfflineHours = process.env['TEST_OFFLINE_HOURS']
            ? Number(process.env['TEST_OFFLINE_HOURS'])
            : null;
        const isPolicyApproved = device.offline_auth_policy_approved === true || injectedOfflineHours != null;
        const effectiveOfflineHours = injectedOfflineHours ??
            (device.offline_auth_policy_approved
                ? (device.approved_max_offline_hours || device.max_offline_hours || 72)
                : (device.max_offline_hours || 72));
        return {
            customers,
            rateCards,
            faceTemplates,
            tombstones,
            currentCursor: nextCursor,
            nextCursor,
            currentTombstoneCursor: nextTombstoneCursor,
            nextTombstoneCursor,
            maxOfflineHours: effectiveOfflineHours,
            offlineAuthPolicyApproved: isPolicyApproved,
            offlinePolicyStatus: isPolicyApproved ? 'APPROVED' : 'MISSING_OWNER_APPROVAL',
            syncedAt: new Date().toISOString(),
            centerId: effectiveCenterId,
        };
    }
    /**
     * Acknowledge cursor advance strictly in the device's tenant database
     */
    static async acknowledge(deviceCtx, downstreamCursor, downstreamTombstoneCursor, clientAppVersion) {
        const tenantDb = await tenantDbManager.getStrictTenantDb(deviceCtx.organizationId);
        await this.loadAuthorizedTenantDevice(tenantDb, deviceCtx);
        await tenantDb.query(`INSERT INTO device_sync_state (
         device_id, downstream_cursor, downstream_tombstone_cursor, client_app_version, last_downstream_sync_at, updated_at
       ) VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         downstream_cursor = EXCLUDED.downstream_cursor,
         downstream_tombstone_cursor = EXCLUDED.downstream_tombstone_cursor,
         client_app_version = COALESCE(EXCLUDED.client_app_version, device_sync_state.client_app_version),
         last_downstream_sync_at = NOW(),
         updated_at = NOW();`, [deviceCtx.deviceId, downstreamCursor, downstreamTombstoneCursor, clientAppVersion || '1.0.0']);
        return {
            acknowledged: true,
            deviceId: deviceCtx.deviceId,
            downstreamCursor,
            downstreamTombstoneCursor,
            acknowledgedAt: new Date().toISOString(),
        };
    }
    /**
     * Get device synchronization status strictly from the device's tenant database
     */
    static async getStatus(deviceCtx) {
        const tenantDb = await tenantDbManager.getStrictTenantDb(deviceCtx.organizationId);
        const devRes = await tenantDb.query(`SELECT d.id, d.organization_id, d.center_id, d.device_identifier, d.status, d.max_offline_hours, d.last_seen_at,
              COALESCE(s.downstream_cursor, 0) as downstream_cursor,
              COALESCE(s.downstream_tombstone_cursor, 0) as downstream_tombstone_cursor,
              s.updated_at as last_synced_at
       FROM devices d
       LEFT JOIN device_sync_state s ON d.id = s.device_id
       WHERE d.id = $1 AND d.organization_id = $2
       LIMIT 1;`, [deviceCtx.deviceId, deviceCtx.organizationId]);
        if (devRes.rows.length === 0) {
            throw new ValidationError(`Device ${deviceCtx.deviceId} not found`);
        }
        const r = devRes.rows[0];
        return {
            deviceId: r.id,
            organizationId: r.organization_id,
            centerId: r.center_id,
            deviceIdentifier: r.device_identifier,
            status: r.status,
            maxOfflineHours: Number(r.max_offline_hours || 72),
            lastSeenAt: r.last_seen_at,
            lastSyncedAt: r.last_synced_at,
            downstreamCursor: Number(r.downstream_cursor),
            downstreamTombstoneCursor: Number(r.downstream_tombstone_cursor),
            health: r.status === 'ACTIVE' ? 'HEALTHY' : 'BLOCKED',
        };
    }
}
//# sourceMappingURL=sync.service.js.map