import { UserRole } from '@dfarm/shared-types';
import { getAdminSupabaseClient, createUserSupabaseClient } from '../config/supabase.js';
import { AppError, UnauthorizedError, ForbiddenError } from '../shared/errors/app-error.js';
import { verifyJwt } from '../jwt.js';
import { pool } from '../config/db.js';
import { hashToken, verifyDeviceToken } from '../security.js';
import { tokenRevocationService } from '../infrastructure/security/TokenRevocationService.js';
import { tenantDbManager } from '../infrastructure/database/TenantDatabaseManager.js';
export async function authenticate(req, _res, next) {
    try {
        // 1. Read the Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            throw new UnauthorizedError('Missing Authorization header. Expected Bearer token format.', 'UNAUTHORIZED');
        }
        // 2. Require Bearer token format
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match || !match[1]) {
            throw new UnauthorizedError('Invalid Authorization header format. Must be Bearer <token>', 'UNAUTHORIZED');
        }
        const token = match[1].trim();
        if (!token) {
            throw new UnauthorizedError('Empty Bearer token provided', 'UNAUTHORIZED');
        }
        // 3. Validate token: check local JWT / UUID signature first, fallback to Supabase Auth
        const adminClient = getAdminSupabaseClient();
        let authUser = null;
        let decodedToken = null;
        try {
            const decoded = verifyJwt(token);
            decodedToken = decoded;
            if (decodedToken['tokenType'] === 'refresh') {
                throw new UnauthorizedError('Refresh tokens cannot be used as access tokens', 'INVALID_TOKEN_TYPE');
            }
            if (await tokenRevocationService.isRevoked(token, decodedToken['jti'])) {
                throw new UnauthorizedError('Authentication token has been revoked', 'TOKEN_REVOKED');
            }
            const idClaim = (decoded.sub || decoded['userId'] || decoded['id']);
            if (idClaim) {
                authUser = {
                    id: idClaim,
                    email: typeof decoded['email'] === 'string' ? decoded['email'] : undefined,
                    phone: typeof decoded['phone'] === 'string' ? decoded['phone'] : undefined,
                };
            }
        }
        catch (err) {
            if (err instanceof UnauthorizedError) {
                throw err;
            }
            // Local verification failed, check Supabase Auth
        }
        if (!authUser) {
            try {
                const { data, error } = await Promise.race([
                    adminClient.auth.getUser(token),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase auth timeout')), 1000)),
                ]);
                if (!error && data?.user) {
                    authUser = {
                        id: data.user.id,
                        email: data.user.email,
                        phone: data.user.phone,
                    };
                }
            }
            catch {
                // Fallback exhausted
            }
        }
        if (!authUser) {
            throw new UnauthorizedError('Authentication token is invalid or has expired', 'INVALID_TOKEN');
        }
        // 4. Resolve internal application identity from the database (fail closed on DB outage; never trust JWT claims without DB verification)
        let staffUser = null;
        try {
            const staffRes = await pool.query(`SELECT u.id, u.organization_id, u.username, u.full_name, u.email, u.phone_number,
                u.role, u.status, o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id::text = $1
         LIMIT 1;`, [authUser.id]);
            if (staffRes.rows.length > 0) {
                staffUser = staffRes.rows[0];
            }
        }
        catch {
            throw new AppError('Authentication verification database is unavailable', 503, 'AUTH_DB_UNAVAILABLE');
        }
        if (staffUser) {
            if (String(staffUser.status || '').toUpperCase() !== 'ACTIVE') {
                throw new ForbiddenError(`Staff account status is ${staffUser.status}. Access denied.`, 'ACCOUNT_SUSPENDED');
            }
            const resolvedRole = String(staffUser.role || '').trim().toUpperCase();
            const isPlatformStaff = resolvedRole === UserRole.SUPER_ADMIN || resolvedRole === 'PLATFORM_OPERATOR';
            if (!isPlatformStaff && staffUser.org_status && String(staffUser.org_status).toUpperCase() !== 'ACTIVE') {
                throw new ForbiddenError('Assigned dairy cooperative is currently inactive or suspended.', 'ORG_SUSPENDED');
            }
            // Fetch user's assigned centers
            let assignments = [];
            try {
                const assignRes = await pool.query(`SELECT center_id, is_primary FROM user_center_assignments WHERE user_id::text = $1;`, [staffUser.id]);
                assignments = assignRes.rows;
            }
            catch {
                throw new AppError('Authentication verification database is unavailable', 503, 'AUTH_DB_UNAVAILABLE');
            }
            const centerIds = assignments.map((a) => String(a.center_id));
            const primaryAssignment = assignments.find((a) => a.is_primary);
            const primaryCenterId = primaryAssignment ? String(primaryAssignment.center_id) : centerIds[0];
            req.auth = {
                authUser: {
                    id: authUser.id,
                    email: authUser.email,
                    phone: authUser.phone,
                },
                actorType: 'STAFF',
                userId: staffUser.id,
                organizationId: staffUser.organization_id,
                role: resolvedRole,
                centerIds,
                primaryCenterId,
                centerId: primaryCenterId || centerIds[0],
                token,
                userSupabaseClient: createUserSupabaseClient(token),
            };
            return next();
        }
        // Check 2: Customer Identity (customers table in central DB, then optional tenant DB)
        let customerUser = null;
        try {
            const custRes = await pool.query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
                c.normalized_mobile_number, c.status, c.is_deleted, o.status AS org_status
         FROM customers c
         LEFT JOIN organizations o ON o.id = c.organization_id
         WHERE c.id::text = $1
         LIMIT 1;`, [authUser.id]);
            if (custRes.rows.length > 0) {
                customerUser = custRes.rows[0];
            }
            else if (typeof decodedToken?.['organizationId'] === 'string' && decodedToken['organizationId']) {
                const tenantDb = await tenantDbManager.getTenantDb(decodedToken['organizationId']);
                const tenantCustRes = await tenantDb.query(`SELECT id, organization_id, primary_center_id, farmer_code, full_name,
                  normalized_mobile_number, status, is_deleted
           FROM customers
           WHERE id::text = $1
           LIMIT 1;`, [authUser.id]);
                if (tenantCustRes.rows.length > 0) {
                    customerUser = tenantCustRes.rows[0];
                }
            }
        }
        catch {
            throw new AppError('Authentication verification database is unavailable', 503, 'AUTH_DB_UNAVAILABLE');
        }
        if (customerUser) {
            if (customerUser.is_deleted) {
                throw new ForbiddenError('Customer account has been soft-deleted', 'ACCOUNT_DELETED');
            }
            const custStatus = String(customerUser.status || '').toUpperCase();
            if (custStatus === 'SUSPENDED' || custStatus === 'INACTIVE' || custStatus === 'SOFT_DELETED') {
                throw new ForbiddenError('Customer account is suspended', 'ACCOUNT_SUSPENDED');
            }
            if (customerUser.org_status && String(customerUser.org_status).toUpperCase() !== 'ACTIVE') {
                throw new ForbiddenError('Customer dairy cooperative is inactive or suspended', 'ORG_SUSPENDED');
            }
            req.auth = {
                authUser: {
                    id: authUser.id,
                    email: authUser.email,
                    phone: authUser.phone,
                },
                actorType: 'CUSTOMER',
                userId: customerUser.id,
                organizationId: customerUser.organization_id,
                role: UserRole.FARMER_CUSTOMER,
                centerIds: [customerUser.primary_center_id],
                primaryCenterId: customerUser.primary_center_id,
                customerProfile: {
                    customerId: customerUser.id,
                    farmerCode: customerUser.farmer_code,
                },
                token,
                userSupabaseClient: createUserSupabaseClient(token),
            };
            return next();
        }
        // 5. If neither found, unmapped identity is strictly rejected
        throw new ForbiddenError('User identity is not mapped to an internal application user or registered customer', 'UNMAPPED_IDENTITY');
    }
    catch (err) {
        next(err);
    }
}
export async function authenticateDevice(req, _res, next) {
    try {
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        }
        else if (typeof req.headers['x-device-token'] === 'string') {
            token = req.headers['x-device-token'].trim();
        }
        let deviceId = req.headers['x-device-id'] ||
            req.body?.deviceId ||
            req.query?.['deviceId'];
        if (token) {
            try {
                const decoded = verifyDeviceToken(token);
                if (decoded?.sub) {
                    deviceId = decoded.sub;
                }
            }
            catch {
                try {
                    const decoded = verifyJwt(token);
                    if (decoded?.deviceId) {
                        deviceId = decoded.deviceId;
                    }
                }
                catch {
                    // Token is neither a device JWT nor an app JWT
                }
                if (!deviceId) {
                    const tokenHash = hashToken(token);
                    const devRes = await pool.query('SELECT id, status FROM devices WHERE device_token_hash = $1;', [tokenHash]);
                    if (devRes.rows.length > 0) {
                        deviceId = devRes.rows[0].id;
                    }
                    else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
                        deviceId = token;
                    }
                }
            }
        }
        if (!deviceId) {
            throw new UnauthorizedError('Device identification required via Bearer token, X-Device-Token, or X-Device-ID header', 'UNAUTHORIZED_DEVICE');
        }
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId);
        const devRes = isUuid
            ? await pool.query('SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at, public_key, device_token_hash, max_offline_hours, last_seen_at FROM devices WHERE id = $1;', [deviceId])
            : await pool.query('SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at, public_key, device_token_hash, max_offline_hours, last_seen_at FROM devices WHERE device_identifier = $1;', [deviceId]);
        if (devRes.rows.length === 0) {
            throw new UnauthorizedError(`Device ${deviceId} is not registered`, 'DEVICE_NOT_FOUND');
        }
        const device = devRes.rows[0];
        // 1. Permanent revocation check: credentials wiped, revoked_at set, or REVOKED/DECOMMISSIONED status
        // Replay of an unexpired JWT cannot restore access to a revoked device
        if (device.status === 'REVOKED' ||
            device.status === 'DECOMMISSIONED' ||
            device.revoked_at !== null ||
            (device.public_key === null && device.device_token_hash === null && device.status !== 'ACTIVE')) {
            throw new ForbiddenError(`Device ${device.device_identifier} credentials have been permanently revoked. Access denied.`, 'DEVICE_REVOKED');
        }
        // 2. Administrative block check
        if (device.status === 'BLOCKED' || device.is_blocked === true) {
            throw new ForbiddenError(`Device ${device.device_identifier} is administratively blocked. Access denied.`, 'DEVICE_BLOCKED');
        }
        // 3. Strict active status check
        if (device.status !== 'ACTIVE') {
            throw new ForbiddenError(`Device ${device.device_identifier} status is ${device.status}. Synchronization is blocked.`, 'DEVICE_REVOKED');
        }
        // 4. Tenant ownership check
        const requestedOrg = req.headers['x-dairy-tenant-id'] || req.headers['x-organization-id'] || req.auth?.organizationId;
        if (requestedOrg && device.organization_id && requestedOrg.trim().toLowerCase() !== device.organization_id.trim().toLowerCase()) {
            throw new ForbiddenError('Cross-tenant device operation denied: Organization mismatch.', 'CROSS_TENANT_ACCESS_DENIED');
        }
        if (device.last_seen_at && device.max_offline_hours) {
            const hoursOffline = (Date.now() - new Date(device.last_seen_at).getTime()) / (1000 * 60 * 60);
            if (hoursOffline > device.max_offline_hours) {
                throw new ForbiddenError(`Device authorization has expired (${Math.round(hoursOffline)}h offline > ${device.max_offline_hours}h limit). Re-authentication required.`, 'OFFLINE_EXPIRED');
            }
        }
        req.deviceId = device.id;
        next();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=authenticate.js.map