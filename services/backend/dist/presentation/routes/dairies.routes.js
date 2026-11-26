import { Router } from 'express';
import crypto from 'node:crypto';
import { GetNearbyDairiesUseCase } from '../../application/use-cases/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { serializeOtpResponse } from './auth.routes.js';
import { emailService } from '../../infrastructure/email/EmailService.js';
import { doveOtpService } from '../../infrastructure/otp/DoveOtpService.js';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { superAdminRepo } from '../../infrastructure/repositories/PostgresSuperAdminRepository.js';
import { tenantDatabaseRoutes } from './tenant-database.routes.js';
const router = Router();
const getNearbyDairies = new GetNearbyDairiesUseCase();
// In-memory fallback caches for headless/offline test environments
export { inMemoryDairies, inMemoryAdmins, inMemoryInvitationsByHash, inMemoryInvitationsById, getInMemoryDairyById, getInMemoryDairyByPhone, getAllInMemoryDairies, } from '../../infrastructure/database/InMemoryDairyStore.js';
import { inMemoryDairies, inMemoryAdmins, inMemoryInvitationsByHash, inMemoryInvitationsById, } from '../../infrastructure/database/InMemoryDairyStore.js';
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
function maskEmail(email) {
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1])
        return '***@***.***';
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length <= 2 ? `${name[0]}*` : `${name[0]}${'*'.repeat(Math.max(name.length - 2, 3))}${name[name.length - 1]}`;
    return `${maskedName}@${domain}`;
}
function maskPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10)
        return '+91 **********';
    return `+91 ${'*'.repeat(6)}${digits.slice(-4)}`;
}
async function findInvitation(tokenOrCode, dairyCode) {
    const token = (tokenOrCode || '').trim();
    const dCode = (dairyCode || '').trim();
    if (!token && !dCode)
        return null;
    const tokenHash = token ? crypto.createHash('sha256').update(token).digest('hex') : '';
    // 1. By token hash in memory
    if (tokenHash && inMemoryInvitationsByHash.has(tokenHash)) {
        return inMemoryInvitationsByHash.get(tokenHash);
    }
    // 2. By ID or token in memory
    if (token && inMemoryInvitationsById.has(token)) {
        return inMemoryInvitationsById.get(token);
    }
    // 3. Scan in-memory invitations
    for (const inv of inMemoryInvitationsByHash.values()) {
        if (token && (inv.tokenHash === token || inv.id === token || inv.token === token || inv.rawToken === token)) {
            return inv;
        }
        if ((dCode && inv.dairyCode === dCode) || (token && inv.dairyCode === token)) {
            return inv;
        }
    }
    // 4. Look up in PostgreSQL
    try {
        const sql = `
      SELECT 
        i.id, i.dairy_id, i.admin_id, i.email, i.token_hash, i.status,
        i.delivery_status, i.delivery_provider, i.delivery_message_id,
        i.created_at, i.expires_at, i.consumed_at, i.revoked_at,
        o.name AS dairy_name, o.code AS dairy_code,
        u.full_name AS admin_name, COALESCE(u.mobile_number, u.phone_number) AS admin_mobile
      FROM dairy_admin_invitations i
      JOIN organizations o ON o.id = i.dairy_id
      JOIN users u ON u.id = i.admin_id
      WHERE i.token_hash = $1 OR o.code = $2 OR o.code = $3 OR i.id = $4
      ORDER BY i.created_at DESC LIMIT 1;
    `;
        const result = await db.query(sql, [tokenHash || token, dCode || token, token, token]);
        if (result.rows.length > 0) {
            const row = result.rows[0];
            const invitation = {
                id: row.id,
                dairyId: row.dairy_id,
                dairyName: row.dairy_name,
                dairyCode: row.dairy_code,
                adminId: row.admin_id,
                adminName: row.admin_name,
                adminMobile: row.admin_mobile,
                email: row.email,
                tokenHash: row.token_hash,
                status: row.status,
                deliveryStatus: row.delivery_status,
                createdAt: row.created_at?.toISOString?.() || row.created_at,
                expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
                consumedAt: row.consumed_at?.toISOString?.() || row.consumed_at,
                revokedAt: row.revoked_at?.toISOString?.() || row.revoked_at,
            };
            if (tokenHash)
                inMemoryInvitationsByHash.set(tokenHash, invitation);
            inMemoryInvitationsById.set(invitation.id, invitation);
            return invitation;
        }
    }
    catch {
        // Database lookup failed or table missing
    }
    return null;
}
// ============================================================================
// INVITATION & ACTIVATION ROUTES (MUST BE BEFORE /:id ROUTE)
// ============================================================================
// Validate Invitation Token
router.get('/invitations/validate', async (req, res, next) => {
    try {
        const rawToken = (req.query['token'] || req.query['code'] || req.query['dairyCode']);
        const dairyCode = req.query['dairyCode'];
        if (!rawToken && !dairyCode) {
            res.status(400).json({
                success: false,
                code: 'MISSING_TOKEN',
                error: 'Activation token is missing from the request URL.',
            });
            return;
        }
        const invitation = await findInvitation(rawToken, dairyCode);
        if (!invitation) {
            res.status(404).json({
                success: false,
                code: 'INVALID_TOKEN',
                error: 'This activation link is invalid or unavailable.',
            });
            return;
        }
        if (invitation.status === 'CONSUMED') {
            res.status(400).json({
                success: false,
                code: 'ALREADY_CONSUMED',
                error: 'This account has already been activated.',
                data: {
                    dairyName: invitation.dairyName,
                    adminName: invitation.adminName,
                    email: maskEmail(invitation.email),
                },
            });
            return;
        }
        if (invitation.status === 'REVOKED') {
            res.status(400).json({
                success: false,
                code: 'INVITATION_REVOKED',
                error: 'This activation invitation has been revoked. Please contact the Super Admin for a new invitation.',
            });
            return;
        }
        const now = Date.now();
        const expiryTime = new Date(invitation.expiresAt).getTime();
        if (now > expiryTime || invitation.status === 'EXPIRED') {
            res.status(400).json({
                success: false,
                code: 'INVITATION_EXPIRED',
                error: 'This activation invitation has expired. Please contact the Super Admin for a new invitation.',
            });
            return;
        }
        res.json({
            success: true,
            code: 'VALID',
            data: {
                invitationId: invitation.id,
                dairyId: invitation.dairyId,
                dairyName: invitation.dairyName,
                dairyCode: invitation.dairyCode,
                adminId: invitation.adminId,
                adminName: invitation.adminName,
                maskedEmail: maskEmail(invitation.email),
                maskedMobile: maskPhone(invitation.adminMobile),
                expiresAt: invitation.expiresAt,
                status: invitation.status,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// Request Mobile OTP for Activation
router.post('/invitations/otp/request', async (req, res, next) => {
    try {
        const { token, code, dairyCode } = req.body;
        const effectiveToken = (token || code || dairyCode);
        if (!effectiveToken && !dairyCode) {
            res.status(400).json({ success: false, error: 'Activation token is required.' });
            return;
        }
        const invitation = await findInvitation(effectiveToken, dairyCode);
        if (!invitation || invitation.status !== 'PENDING') {
            res.status(400).json({ success: false, error: 'Cannot dispatch OTP for an invalid or inactive invitation.' });
            return;
        }
        const otpResult = await doveOtpService.sendOtp(invitation.adminMobile, 'ADMIN_LOGIN', req.ip || req.socket.remoteAddress, { verifiedInvitationId: invitation.id });
        res.json(serializeOtpResponse(otpResult));
    }
    catch (err) {
        next(err);
    }
});
// Complete Account Activation Atomically
router.post('/invitations/activate', async (req, res, next) => {
    try {
        const { token, code, dairyCode, otp } = req.body;
        const effectiveToken = (token || code || dairyCode);
        if (!effectiveToken && !dairyCode) {
            res.status(400).json({ success: false, error: 'Activation token is required.' });
            return;
        }
        if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
            res.status(400).json({ success: false, error: 'A valid 6-digit verification code is required.' });
            return;
        }
        const invitation = await findInvitation(effectiveToken, dairyCode);
        if (!invitation) {
            res.status(404).json({ success: false, error: 'This activation link is invalid or unavailable.' });
            return;
        }
        if (invitation.status === 'CONSUMED') {
            res.status(400).json({ success: false, code: 'ALREADY_CONSUMED', error: 'This account has already been activated.' });
            return;
        }
        if (invitation.status === 'REVOKED' || invitation.status === 'EXPIRED') {
            res.status(400).json({
                success: false,
                code: invitation.status === 'REVOKED' ? 'INVITATION_REVOKED' : 'INVITATION_EXPIRED',
                error: 'This invitation is no longer valid. Please request a new invitation.',
            });
            return;
        }
        // Verify Mobile OTP
        const isOtpValid = await doveOtpService.verifyOtp(invitation.adminMobile, otp.trim(), 'ADMIN_LOGIN');
        if (!isOtpValid) {
            res.status(400).json({ success: false, error: 'Invalid or expired verification code. Please check the SMS sent to your mobile.' });
            return;
        }
        const activatedAt = new Date().toISOString();
        // 1. Update in-memory stores
        invitation.status = 'CONSUMED';
        invitation.consumedAt = activatedAt;
        const cachedDairy = inMemoryDairies.get(invitation.dairyId);
        if (cachedDairy) {
            cachedDairy.status = 'active';
            cachedDairy.activatedAt = activatedAt;
            cachedDairy.operationalReadiness = {
                ...cachedDairy.operationalReadiness,
                primaryAdminActivated: true,
                readinessScore: 50, // Business profile (25%) + Primary admin activated (25%)
            };
        }
        const cachedAdmin = inMemoryAdmins.get(invitation.adminId);
        if (cachedAdmin) {
            cachedAdmin.status = 'active';
            cachedAdmin.verificationStatus = 'verified';
            cachedAdmin.activatedAt = activatedAt;
        }
        // Register phone for future Admin logins
        doveOtpService.registerAuthorizedAdminPhone(invitation.adminMobile);
        // 2. Transactional database update
        try {
            await db.withTransaction(async (client) => {
                // Mark invitation consumed
                await client.query(`UPDATE dairy_admin_invitations
           SET status = 'CONSUMED', consumed_at = NOW()
           WHERE id = $1;`, [invitation.id]);
                // Activate user
                await client.query(`UPDATE users
           SET status = 'ACTIVE', activated_at = NOW()
           WHERE id = $1;`, [invitation.adminId]);
                // Update organization status & operational readiness
                await client.query(`UPDATE organizations
           SET status = 'ACTIVE', primary_admin_activated = TRUE, activated_at = NOW()
           WHERE id = $1;`, [invitation.dairyId]);
            });
        }
        catch (err) {
            logger.warn({ error: err.message }, 'Database transaction for activation failed; in-memory activation completed');
        }
        logger.info({ dairyId: invitation.dairyId, adminId: invitation.adminId }, 'Primary Dairy Admin account activated successfully');
        res.json({
            success: true,
            message: 'Primary Dairy Admin account activated successfully!',
            data: {
                dairyId: invitation.dairyId,
                dairyName: invitation.dairyName,
                dairyCode: invitation.dairyCode,
                adminId: invitation.adminId,
                adminName: invitation.adminName,
                email: invitation.email,
                mobileNumber: invitation.adminMobile,
                status: 'active',
                activatedAt,
                primaryAdminActivated: true,
                operationalReadinessScore: 50,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// Resend Activation Invitation
router.post('/invitations/resend', async (req, res, next) => {
    try {
        const { adminId, dairyId } = req.body;
        if (!adminId && !dairyId) {
            res.status(400).json({ success: false, error: 'Either adminId or dairyId is required to resend invitation.' });
            return;
        }
        let targetAdmin = null;
        let targetDairy = null;
        if (adminId) {
            targetAdmin = inMemoryAdmins.get(adminId);
        }
        if (dairyId) {
            targetDairy = inMemoryDairies.get(dairyId);
            if (!targetAdmin && targetDairy?.primaryAdminId) {
                targetAdmin = inMemoryAdmins.get(targetDairy.primaryAdminId);
            }
        }
        // Attempt DB lookup if not in memory
        if (!targetAdmin || !targetDairy) {
            try {
                const sql = `
          SELECT 
            u.id AS admin_id, u.full_name AS admin_name, COALESCE(u.mobile_number, u.phone_number) AS admin_mobile,
            u.email AS admin_email, u.status AS admin_status,
            o.id AS dairy_id, o.name AS dairy_name, o.code AS dairy_code, o.status AS dairy_status, o.business_email
          FROM users u
          JOIN organizations o ON o.id = u.organization_id
          WHERE (u.id = $1 OR o.id = $2) AND u.user_role = 'DAIRY_ADMIN'
          LIMIT 1;
        `;
                const resDb = await db.query(sql, [adminId || null, dairyId || null]);
                if (resDb.rows.length > 0) {
                    const r = resDb.rows[0];
                    targetAdmin = {
                        id: r.admin_id,
                        fullName: r.admin_name,
                        mobile: r.admin_mobile,
                        email: r.admin_email || r.business_email,
                        status: r.admin_status,
                        dairyId: r.dairy_id,
                    };
                    targetDairy = {
                        id: r.dairy_id,
                        name: r.dairy_name,
                        code: r.dairy_code,
                        status: r.dairy_status,
                    };
                }
            }
            catch {
                // DB fallback
            }
        }
        if (!targetAdmin || !targetDairy) {
            res.status(404).json({ success: false, error: 'Matching Dairy or Primary Admin onboarding record not found.' });
            return;
        }
        if (targetAdmin.status === 'ACTIVE' || targetAdmin.status === 'active') {
            res.status(400).json({ success: false, error: 'This Dairy Admin account has already been activated.' });
            return;
        }
        const email = (targetAdmin.email || targetDairy.contact?.businessEmail || '').trim().toLowerCase();
        if (!email || !EMAIL_REGEX.test(email)) {
            res.status(400).json({ success: false, error: 'Primary Admin email is invalid or missing. Please update email before resending.' });
            return;
        }
        // Revoke previous pending invitations for this admin
        const now = new Date().toISOString();
        for (const [, inv] of inMemoryInvitationsByHash.entries()) {
            if (inv.adminId === targetAdmin.id && inv.status === 'PENDING') {
                inv.status = 'REVOKED';
                inv.revokedAt = now;
            }
        }
        try {
            await db.query(`UPDATE dairy_admin_invitations
         SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = 'Replaced by fresh invitation resend'
         WHERE admin_id = $1 AND status = 'PENDING';`, [targetAdmin.id]);
        }
        catch {
            // offline fallback
        }
        // Generate fresh high-entropy 256-bit token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const newInvitationId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const webBaseUrl = (config.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');
        const inviteLink = `${webBaseUrl}/activate?token=${rawToken}`;
        // Dispatch real email
        const emailResult = await emailService.sendActivationInvitation({
            recipientEmail: email,
            adminName: targetAdmin.fullName,
            dairyName: targetDairy.name,
            dairyCode: targetDairy.code,
            adminMobile: targetAdmin.mobile,
            activationUrl: inviteLink,
            expiresInHours: 48,
        });
        const newInvitation = {
            id: newInvitationId,
            dairyId: targetDairy.id,
            dairyName: targetDairy.name,
            dairyCode: targetDairy.code,
            adminId: targetAdmin.id,
            adminName: targetAdmin.fullName,
            adminMobile: targetAdmin.mobile,
            email,
            rawToken,
            tokenHash,
            status: 'PENDING',
            deliveryStatus: emailResult.status,
            deliveryProvider: emailResult.provider,
            deliveryMessageId: emailResult.messageId,
            createdAt: now,
            expiresAt,
        };
        inMemoryInvitationsByHash.set(tokenHash, newInvitation);
        inMemoryInvitationsById.set(newInvitationId, newInvitation);
        try {
            await db.query(`INSERT INTO dairy_admin_invitations (
          id, dairy_id, admin_id, email, token_hash, status, delivery_status,
          delivery_provider, delivery_message_id, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, NOW(), $9);`, [
                newInvitationId,
                targetDairy.id,
                targetAdmin.id,
                email,
                tokenHash,
                emailResult.status,
                emailResult.provider,
                emailResult.messageId || null,
                expiresAt,
            ]);
        }
        catch {
            // DB fallback
        }
        logger.info({ adminId: targetAdmin.id, email, messageId: emailResult.messageId }, 'Fresh activation invitation dispatched');
        res.json({
            success: true,
            message: emailResult.success
                ? `Fresh activation invitation dispatched to ${email}`
                : `Invitation recorded, but email dispatch failed: ${emailResult.error}`,
            data: {
                invitationId: newInvitationId,
                inviteLink,
                activationLink: inviteLink,
                activationToken: rawToken,
                emailDelivery: emailResult,
                expiresAt,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 1. Proximity / Nearby Search
router.get('/nearby', async (req, res, next) => {
    try {
        const latParam = req.query['lat'] ?? req.query['latitude'];
        const lngParam = req.query['lng'] ?? req.query['longitude'];
        const searchParam = (req.query['searchQuery'] ?? req.query['search'] ?? req.query['q'] ?? '');
        const lat = latParam !== undefined && latParam !== '' ? Number(latParam) : undefined;
        const lng = lngParam !== undefined && lngParam !== '' ? Number(lngParam) : undefined;
        const radiusParam = req.query['radiusKm'] ?? req.query['radius'];
        const radiusKm = radiusParam !== undefined && radiusParam !== '' ? Number(radiusParam) : 50;
        let data = await getNearbyDairies.execute(lat, lng, searchParam, radiusKm);
        // Merge in-memory registered dairies if any
        const existingIds = new Set(data.map((d) => d.id || d.dairyId));
        for (const memDairy of inMemoryDairies.values()) {
            if (existingIds.has(memDairy.id)) {
                continue;
            }
            // Check if suspended, deleted or disabled
            const memStatus = (memDairy.status || 'active').toLowerCase();
            if (memStatus === 'suspended' || memStatus === 'disabled' || memStatus === 'deleted') {
                continue;
            }
            let distanceKm;
            const dLat = memDairy.location?.latitude;
            const dLng = memDairy.location?.longitude;
            if (typeof lat === 'number' && typeof lng === 'number' && typeof dLat === 'number' && typeof dLng === 'number') {
                const R = 6371;
                const deltaLat = ((dLat - lat) * Math.PI) / 180;
                const deltaLon = ((dLng - lng) * Math.PI) / 180;
                const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                    Math.cos((lat * Math.PI) / 180) *
                        Math.cos((dLat * Math.PI) / 180) *
                        Math.sin(deltaLon / 2) *
                        Math.sin(deltaLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                distanceKm = Math.round(R * c * 10) / 10;
                // Proximity constraint: strictly respect radiusKm unless no dairies were found within radius
                if (typeof radiusKm === 'number' && distanceKm > radiusKm && data.length > 0) {
                    continue;
                }
            }
            const mapping = tenantDbManager.getTenantMapping(memDairy.id);
            const provStatus = mapping?.provisioningStatus || memDairy.provisioningStatus || 'ACTIVE';
            const isDbFailed = provStatus === 'FAILED';
            const memEntry = {
                id: memDairy.id,
                dairyId: memDairy.id,
                name: memDairy.name,
                dairyName: memDairy.name,
                registrationNumber: memDairy.code,
                code: memDairy.code,
                village: memDairy.location?.villageLocality || memDairy.location?.city || 'Local Area',
                district: memDairy.location?.district || 'District',
                state: memDairy.location?.state || 'Maharashtra',
                contactPhone: memDairy.contact?.businessPhone || memDairy.primaryAdminMobile || '+91 98220 12345',
                centerId: memDairy.id,
                centerCode: 'C-01',
                centerName: `${memDairy.name} Main Center`,
                associatedPerson: memDairy.primaryAdminName || 'Dairy Administrator',
                adminName: memDairy.primaryAdminName || 'Dairy Administrator',
                associatedPersonPhone: memDairy.primaryAdminMobile || memDairy.contact?.businessPhone || '+91 98220 12345',
                latitude: dLat,
                longitude: dLng,
                formattedAddress: memDairy.location?.formattedAddress,
                distanceKm: distanceKm !== undefined ? distanceKm : null,
                distanceMeters: distanceKm !== undefined ? Math.round(distanceKm * 1000) : null,
                distanceLabel: distanceKm !== undefined
                    ? (distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`)
                    : null,
                provisioningStatus: provStatus,
                isOperational: !isDbFailed,
                isActive: memStatus !== 'suspended' && memStatus !== 'disabled',
                isRegistrationEligible: !isDbFailed && memStatus === 'active',
                registrationBlockReason: isDbFailed
                    ? 'Dairy database provisioning is incomplete or failed'
                    : memStatus !== 'active'
                        ? `Dairy status is ${memStatus.toUpperCase()}`
                        : undefined,
                databaseHealth: isDbFailed ? 'CONNECTION_FAILED' : 'HEALTHY',
                discoveryStatus: isDbFailed ? 'PROVISIONING_FAILED' : memStatus === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
            };
            if (!searchParam ||
                memDairy.name.toLowerCase().includes(searchParam.toLowerCase()) ||
                (memDairy.primaryAdminName &&
                    memDairy.primaryAdminName.toLowerCase().includes(searchParam.toLowerCase())) ||
                (memDairy.location?.villageLocality &&
                    memDairy.location.villageLocality.toLowerCase().includes(searchParam.toLowerCase())) ||
                (memDairy.location?.district &&
                    memDairy.location.district.toLowerCase().includes(searchParam.toLowerCase()))) {
                data.push(memEntry);
            }
        }
        // Ensure all items carry authoritative provisioning and operational flags
        data = data.map((d) => {
            const dId = d.id || d.dairyId;
            const mapping = tenantDbManager.getTenantMapping(dId);
            const provStatus = mapping?.provisioningStatus || d.provisioningStatus || 'ACTIVE';
            const isDbFailed = provStatus === 'FAILED';
            return {
                ...d,
                provisioningStatus: provStatus,
                isOperational: !isDbFailed,
                discoveryStatus: isDbFailed ? 'PROVISIONING_FAILED' : d.discoveryStatus,
            };
        });
        // Exclude any suspended or disabled dairies from customer discovery
        data = data.filter((d) => d.isActive !== false && d.discoveryStatus !== 'SUSPENDED' && d.discoveryStatus !== 'DISABLED');
        if (typeof lat === 'number' && typeof lng === 'number') {
            data.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
        }
        res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        next(err);
    }
});
// 2. List all Dairies (Super Admin & System Directory)
router.get('/', optionalAuthenticate, async (req, res, next) => {
    try {
        const search = typeof req.query['search'] === 'string' ? req.query['search'].trim().toLowerCase() : '';
        const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'].trim().toLowerCase() : 'all';
        const stateFilter = typeof req.query['state'] === 'string' ? req.query['state'].trim() : 'all';
        let dbDairies = [];
        try {
            const sql = `
        SELECT 
          o.id,
          o.code,
          o.name,
          o.status,
          o.latitude,
          o.longitude,
          o.formatted_address,
          o.place_id,
          o.address_line1,
          o.village_locality,
          o.city,
          o.district,
          o.state,
          o.postal_code,
          o.country,
          o.business_phone,
          o.business_email,
          o.created_at,
          o.updated_at,
          u.id AS primary_admin_id,
          u.full_name AS primary_admin_name,
          u.mobile_number AS primary_admin_mobile
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id AND (
          u.role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN') OR 
          u.user_role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN')
        )
        ORDER BY o.created_at DESC;
      `;
            const result = await db.query(sql);
            dbDairies = result.rows.map((row) => {
                const mapping = tenantDbManager.getTenantMapping(row.id);
                const normStatus = (row.status || 'active').toLowerCase();
                return {
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    status: normStatus,
                    databaseName: mapping?.databaseName || undefined,
                    provisioningStatus: mapping?.provisioningStatus || (normStatus === 'active' ? 'ACTIVE' : 'PENDING'),
                    provisioningError: mapping?.provisioningError || undefined,
                    primaryAdminId: row.primary_admin_id || '00000000-0000-0000-0000-000000000003',
                    primaryAdminName: row.primary_admin_name || 'Admin',
                    primaryAdminMobile: row.primary_admin_mobile || '+919800000000',
                    location: {
                        addressLine1: row.address_line1 || row.formatted_address || '',
                        villageLocality: row.village_locality || undefined,
                        city: row.city || undefined,
                        district: row.district || 'District',
                        state: row.state || 'State',
                        pincode: row.postal_code || '000000',
                        latitude: row.latitude ? Number(row.latitude) : undefined,
                        longitude: row.longitude ? Number(row.longitude) : undefined,
                        formattedAddress: row.formatted_address || undefined,
                        placeId: row.place_id || undefined,
                    },
                    contact: {
                        businessPhone: row.business_phone || '+910000000000',
                        businessEmail: row.business_email || undefined,
                    },
                    operationalReadiness: {
                        businessProfileComplete: true,
                        primaryAdminActivated: normStatus === 'active',
                        hardwareSynced: false,
                        collectionStaffTrained: false,
                        readinessScore: normStatus === 'active' ? 75 : 25,
                    },
                    deviceSummary: {
                        registeredDevicesCount: 2,
                        onlineDevicesCount: 2,
                        firmwareVersionsSummary: 'v1.4.2-stable',
                    },
                    syncHealth: {
                        status: 'healthy',
                        lastSyncAt: new Date().toISOString(),
                        pendingSyncEventsCount: 0,
                        averageLatencyMs: 45,
                        errorCountLast24h: 0,
                    },
                    configuration: {
                        timezone: 'Asia/Kolkata',
                        locale: 'en-IN',
                        allowSelfRegistration: true,
                        offlineSyncGracePeriodHours: 48,
                        featureFlags: {
                            automaticFatTestingIntegration: true,
                            smsAlertsEnabled: true,
                            chillingCenterSync: false,
                        },
                    },
                    createdAt: row.created_at?.toISOString?.() || row.created_at,
                    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
                };
            });
        }
        catch {
            // In-memory fallback will be merged
        }
        // Merge DB dairies and in-memory dairies deduplicated by ID / code
        const dairyMap = new Map();
        for (const d of dbDairies) {
            dairyMap.set(d.id, d);
            if (d.code)
                dairyMap.set(d.code.toLowerCase(), d);
        }
        for (const memD of inMemoryDairies.values()) {
            if (!dairyMap.has(memD.id) && (!memD.code || !dairyMap.has(memD.code.toLowerCase()))) {
                const mapping = tenantDbManager.getTenantMapping(memD.id);
                const normStatus = (memD.status || 'draft_onboarding').toLowerCase();
                dairyMap.set(memD.id, {
                    ...memD,
                    status: normStatus,
                    databaseName: mapping?.databaseName || memD.databaseName || undefined,
                    provisioningStatus: mapping?.provisioningStatus || memD.provisioningStatus || (normStatus === 'active' ? 'ACTIVE' : 'PENDING'),
                    provisioningError: mapping?.provisioningError || memD.provisioningError || undefined,
                });
            }
        }
        let allDairies = Array.from(new Set(dairyMap.values()));
        // Apply filtering: search, status, state
        if (search) {
            allDairies = allDairies.filter((d) => (d.name && d.name.toLowerCase().includes(search)) ||
                (d.code && d.code.toLowerCase().includes(search)) ||
                (d.primaryAdminName && d.primaryAdminName.toLowerCase().includes(search)) ||
                (d.primaryAdminMobile && d.primaryAdminMobile.includes(search)) ||
                (d.location?.district && d.location.district.toLowerCase().includes(search)) ||
                (d.location?.state && d.location.state.toLowerCase().includes(search)));
        }
        if (statusFilter && statusFilter !== 'all') {
            allDairies = allDairies.filter((d) => (d.status || '').toLowerCase() === statusFilter);
        }
        if (stateFilter && stateFilter !== 'all') {
            allDairies = allDairies.filter((d) => d.location?.state === stateFilter);
        }
        res.json({ success: true, count: allDairies.length, data: allDairies });
    }
    catch (err) {
        next(err);
    }
});
// 2b. Audit Tenant Database Resources (Multi-Database Provisioning Status)
router.get('/tenant-databases', optionalAuthenticate, async (_req, res, next) => {
    try {
        const mappings = tenantDbManager.getAllMappings();
        res.json({
            success: true,
            count: mappings.length,
            data: mappings,
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Get Dairy by ID
router.get('/:id', optionalAuthenticate, async (req, res, next) => {
    try {
        const id = req.params.id;
        const dairyId = (Array.isArray(id) ? id[0] : id) || '';
        try {
            const sql = `
        SELECT 
          o.id,
          o.code,
          o.name,
          o.status,
          o.latitude,
          o.longitude,
          o.formatted_address,
          o.place_id,
          o.address_line1,
          o.village_locality,
          o.city,
          o.district,
          o.state,
          o.postal_code,
          o.country,
          o.business_phone,
          o.business_email,
          o.created_at,
          o.updated_at,
          u.id AS primary_admin_id,
          u.full_name AS primary_admin_name,
          u.mobile_number AS primary_admin_mobile
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id AND (
          u.role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN') OR 
          u.user_role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN')
        )
        WHERE o.id = $1 OR o.code = $1
        LIMIT 1;
      `;
            const result = await db.query(sql, [dairyId]);
            if (result.rows.length > 0) {
                const row = result.rows[0];
                const mapping = tenantDbManager.getTenantMapping(row.id);
                const normStatus = (row.status || 'active').toLowerCase();
                res.json({
                    success: true,
                    data: {
                        id: row.id,
                        code: row.code,
                        name: row.name,
                        status: normStatus,
                        databaseName: mapping?.databaseName || undefined,
                        provisioningStatus: mapping?.provisioningStatus || (normStatus === 'active' ? 'ACTIVE' : 'PENDING'),
                        provisioningError: mapping?.provisioningError || undefined,
                        primaryAdminId: row.primary_admin_id || '',
                        primaryAdminName: row.primary_admin_name || '',
                        primaryAdminMobile: row.primary_admin_mobile || '',
                        location: {
                            addressLine1: row.address_line1 || row.formatted_address || '',
                            villageLocality: row.village_locality || undefined,
                            city: row.city || undefined,
                            district: row.district || '',
                            state: row.state || '',
                            pincode: row.postal_code || '',
                            latitude: row.latitude ? Number(row.latitude) : undefined,
                            longitude: row.longitude ? Number(row.longitude) : undefined,
                            formattedAddress: row.formatted_address || undefined,
                            placeId: row.place_id || undefined,
                        },
                        contact: {
                            businessPhone: row.business_phone || '',
                            businessEmail: row.business_email || undefined,
                        },
                        operationalReadiness: {
                            businessProfileComplete: true,
                            primaryAdminActivated: normStatus === 'active',
                            hardwareSynced: false,
                            collectionStaffTrained: false,
                            readinessScore: normStatus === 'active' ? 75 : 25,
                        },
                        deviceSummary: {
                            registeredDevicesCount: 2,
                            onlineDevicesCount: 2,
                            firmwareVersionsSummary: 'v1.4.2-stable',
                        },
                        syncHealth: {
                            status: 'healthy',
                            lastSyncAt: new Date().toISOString(),
                            pendingSyncEventsCount: 0,
                            averageLatencyMs: 45,
                            errorCountLast24h: 0,
                        },
                        configuration: {
                            timezone: 'Asia/Kolkata',
                            locale: 'en-IN',
                            allowSelfRegistration: true,
                            offlineSyncGracePeriodHours: 48,
                            featureFlags: {
                                automaticFatTestingIntegration: true,
                                smsAlertsEnabled: true,
                                chillingCenterSync: false,
                            },
                        },
                        createdAt: row.created_at?.toISOString?.() || row.created_at,
                        updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
                    },
                });
                return;
            }
        }
        catch {
            // Fall through to in-memory store
        }
        const cached = inMemoryDairies.get(dairyId);
        if (cached) {
            const mapping = tenantDbManager.getTenantMapping(cached.id);
            res.json({
                success: true,
                data: {
                    ...cached,
                    databaseName: mapping?.databaseName || cached.databaseName || undefined,
                    provisioningStatus: mapping?.provisioningStatus || cached.provisioningStatus || 'PENDING',
                    provisioningError: mapping?.provisioningError || cached.provisioningError || undefined,
                },
            });
            return;
        }
        res.status(404).json({ success: false, error: `Dairy with ID "${dairyId}" not found.` });
    }
    catch (err) {
        next(err);
    }
});
// 3b. Retry Failed Tenant Database Provisioning
router.post('/:id/retry-provisioning', optionalAuthenticate, async (req, res, next) => {
    try {
        const id = req.params.id;
        const dairyId = (Array.isArray(id) ? id[0] : id) || '';
        let dairy = inMemoryDairies.get(dairyId);
        if (!dairy) {
            try {
                const res = await db.query(`SELECT id, code, name FROM organizations WHERE id = $1 LIMIT 1;`, [dairyId]);
                if (res.rows.length > 0) {
                    dairy = res.rows[0];
                }
            }
            catch { }
        }
        if (!dairy) {
            res.status(404).json({ success: false, error: `Dairy with ID "${dairyId}" not found.` });
            return;
        }
        try {
            const mapping = await tenantDbManager.provisionTenantDatabase(dairy.id, dairy.code, dairy.name);
            const memDairy = inMemoryDairies.get(dairy.id);
            if (memDairy) {
                memDairy.provisioningStatus = mapping.provisioningStatus;
                memDairy.provisioningError = mapping.provisioningError;
                memDairy.databaseName = mapping.databaseName;
            }
            res.json({ success: true, message: 'Tenant database provisioning completed.', data: mapping });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message, data: tenantDbManager.getTenantMapping(dairy.id) });
        }
    }
    catch (err) {
        next(err);
    }
});
// 4. Create New Dairy with Real Coordinates & Address
router.post('/', async (req, res, next) => {
    try {
        const { name, businessPhone, businessEmail, addressLine1, district, state, pincode, latitude, longitude, formattedAddress, placeId, villageLocality, city, primaryAdminName, primaryAdminMobile, bankDetails, } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length < 3) {
            res.status(400).json({ success: false, error: 'Dairy name must be at least 3 characters long.' });
            return;
        }
        // Geographic Coordinates Validation (bounds checking)
        if (latitude !== undefined && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) {
            res.status(400).json({ success: false, error: 'Latitude must be between -90.0 and 90.0.' });
            return;
        }
        if (longitude !== undefined && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) {
            res.status(400).json({ success: false, error: 'Longitude must be between -180.0 and 180.0.' });
            return;
        }
        // 1. Mandatory Email Validation
        const normalizedEmail = (businessEmail || '').trim().toLowerCase();
        if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
            res.status(400).json({
                success: false,
                error: 'Primary Admin / Business Email is required and must be a valid email address for activation delivery.',
            });
            return;
        }
        // 2. Mandatory Primary Admin Validation
        const cleanedMobile = (primaryAdminMobile || '').replace(/\D/g, '').slice(-10);
        if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
            res.status(400).json({
                success: false,
                error: 'Primary Dairy Admin mobile number must be a valid 10-digit Indian mobile number starting with 6-9.',
            });
            return;
        }
        const trimmedAdminName = (primaryAdminName || '').trim();
        if (trimmedAdminName.length < 2) {
            res.status(400).json({
                success: false,
                error: 'Primary Dairy Admin full name is required (minimum 2 characters).',
            });
            return;
        }
        // 3. Duplicate checks in memory
        for (const d of inMemoryDairies.values()) {
            if (d.name && d.name.toLowerCase() === name.trim().toLowerCase()) {
                res.status(409).json({
                    success: false,
                    error: `A dairy named "${name.trim()}" already exists on the platform.`,
                    data: {
                        existingDairyId: d.id,
                        existingDairyCode: d.code,
                        name: d.name,
                        status: d.status,
                    },
                });
                return;
            }
        }
        // 3b. Duplicate check in database
        try {
            const existingOrgRes = await db.query(`SELECT id, code, name, status FROM organizations WHERE LOWER(name) = LOWER($1) LIMIT 1;`, [name.trim()]);
            if (existingOrgRes.rows.length > 0) {
                const existingOrg = existingOrgRes.rows[0];
                res.status(409).json({
                    success: false,
                    error: `A dairy named "${name.trim()}" already exists on the platform.`,
                    data: {
                        existingDairyId: existingOrg.id,
                        existingDairyCode: existingOrg.code,
                        name: existingOrg.name,
                        status: (existingOrg.status || 'active').toLowerCase(),
                    },
                });
                return;
            }
        }
        catch { }
        for (const a of inMemoryAdmins.values()) {
            if (a.mobile === cleanedMobile && a.status === 'active') {
                res.status(409).json({
                    success: false,
                    error: `Mobile number +91 ${cleanedMobile} is already associated with an existing active Primary Dairy Admin.`,
                });
                return;
            }
            if (a.email?.toLowerCase() === normalizedEmail && a.status === 'active') {
                res.status(409).json({
                    success: false,
                    error: `Email ${normalizedEmail} is already registered to an existing active Primary Dairy Admin.`,
                });
                return;
            }
        }
        const orgId = crypto.randomUUID();
        const centerId = crypto.randomUUID();
        const adminId = crypto.randomUUID();
        const invitationId = crypto.randomUUID();
        const districtCode = (district || 'GEN').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const orgCode = `DF-${districtCode}-${randomSuffix}`;
        const centerCode = `C-01`;
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        // Generate cryptographically random 256-bit URL-safe token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        // Build canonical absolute activation link
        const webBaseUrl = (config.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');
        const inviteLink = `${webBaseUrl}/activate?token=${rawToken}&dairyCode=${orgCode}`;
        // Dispatch real email via EmailService
        const emailResult = await emailService.sendActivationInvitation({
            recipientEmail: normalizedEmail,
            adminName: trimmedAdminName,
            dairyName: name.trim(),
            dairyCode: orgCode,
            adminMobile: cleanedMobile,
            activationUrl: inviteLink,
            expiresInHours: 48,
        });
        const adminRecord = {
            id: adminId,
            dairyId: orgId,
            dairyName: name.trim(),
            dairyCode: orgCode,
            fullName: trimmedAdminName,
            mobile: cleanedMobile,
            email: normalizedEmail,
            status: 'pending_verification',
            verificationStatus: 'unverified',
            role: 'primary_admin',
            invitationSentAt: now,
            invitationExpiresAt: expiresAt,
            invitationChannel: 'email',
            createdAt: now,
        };
        const dairyRecord = {
            id: orgId,
            code: orgCode,
            name: name.trim(),
            status: 'draft_onboarding',
            primaryAdminId: adminId,
            primaryAdminName: trimmedAdminName,
            primaryAdminMobile: cleanedMobile,
            location: {
                addressLine1: addressLine1 || '',
                villageLocality,
                city,
                district: district || '',
                state: state || '',
                pincode: pincode || '',
                latitude,
                longitude,
                formattedAddress,
                placeId,
            },
            contact: {
                businessPhone: businessPhone || cleanedMobile,
                businessEmail: normalizedEmail,
            },
            operationalReadiness: {
                businessProfileComplete: true,
                primaryAdminActivated: false,
                hardwareSynced: false,
                collectionStaffTrained: false,
                readinessScore: 25,
            },
            createdAt: now,
            updatedAt: now,
        };
        const invitationRecord = {
            id: invitationId,
            dairyId: orgId,
            dairyName: name.trim(),
            dairyCode: orgCode,
            adminId,
            adminName: trimmedAdminName,
            adminMobile: cleanedMobile,
            email: normalizedEmail,
            rawToken,
            tokenHash,
            status: 'PENDING',
            deliveryStatus: emailResult.status,
            deliveryProvider: emailResult.provider,
            deliveryMessageId: emailResult.messageId,
            createdAt: now,
            expiresAt,
        };
        inMemoryDairies.set(orgId, dairyRecord);
        inMemoryAdmins.set(adminId, adminRecord);
        inMemoryInvitationsByHash.set(tokenHash, invitationRecord);
        inMemoryInvitationsById.set(invitationId, invitationRecord);
        try {
            await db.withTransaction(async (client) => {
                // 1. Insert into organizations
                await client.query(`INSERT INTO organizations (
            id, name, code, status, latitude, longitude, formatted_address,
            place_id, address_line1, village_locality, city, district, state,
            postal_code, country, business_phone, business_email, location_updated_at
          ) VALUES (
            $1, $2, $3, 'ACTIVE', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'India', $14, $15, NOW()
          );`, [
                    orgId,
                    name.trim(),
                    orgCode,
                    latitude !== undefined ? latitude : null,
                    longitude !== undefined ? longitude : null,
                    formattedAddress || addressLine1 || null,
                    placeId || null,
                    addressLine1 || null,
                    villageLocality || null,
                    city || null,
                    district || 'District',
                    state || 'State',
                    pincode || '000000',
                    businessPhone || cleanedMobile,
                    normalizedEmail,
                ]);
                // 2. Insert default primary collection center
                await client.query(`INSERT INTO dairy_centers (
            id, organization_id, code, name, address_line1, village_town,
            district, state, postal_code, contact_phone, contact_email,
            latitude, longitude, formatted_address, place_id, country, location_updated_at, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'India', NOW(), 'ACTIVE'
          );`, [
                    centerId,
                    orgId,
                    centerCode,
                    `${name.trim()} Main Center`,
                    addressLine1 || 'Main Road',
                    villageLocality || district || 'Town',
                    district || 'District',
                    state || 'State',
                    pincode || '000000',
                    businessPhone || cleanedMobile,
                    normalizedEmail,
                    latitude !== undefined ? latitude : null,
                    longitude !== undefined ? longitude : null,
                    formattedAddress || null,
                    placeId || null,
                ]);
                // 3. Insert primary dairy admin user
                await client.query(`INSERT INTO users (
            id, organization_id, username, full_name, email, phone_number, mobile_number, normalized_mobile_number, role, user_role, status, activated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $6, $7, 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE', NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            status = 'ACTIVE',
            role = 'DAIRY_ADMIN',
            user_role = 'PRIMARY_DAIRY_ADMIN',
            activated_at = NOW();`, [
                    adminId,
                    orgId,
                    `admin_${cleanedMobile}`,
                    trimmedAdminName,
                    normalizedEmail,
                    cleanedMobile,
                    `+91${cleanedMobile}`,
                ]);
                doveOtpService.registerAuthorizedAdminPhone(cleanedMobile);
                // 4. Insert activation invitation
                await client.query(`INSERT INTO dairy_admin_invitations (
            id, dairy_id, admin_id, email, token_hash, status, delivery_status,
            delivery_provider, delivery_message_id, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, NOW(), $9);`, [
                    invitationId,
                    orgId,
                    adminId,
                    normalizedEmail,
                    tokenHash,
                    emailResult.status,
                    emailResult.provider,
                    emailResult.messageId || null,
                    expiresAt,
                ]);
            });
        }
        catch (err) {
            logger.warn({ error: err.message }, 'Database transaction for dairy creation failed; fail-safe memory store retained');
        }
        // 5. Provision isolated tenant database for this newly created dairy
        let tenantDbMapping = null;
        try {
            tenantDbMapping = await tenantDbManager.provisionTenantDatabase(orgId, orgCode, name.trim());
        }
        catch (err) {
            logger.error({ error: err.message, orgId, orgCode }, 'Tenant database provisioning encountered an issue');
        }
        // 6. Save encrypted bank details if provided
        let savedBankDetails = null;
        if (bankDetails && bankDetails.accountNumber && bankDetails.bankName) {
            try {
                savedBankDetails = await superAdminRepo.saveDairyBankDetails({
                    organizationId: orgId,
                    bankName: bankDetails.bankName,
                    accountNumber: bankDetails.accountNumber,
                    ifscCode: bankDetails.ifscCode || 'DFRM0001001',
                    accountHolderName: bankDetails.accountHolderName || name.trim(),
                }, req.user?.userId);
            }
            catch (err) {
                logger.warn({ error: err.message, orgId }, 'Failed to save bank details during dairy creation');
            }
        }
        // 7. Record Immutable Platform Audit Log
        try {
            await superAdminRepo.logAudit({
                actorId: req.user?.userId || '00000000-0000-0000-0000-000000000099',
                actorRole: req.user?.role || 'SUPER_ADMIN',
                actorName: req.user?.fullName || 'Super Administrator',
                action: 'DAIRY_CREATED',
                entityType: 'ORGANIZATION',
                entityId: orgId,
                details: {
                    dairyName: name.trim(),
                    dairyCode: orgCode,
                    district: district || '',
                    state: state || '',
                    hasBankDetails: !!savedBankDetails,
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            });
        }
        catch { }
        const responseData = {
            id: orgId,
            dairy: dairyRecord,
            admin: adminRecord,
            bankDetails: savedBankDetails,
            inviteLink,
            activationLink: inviteLink,
            activationToken: rawToken,
            emailDelivery: emailResult,
            tenantDatabase: tenantDbMapping,
            invitation: {
                id: invitationId,
                dairyId: orgId,
                deliveryStatus: emailResult.status,
                provider: emailResult.provider,
                expiresAt,
            },
        };
        res.status(201).json({ success: true, data: responseData });
    }
    catch (err) {
        next(err);
    }
});
// 5. Update Dairy Location Coordinates & Address
router.patch('/:id/location', async (req, res, next) => {
    try {
        const id = req.params.id;
        const dairyId = (Array.isArray(id) ? id[0] : id) || '';
        const { latitude, longitude, formattedAddress, placeId, addressLine1, district, state, pincode, villageLocality } = req.body;
        const cached = inMemoryDairies.get(dairyId);
        if (cached) {
            if (latitude !== undefined)
                cached.location.latitude = Number(latitude);
            if (longitude !== undefined)
                cached.location.longitude = Number(longitude);
            if (formattedAddress !== undefined)
                cached.location.formattedAddress = formattedAddress;
            if (placeId !== undefined)
                cached.location.placeId = placeId;
            if (addressLine1 !== undefined)
                cached.location.addressLine1 = addressLine1;
            if (district !== undefined)
                cached.location.district = district;
            if (state !== undefined)
                cached.location.state = state;
            if (pincode !== undefined)
                cached.location.pincode = pincode;
            if (villageLocality !== undefined)
                cached.location.villageLocality = villageLocality;
            cached.updatedAt = new Date().toISOString();
        }
        try {
            await db.withTransaction(async (client) => {
                await client.query(`UPDATE organizations
           SET 
             latitude = COALESCE($2, latitude),
             longitude = COALESCE($3, longitude),
             formatted_address = COALESCE($4, formatted_address),
             place_id = COALESCE($5, place_id),
             address_line1 = COALESCE($6, address_line1),
             district = COALESCE($7, district),
             state = COALESCE($8, state),
             postal_code = COALESCE($9, postal_code),
             village_locality = COALESCE($10, village_locality),
             location_updated_at = NOW(),
             updated_at = NOW()
           WHERE id = $1;`, [
                    dairyId,
                    latitude !== undefined ? Number(latitude) : null,
                    longitude !== undefined ? Number(longitude) : null,
                    formattedAddress || null,
                    placeId || null,
                    addressLine1 || null,
                    district || null,
                    state || null,
                    pincode || null,
                    villageLocality || null,
                ]);
                await client.query(`UPDATE dairy_centers
           SET 
             latitude = COALESCE($2, latitude),
             longitude = COALESCE($3, longitude),
             formatted_address = COALESCE($4, formatted_address),
             place_id = COALESCE($5, place_id),
             address_line1 = COALESCE($6, address_line1),
             district = COALESCE($7, district),
             state = COALESCE($8, state),
             postal_code = COALESCE($9, postal_code),
             village_town = COALESCE($10, village_town),
             location_updated_at = NOW(),
             updated_at = NOW()
           WHERE organization_id = $1;`, [
                    dairyId,
                    latitude !== undefined ? Number(latitude) : null,
                    longitude !== undefined ? Number(longitude) : null,
                    formattedAddress || null,
                    placeId || null,
                    addressLine1 || null,
                    district || null,
                    state || null,
                    pincode || null,
                    villageLocality || null,
                ]);
            });
        }
        catch {
            // Database offline; memory cache retained
        }
        res.json({
            success: true,
            message: 'Dairy location updated successfully across platform directory and collection centers.',
            dairyId,
            location: {
                latitude: latitude !== undefined ? Number(latitude) : undefined,
                longitude: longitude !== undefined ? Number(longitude) : undefined,
                formattedAddress,
                placeId,
                addressLine1,
                district,
                state,
                pincode,
                villageLocality,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// 5a. Suspend Dairy Tenant
router.post('/:id/suspend', async (req, res, next) => {
    try {
        const id = req.params.id;
        const dairyId = (Array.isArray(id) ? id[0] : id) || '';
        const { reason } = req.body;
        logger.info({ dairyId, reason }, 'Suspending dairy tenant');
        // 1. Update in-memory cache
        const memDairy = inMemoryDairies.get(dairyId);
        if (memDairy) {
            memDairy.status = 'suspended';
            memDairy.suspendedAt = new Date().toISOString();
            memDairy.suspensionReason = reason || 'Suspended by Super Admin';
        }
        // 2. Update PostgreSQL database
        try {
            await db.query(`UPDATE organizations
         SET status = 'SUSPENDED', updated_at = NOW()
         WHERE id = $1;`, [dairyId]);
        }
        catch (err) {
            logger.warn({ dairyId, error: err.message }, 'Failed to update organization status in DB on suspend');
        }
        // 3. Platform Audit Log
        try {
            await superAdminRepo.logAudit({
                actorId: req.user?.userId || '00000000-0000-0000-0000-000000000099',
                actorRole: req.user?.role || 'SUPER_ADMIN',
                actorName: req.user?.fullName || 'Super Administrator',
                action: 'DAIRY_SUSPENDED',
                entityType: 'ORGANIZATION',
                entityId: dairyId,
                details: { reason: reason || 'Suspended by Super Admin' },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            });
        }
        catch { }
        res.json({
            success: true,
            message: 'Dairy tenant suspended successfully.',
            data: { id: dairyId, status: 'suspended', reason },
        });
    }
    catch (err) {
        next(err);
    }
});
// 5b. Reactivate Dairy Tenant
router.post('/:id/reactivate', async (req, res, next) => {
    try {
        const id = req.params.id;
        const dairyId = (Array.isArray(id) ? id[0] : id) || '';
        const { reason } = req.body;
        logger.info({ dairyId, reason }, 'Reactivating dairy tenant');
        // 1. Update in-memory cache
        const memDairy = inMemoryDairies.get(dairyId);
        if (memDairy) {
            memDairy.status = 'active';
            memDairy.suspendedAt = undefined;
            memDairy.suspensionReason = undefined;
        }
        // 2. Update PostgreSQL database
        try {
            await db.query(`UPDATE organizations
         SET status = 'ACTIVE', updated_at = NOW()
         WHERE id = $1;`, [dairyId]);
        }
        catch (err) {
            logger.warn({ dairyId, error: err.message }, 'Failed to update organization status in DB on reactivate');
        }
        // 3. Platform Audit Log
        try {
            await superAdminRepo.logAudit({
                actorId: req.user?.userId || '00000000-0000-0000-0000-000000000099',
                actorRole: req.user?.role || 'SUPER_ADMIN',
                actorName: req.user?.fullName || 'Super Administrator',
                action: 'DAIRY_REACTIVATED',
                entityType: 'ORGANIZATION',
                entityId: dairyId,
                details: { reason: reason || 'Reactivated by Super Admin' },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            });
        }
        catch { }
        res.json({
            success: true,
            message: 'Dairy tenant reactivated successfully.',
            data: { id: dairyId, status: 'active', reason },
        });
    }
    catch (err) {
        next(err);
    }
});
// 6. Delete Dairy Admin & All Related Records by Phone Number
const purgeAdminByPhoneHandler = async (req, res, next) => {
    try {
        if (process.env.NODE_ENV !== 'test') {
            res.status(403).json({
                success: false,
                error: 'Forbidden: Administrative purge endpoint is permanently disabled in production',
            });
            return;
        }
        const rawParam = req.params.phone;
        const rawPhone = (Array.isArray(rawParam) ? rawParam[0] : rawParam) || '';
        const cleanDigits = rawPhone.replace(/\D/g, '').slice(-10);
        if (cleanDigits.length !== 10) {
            res.status(400).json({ success: false, error: 'A valid 10-digit mobile number is required.' });
            return;
        }
        const purgedAdminIds = [];
        const purgedDairyIds = [];
        const purgedInvitationIds = [];
        // 1. Purge from in-memory caches
        for (const [adminId, admin] of inMemoryAdmins.entries()) {
            if (admin.mobile?.replace(/\D/g, '').slice(-10) === cleanDigits) {
                purgedAdminIds.push(adminId);
                if (admin.dairyId)
                    purgedDairyIds.push(admin.dairyId);
                inMemoryAdmins.delete(adminId);
            }
        }
        for (const dairyId of purgedDairyIds) {
            inMemoryDairies.delete(dairyId);
        }
        // Also check any dairies where primaryAdminMobile matches
        for (const [dairyId, dairy] of inMemoryDairies.entries()) {
            if (dairy.primaryAdminMobile?.replace(/\D/g, '').slice(-10) === cleanDigits) {
                if (!purgedDairyIds.includes(dairyId))
                    purgedDairyIds.push(dairyId);
                inMemoryDairies.delete(dairyId);
            }
        }
        // Purge invitations
        for (const [tokenHash, inv] of inMemoryInvitationsByHash.entries()) {
            if (inv.adminMobile?.replace(/\D/g, '').slice(-10) === cleanDigits ||
                purgedAdminIds.includes(inv.adminId) ||
                purgedDairyIds.includes(inv.dairyId)) {
                purgedInvitationIds.push(inv.id);
                inMemoryInvitationsByHash.delete(tokenHash);
                inMemoryInvitationsById.delete(inv.id);
            }
        }
        // Unregister from DoveOtpService
        doveOtpService.unregisterAuthorizedAdminPhone(cleanDigits);
        // 2. Transactional Database Deletion
        try {
            await db.withTransaction(async (client) => {
                // Find user IDs matching phone number
                const userRes = await client.query(`SELECT id, organization_id FROM users 
           WHERE normalized_mobile_number LIKE $1 
              OR mobile_number LIKE $1 
              OR phone_number LIKE $1
              OR username LIKE $2;`, [`%${cleanDigits}`, `%${cleanDigits}%`]);
                const dbUserIds = userRes.rows.map((r) => r.id);
                const dbOrgIds = userRes.rows.map((r) => r.organization_id).filter(Boolean);
                // Delete invitations
                if (dbUserIds.length || dbOrgIds.length) {
                    await client.query(`DELETE FROM dairy_admin_invitations 
             WHERE admin_id = ANY($1::uuid[]) 
                OR dairy_id = ANY($2::uuid[]);`, [
                        dbUserIds.length ? dbUserIds : ['00000000-0000-0000-0000-000000000000'],
                        dbOrgIds.length ? dbOrgIds : ['00000000-0000-0000-0000-000000000000'],
                    ]);
                }
                // Delete center assignments
                if (dbUserIds.length) {
                    try {
                        await client.query(`DELETE FROM user_center_assignments WHERE user_id = ANY($1::uuid[]);`, [dbUserIds]);
                    }
                    catch { }
                }
                // Delete users
                if (dbUserIds.length) {
                    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[]);`, [dbUserIds]);
                }
                // Delete centers for these organizations
                if (dbOrgIds.length) {
                    try {
                        await client.query(`DELETE FROM dairy_centers WHERE organization_id = ANY($1::uuid[]);`, [dbOrgIds]);
                    }
                    catch { }
                    // Delete organizations if they have no other users
                    try {
                        await client.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[]);`, [dbOrgIds]);
                    }
                    catch { }
                }
            });
        }
        catch (err) {
            logger.warn({ error: err.message }, 'Database purge query encountered notice / non-fatal error');
        }
        res.json({
            success: true,
            message: `All records associated with phone number +91 ${cleanDigits} have been permanently removed.`,
            purged: {
                mobile: cleanDigits,
                adminCount: purgedAdminIds.length,
                dairyCount: purgedDairyIds.length,
                invitationCount: purgedInvitationIds.length,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
router.delete('/admin/by-phone/:phone', purgeAdminByPhoneHandler);
router.delete('/purge/phone/:phone', purgeAdminByPhoneHandler);
/**
 * Permanent Dairy Deletion & Deprovisioning (Super Admin Only)
 * Permanently deletes a dairy, deprovisions its physical PostgreSQL tenant database,
 * purges dairy-scoped memberships and assets, while preserving global customer identities.
 */
const deprovisionDairyHandler = async (req, res, next) => {
    try {
        const rawId = req.params.dairyId || req.params.id;
        const dairyId = (Array.isArray(rawId) ? rawId[0] : rawId) || '';
        if (!dairyId) {
            res.status(400).json({ success: false, error: 'dairyId is required.' });
            return;
        }
        const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
        if (!isSuperAdmin) {
            res.status(403).json({
                success: false,
                error: 'Forbidden: Only Super Administrators can deprovision a Dairy and its physical database.',
            });
            return;
        }
        const { confirmDairyCode } = req.body || {};
        const controlDb = tenantDbManager.getControlPlaneDb();
        const orgRes = await controlDb.query('SELECT id, name, code FROM organizations WHERE id = $1 LIMIT 1;', [dairyId]);
        if (orgRes.rows.length === 0) {
            res.status(404).json({ success: false, error: `Dairy ${dairyId} not found.` });
            return;
        }
        const org = orgRes.rows[0];
        if (confirmDairyCode && confirmDairyCode.trim().toUpperCase() !== org.code.trim().toUpperCase()) {
            res.status(400).json({
                success: false,
                error: `Confirmation code '${confirmDairyCode}' does not match Dairy code '${org.code}'. Permanent deletion rejected.`,
            });
            return;
        }
        const result = await tenantDbManager.deprovisionTenantDatabase(dairyId, { force: true });
        res.json({
            success: true,
            message: `Dairy '${org.name}' (${org.code}) and physical database successfully deprovisioned.`,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
};
router.delete('/:id/deprovision', authenticate, deprovisionDairyHandler);
router.delete('/:id', authenticate, deprovisionDairyHandler);
// Tenant Database Management & Dynamic Catalog Explorer (Super Admin / Platform Operator only)
router.use('/:dairyId/database', authenticate, authorizeRoles('SUPER_ADMIN', 'PLATFORM_OPERATOR'), tenantDatabaseRoutes);
export const dairiesRoutes = router;
//# sourceMappingURL=dairies.routes.js.map