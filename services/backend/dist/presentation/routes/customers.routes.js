import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { GetCustomersUseCase, GetCustomerByIdUseCase, RegisterCustomerUseCase, GetCustomerStatusUseCase, GetPendingCustomerRegistrationsUseCase, ApproveCustomerRegistrationUseCase, RejectCustomerRegistrationUseCase, UpdateCustomerBiometricsUseCase, SuspendCustomerUseCase, ReactivateCustomerUseCase, UpdateCustomerProfileUseCase, GetCustomerMembershipsUseCase, SelectDairyMembershipUseCase, } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository, PostgresCustomerMembershipRepository, Aes256GcmBiometricEncryptor, HmacJwtTokenService, } from '../../infrastructure/index.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { authorizePermission, hasPermission } from '../middleware/authorize.js';
import { CustomerNotFoundError } from '../../domain/errors/index.js';
import { PhoneNumber } from '../../domain/value-objects/index.js';
import { doveOtpService } from '../../infrastructure/otp/DoveOtpService.js';
import { logger } from '../../shared/logger/index.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: () => (process.env['NODE_ENV'] === 'test' ? 500 : 15),
    message: {
        success: false,
        code: 'TOO_MANY_REQUESTS',
        error: 'Too many registration requests from this IP. Please try again in a minute.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const membershipRepo = new PostgresCustomerMembershipRepository();
const tokenService = new HmacJwtTokenService();
const biometricEncryptor = new Aes256GcmBiometricEncryptor();
const getCustomersUseCase = new GetCustomersUseCase(customerRepo);
const getCustomerByIdUseCase = new GetCustomerByIdUseCase(customerRepo);
const registerCustomerUseCase = new RegisterCustomerUseCase(customerRepo, membershipRepo);
const getCustomerStatusUseCase = new GetCustomerStatusUseCase(customerRepo);
const getPendingRegistrationsUseCase = new GetPendingCustomerRegistrationsUseCase(customerRepo);
const approveRegistrationUseCase = new ApproveCustomerRegistrationUseCase(customerRepo, membershipRepo);
const rejectRegistrationUseCase = new RejectCustomerRegistrationUseCase(customerRepo, membershipRepo);
const updateBiometricsUseCase = new UpdateCustomerBiometricsUseCase(customerRepo, biometricEncryptor);
const suspendCustomerUseCase = new SuspendCustomerUseCase(customerRepo, membershipRepo);
const reactivateCustomerUseCase = new ReactivateCustomerUseCase(customerRepo, membershipRepo);
const updateProfileUseCase = new UpdateCustomerProfileUseCase(customerRepo);
const getMembershipsUseCase = new GetCustomerMembershipsUseCase(membershipRepo, customerRepo);
const selectDairyMembershipUseCase = new SelectDairyMembershipUseCase(membershipRepo, tokenService, customerRepo);
// 1. List / Search Customers (Kiosk and Admin)
router.get('/', authenticate, authorizePermission('customers:read', 'customers:identify_face', 'customers:identify_rfid', 'customers:identify_manual'), async (req, res, next) => {
    try {
        let organizationId = req.user.organizationId;
        const headerOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'];
        const queryOrgId = req.query['organizationId'];
        if (req.user?.role !== 'SUPER_ADMIN') {
            if ((queryOrgId && queryOrgId !== organizationId) || (headerOrgId && headerOrgId !== organizationId)) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-dairy query blocked: Cannot query customer data of another dairy.',
                });
                return;
            }
        }
        else {
            organizationId = queryOrgId || headerOrgId || organizationId;
        }
        if (!organizationId) {
            res.status(400).json({
                success: false,
                error: 'Dairy context (organizationId) is required.',
            });
            return;
        }
        const centerId = req.query['centerId'] || req.user?.centerId;
        const search = req.query['search'];
        const category = req.query['category'];
        const limit = req.query['limit'] ? Number(req.query['limit']) : 100;
        const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
        const includeSoftDeleted = req.query['includeSoftDeleted'] === 'true' || req.query['showDeleted'] === 'true';
        const data = await getCustomersUseCase.execute({
            organizationId,
            centerId,
            search,
            category,
            limit,
            offset,
            includeSoftDeleted,
        });
        res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        next(err);
    }
});
// 2. Authenticated Customer Profile (Farmer App)
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const customerId = req.user.userId;
        const data = await getCustomerByIdUseCase.execute(customerId, req.user?.organizationId);
        // Safely mask bank account number
        const maskedData = { ...data };
        if (maskedData.bankDetails && maskedData.bankDetails.accountNumber) {
            const rawAcc = String(maskedData.bankDetails.accountNumber);
            maskedData.bankDetails = {
                ...maskedData.bankDetails,
                accountNumberMask: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
                accountNumber: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
            };
        }
        // Map dairy details for customer mobile app schema compatibility
        maskedData.dairyId = maskedData.organizationId;
        maskedData.milkSupplyType = Array.isArray(maskedData.categories)
            ? (maskedData.categories.includes('COW') && maskedData.categories.includes('BUFFALO') ? 'BOTH' : (maskedData.categories[0] || 'COW'))
            : (maskedData.category || 'COW');
        maskedData.isBiometricEnrolled = Boolean(maskedData.faceTemplateEnrolled);
        maskedData.biometricStatus = {
            isEnrolled: Boolean(maskedData.faceTemplateEnrolled),
            status: maskedData.faceTemplateEnrolled ? 'ENROLLED' : (maskedData.faceEnrollmentStatus || 'NOT_ENROLLED'),
            version: 'sface_int8_2021dec',
        };
        if (maskedData.organizationId) {
            try {
                const controlDb = tenantDbManager.getControlPlaneDb();
                const orgRes = await controlDb.query('SELECT name, code FROM organizations WHERE id = $1 LIMIT 1;', [maskedData.organizationId]);
                if (orgRes.rows.length > 0) {
                    maskedData.dairyName = orgRes.rows[0].name || maskedData.dairyName;
                    maskedData.dairyCode = orgRes.rows[0].code || maskedData.dairyCode;
                }
            }
            catch { }
        }
        maskedData.dairyName = maskedData.dairyName || 'DFarm Cooperative Society';
        maskedData.dairyCode = maskedData.dairyCode || 'DFARM';
        maskedData.membershipStatus = maskedData.registrationStatus || (maskedData.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL');
        res.json({ success: true, data: maskedData, ...maskedData });
    }
    catch (err) {
        next(err);
    }
});
// 2b. Multi-Dairy Customer Memberships Discovery
router.get('/memberships', authenticate, async (req, res, next) => {
    try {
        const isStaff = req.user?.actorType === 'STAFF';
        const tokenPhone = req.user?.userId?.startsWith('unregistered:')
            ? req.user.userId.replace('unregistered:', '')
            : req.user?.phoneNumber;
        const requestedGlobalId = req.query['globalCustomerId'];
        const requestedPhone = req.query['phone'] || req.query['mobileNumber'];
        if (!isStaff) {
            if (requestedGlobalId && req.user?.globalCustomerId && requestedGlobalId !== req.user.globalCustomerId) {
                res.status(403).json({ success: false, error: 'Cross-customer membership lookup blocked.' });
                return;
            }
            if (requestedPhone && tokenPhone && requestedPhone !== tokenPhone) {
                res.status(403).json({ success: false, error: 'Cross-customer phone membership lookup blocked.' });
                return;
            }
        }
        const userPhone = isStaff ? (requestedPhone || tokenPhone) : tokenPhone;
        const globalCustomerId = isStaff
            ? (requestedGlobalId || req.user?.globalCustomerId)
            : req.user?.globalCustomerId;
        const result = await getMembershipsUseCase.execute({
            globalCustomerId,
            phone: userPhone,
            customerId: req.user?.userId,
            organizationId: req.user?.organizationId,
        });
        res.json({
            success: true,
            count: result.memberships.length,
            globalCustomerId: result.globalCustomerId,
            data: result.memberships,
            memberships: result.memberships,
        });
    }
    catch (err) {
        next(err);
    }
});
// 2c. Dairy Switching (Issue tenant-isolated session)
router.post('/switch-dairy', authenticate, async (req, res, next) => {
    try {
        const dairyId = req.body.dairyId || req.body.organizationId;
        if (!dairyId) {
            res.status(400).json({ success: false, error: 'dairyId (or organizationId) is required to switch dairy.' });
            return;
        }
        const result = await selectDairyMembershipUseCase.execute({
            globalCustomerId: req.user?.globalCustomerId || req.body.globalCustomerId,
            dairyId,
            tenantCustomerId: req.user?.userId || req.body.tenantCustomerId,
            phone: req.user?.phoneNumber || req.body.phone,
        });
        res.json({
            success: true,
            message: `Switched active dairy to ${result.selectedDairy.dairyName}`,
            ...result,
        });
    }
    catch (err) {
        next(err);
    }
});
// 3. Register Customer (Self-registration with mandatory identity proof or authorized staff onboarding)
router.post('/register', registrationLimiter, optionalAuthenticate, async (req, res, next) => {
    try {
        const body = req.body;
        const userPhone = req.user?.userId?.startsWith('unregistered:')
            ? req.user.userId.replace('unregistered:', '')
            : req.user?.phoneNumber;
        const rawPhone = body.mobileNumber || body.phone || userPhone;
        if (!rawPhone) {
            res.status(400).json({
                success: false,
                code: 'MISSING_PHONE',
                error: 'Mobile number is mandatory for producer registration.',
            });
            return;
        }
        let phoneE164;
        try {
            phoneE164 = new PhoneNumber(rawPhone).e164;
        }
        catch (phoneErr) {
            res.status(400).json({
                success: false,
                code: 'INVALID_PHONE',
                error: phoneErr?.message || 'Invalid mobile number format.',
            });
            return;
        }
        const targetOrgId = (body.organizationId || body.dairyId || body.selectedDairyId);
        if (!targetOrgId) {
            res.status(400).json({
                success: false,
                code: 'MISSING_ORGANIZATION',
                error: 'Dairy selection (organizationId) is required for customer registration.',
            });
            return;
        }
        if (!UUID_REGEX.test(targetOrgId)) {
            res.status(400).json({
                success: false,
                code: 'INVALID_ORGANIZATION_ID',
                error: 'Invalid dairy organization identifier.',
            });
            return;
        }
        // Phase 4A: Verify caller identity proof before creating or updating any customer record
        if (req.user?.actorType === 'STAFF') {
            if (!hasPermission(req.user.role, 'customers:update') &&
                !hasPermission(req.user.role, 'customers:approve') &&
                req.user.role !== 'SUPER_ADMIN') {
                res.status(403).json({ success: false, error: 'Forbidden: Staff role lacks customer registration permission.' });
                return;
            }
            if (req.user.role !== 'SUPER_ADMIN' && req.user.organizationId && targetOrgId.toLowerCase() !== req.user.organizationId.toLowerCase()) {
                res.status(403).json({ success: false, error: 'Cross-dairy customer registration blocked.' });
                return;
            }
        }
        else if (req.user?.actorType === 'CUSTOMER') {
            if (!userPhone) {
                res.status(401).json({
                    success: false,
                    code: 'REGISTRATION_PROOF_REQUIRED',
                    error: 'Verified phone registration session is required.',
                });
                return;
            }
            let tokenPhoneE164;
            try {
                tokenPhoneE164 = new PhoneNumber(userPhone).e164;
            }
            catch {
                res.status(401).json({
                    success: false,
                    code: 'REGISTRATION_PROOF_REQUIRED',
                    error: 'Verified phone registration session is invalid.',
                });
                return;
            }
            if (tokenPhoneE164 !== phoneE164) {
                res.status(403).json({
                    success: false,
                    code: 'PHONE_MISMATCH',
                    error: 'Authenticated phone number does not match registration mobile number.',
                });
                return;
            }
        }
        else {
            // Unauthenticated caller must present a valid OTP proof bound to the normalized phone number
            const inlineOtp = typeof body.otp === 'string' ? body.otp.trim() : '';
            if (!inlineOtp) {
                res.status(401).json({
                    success: false,
                    code: 'REGISTRATION_PROOF_REQUIRED',
                    error: 'Phone verification proof (OTP or verified registration token) is required before registration.',
                });
                return;
            }
            try {
                const otpValid = await doveOtpService.verifyOtp(phoneE164, inlineOtp, 'CUSTOMER_AUTH');
                if (!otpValid) {
                    res.status(401).json({
                        success: false,
                        code: 'INVALID_REGISTRATION_OTP',
                        error: 'Invalid or expired registration OTP.',
                    });
                    return;
                }
            }
            catch (otpErr) {
                res.status(otpErr?.statusCode || 401).json({
                    success: false,
                    code: otpErr?.code || 'INVALID_REGISTRATION_OTP',
                    error: otpErr?.message || 'Registration OTP verification failed.',
                });
                return;
            }
        }
        // Phase 4D: Validate biometric payload and explicit consent upfront before mutating DB
        if (body.faceTemplate !== undefined && body.faceTemplate !== null) {
            if (body.biometricConsent !== true) {
                res.status(400).json({
                    success: false,
                    code: 'BIOMETRIC_CONSENT_REQUIRED',
                    error: 'Explicit biometricConsent: true is required to enroll facial biometrics during registration.',
                });
                return;
            }
            const emb = body.faceTemplate?.embedding;
            if (!Array.isArray(emb) ||
                emb.length !== 128 ||
                emb.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
                res.status(400).json({
                    success: false,
                    code: 'INVALID_BIOMETRIC_PAYLOAD',
                    error: 'Face template embedding must be a finite 128-dimensional vector.',
                });
                return;
            }
            const sqNorm = emb.reduce((acc, v) => acc + v * v, 0);
            if (sqNorm < 0.01) {
                res.status(400).json({
                    success: false,
                    code: 'INVALID_BIOMETRIC_PAYLOAD',
                    error: 'Face template embedding has insufficient signal energy.',
                });
                return;
            }
            if (body.faceTemplate.confidence !== undefined &&
                (typeof body.faceTemplate.confidence !== 'number' || body.faceTemplate.confidence < 0.5)) {
                res.status(400).json({
                    success: false,
                    code: 'LOW_BIOMETRIC_QUALITY',
                    error: 'Face biometric quality confidence is below the minimum acceptance threshold.',
                });
                return;
            }
        }
        // Phase 4B & DF-017: Validate authoritative organization in control plane AND active tenant mapping
        let orgStatusRow = null;
        try {
            const controlDb = tenantDbManager.getControlPlaneDb();
            const orgRes = await controlDb.query(`SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`, [targetOrgId]);
            if (orgRes.rows.length > 0) {
                orgStatusRow = orgRes.rows[0];
            }
        }
        catch {
            res.status(503).json({
                success: false,
                code: 'ORGANIZATION_DB_UNAVAILABLE',
                error: 'Dairy organization verification database is unavailable. Please retry.',
            });
            return;
        }
        if (!orgStatusRow) {
            res.status(400).json({
                success: false,
                code: 'INVALID_ORGANIZATION',
                error: 'Selected dairy organization does not exist.',
            });
            return;
        }
        if (String(orgStatusRow.status || '').toUpperCase() !== 'ACTIVE') {
            res.status(403).json({
                success: false,
                code: 'ORGANIZATION_INACTIVE',
                error: 'Selected dairy organization is suspended or inactive and cannot accept registrations.',
            });
            return;
        }
        let tenantMapping;
        let tenantDb;
        try {
            tenantMapping = await tenantDbManager.resolveTenantMapping(targetOrgId);
            if (!tenantMapping) {
                res.status(503).json({
                    success: false,
                    code: 'TENANT_MAPPING_MISSING',
                    error: 'Selected dairy tenant database mapping is missing. Customer registration cannot proceed until database provisioning completes.',
                });
                return;
            }
            if (tenantMapping.provisioningStatus !== 'ACTIVE') {
                res.status(503).json({
                    success: false,
                    code: 'TENANT_DATABASE_UNAVAILABLE',
                    error: `Selected dairy tenant database (${tenantMapping.dairyCode}) is unavailable (provisioning status: ${tenantMapping.provisioningStatus}). Customer registration cannot proceed until database provisioning is resolved.`,
                    data: {
                        dairyId: targetOrgId,
                        dairyCode: tenantMapping.dairyCode,
                        provisioningStatus: tenantMapping.provisioningStatus,
                        provisioningError: tenantMapping.provisioningError,
                    },
                });
                return;
            }
            tenantDb = await tenantDbManager.getStrictTenantDb(targetOrgId);
        }
        catch (tenantErr) {
            res.status(503).json({
                success: false,
                code: tenantErr?.code || 'TENANT_DATABASE_UNAVAILABLE',
                error: tenantErr?.message || 'Selected dairy tenant database is unavailable. Please retry.',
            });
            return;
        }
        // Phase 4C & DF-017: Resolve center EXCLUSIVELY from the selected dairy's authoritative tenant database
        let centerId = body.centerId;
        if (centerId) {
            if (!UUID_REGEX.test(centerId)) {
                res.status(400).json({
                    success: false,
                    code: 'INVALID_CENTER_ID',
                    error: 'Invalid collection center identifier.',
                });
                return;
            }
            let centerRow = null;
            try {
                const tcRes = await tenantDb.query(`SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`, [centerId]);
                if (tcRes.rows.length > 0) {
                    centerRow = tcRes.rows[0];
                }
            }
            catch {
                res.status(503).json({
                    success: false,
                    code: 'CENTER_DB_UNAVAILABLE',
                    error: 'Registration center lookup database is unavailable. Please retry.',
                });
                return;
            }
            if (!centerRow) {
                // Read-only diagnostic check on central directory strictly to return accurate 403 CROSS_TENANT_CENTER error code
                // when caller explicitly submits a center belonging to another dairy. Never accepts central-only centers.
                try {
                    const controlDb = tenantDbManager.getControlPlaneDb();
                    const crossCheck = await controlDb.query(`SELECT organization_id FROM dairy_centers WHERE id = $1 LIMIT 1;`, [centerId]);
                    if (crossCheck.rows.length > 0 &&
                        crossCheck.rows[0].organization_id &&
                        String(crossCheck.rows[0].organization_id).toLowerCase() !== targetOrgId.toLowerCase()) {
                        res.status(403).json({
                            success: false,
                            code: 'CROSS_TENANT_CENTER',
                            error: 'Selected collection center does not belong to the chosen dairy organization.',
                        });
                        return;
                    }
                }
                catch {
                    // Proceed with strict INVALID_CENTER rejection below
                }
                res.status(400).json({
                    success: false,
                    code: 'INVALID_CENTER',
                    error: 'Selected collection center does not exist in the selected dairy.',
                });
                return;
            }
            if (String(centerRow.organization_id || '').toLowerCase() !== targetOrgId.toLowerCase()) {
                res.status(403).json({
                    success: false,
                    code: 'CROSS_TENANT_CENTER',
                    error: 'Selected collection center does not belong to the chosen dairy organization.',
                });
                return;
            }
            if (String(centerRow.status || '').toUpperCase() !== 'ACTIVE') {
                res.status(400).json({
                    success: false,
                    code: 'INACTIVE_CENTER',
                    error: 'Selected collection center is inactive.',
                });
                return;
            }
        }
        else {
            let centerRes;
            try {
                centerRes = await tenantDb.query(`SELECT id FROM dairy_centers WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`, [targetOrgId]);
            }
            catch {
                res.status(503).json({
                    success: false,
                    code: 'CENTER_DB_UNAVAILABLE',
                    error: 'Registration center lookup database is unavailable. Please retry.',
                });
                return;
            }
            if (centerRes.rows.length === 0) {
                res.status(400).json({
                    success: false,
                    code: 'NO_ACTIVE_CENTER',
                    error: 'No active collection center found for the selected dairy. Contact the dairy administrator.',
                });
                return;
            }
            centerId = centerRes.rows[0].id;
        }
        const categories = body.categories || (body.milkSupplyType ? (body.milkSupplyType === 'BOTH' ? ['COW', 'BUFFALO'] : [body.milkSupplyType]) : (body.category ? [body.category] : ['COW']));
        const data = await registerCustomerUseCase.execute({
            fullName: body.fullName || body.name || 'Registered Producer',
            mobileNumber: phoneE164,
            organizationId: targetOrgId,
            centerId,
            village: body.village,
            categories,
            bankDetails: body.bankDetails,
        });
        // If face biometric embedding is submitted, encrypt and save after registration succeeds
        if (body.faceTemplate?.embedding && Array.isArray(body.faceTemplate.embedding)) {
            try {
                await updateBiometricsUseCase.execute({
                    customerId: data.id,
                    organizationId: targetOrgId,
                    embedding: body.faceTemplate.embedding,
                    modelVersion: body.faceTemplate.modelVersion || 'sface_int8_2021dec',
                });
            }
            catch (bioErr) {
                logger.warn({ customerId: data.id, err: bioErr?.message }, 'Biometric enrollment failed during /register after pending customer creation');
                res.status(201).json({
                    success: true,
                    partialSuccess: true,
                    customerCreated: true,
                    biometricEnrolled: false,
                    code: 'BIOMETRIC_ENROLLMENT_PARTIAL_FAILURE',
                    warning: bioErr?.message || 'Customer registered as pending approval, but biometric enrollment failed. Please retry face enrollment.',
                    biometricError: {
                        code: bioErr?.code || 'BIOMETRIC_ENROLLMENT_FAILED',
                        message: bioErr?.message || 'Biometric enrollment failed.',
                    },
                    data: {
                        ...data,
                        isBiometricEnrolled: false,
                    },
                    customerUuid: data.id,
                    status: data.registrationStatus,
                    submissionTimestamp: new Date().toISOString(),
                });
                return;
            }
        }
        res.status(201).json({
            success: true,
            data,
            customerUuid: data.id,
            status: data.registrationStatus,
            submissionTimestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        if (err?.name === 'TenantDatabaseUnavailableError' || err?.message?.includes('Tenant database') || err?.message?.includes('No active persistent database')) {
            res.status(503).json({
                success: false,
                code: 'TENANT_DATABASE_UNAVAILABLE',
                error: err.message || 'The selected dairy tenant database is unavailable.',
            });
            return;
        }
        next(err);
    }
});
// 4. List Pending Customer Registrations (Dairy Admin Approvals Queue)
router.get('/pending', authenticate, authorizePermission('customers:read', 'customers:approve'), async (req, res, next) => {
    try {
        let orgId = req.user.organizationId;
        const queryOrgId = req.query['organizationId'];
        const headerOrgId = req.headers['x-dairy-tenant-id'] || req.headers['x-dairy-id'];
        if (req.user?.role !== 'SUPER_ADMIN') {
            if ((queryOrgId && queryOrgId !== orgId) || (headerOrgId && headerOrgId !== orgId)) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-dairy query blocked: Cannot view pending registrations of another dairy.',
                });
                return;
            }
        }
        else {
            orgId = queryOrgId || headerOrgId || orgId;
        }
        const data = await getPendingRegistrationsUseCase.execute(orgId);
        res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        next(err);
    }
});
// 5. Get Customer Registration Status
router.get('/:id/status', authenticate, async (req, res, next) => {
    try {
        const id = req.params.id;
        let customerId = (Array.isArray(id) ? id[0] : id) || '';
        if (customerId === 'me') {
            customerId = req.user.userId;
        }
        if (req.user?.actorType === 'CUSTOMER' &&
            customerId !== req.user.userId &&
            (!req.user.globalCustomerId || customerId !== req.user.globalCustomerId)) {
            res.status(403).json({
                success: false,
                error: 'Cross-customer access blocked: customer can only check their own status.',
            });
            return;
        }
        if (req.user?.actorType === 'STAFF' &&
            !hasPermission(req.user.role, 'customers:read') &&
            !hasPermission(req.user.role, 'customers:identify_manual') &&
            !hasPermission(req.user.role, 'customers:identify_face') &&
            !hasPermission(req.user.role, 'customers:identify_rfid')) {
            res.status(403).json({ success: false, error: 'Forbidden: Missing customer read permission.' });
            return;
        }
        const orgId = req.user?.role === 'SUPER_ADMIN'
            ? (req.query['organizationId'] ||
                req.query['dairyId'] ||
                req.headers['x-dairy-id'] ||
                req.user?.organizationId)
            : req.user?.organizationId;
        req.headers['x-dairy-tenant-id'] ||
            undefined;
        const data = await getCustomerStatusUseCase.execute(customerId, orgId);
        let assignedDairyName = 'DFarm Dairy Cooperative';
        if (data.organizationId) {
            try {
                const orgRes = await db.query(`SELECT name FROM organizations WHERE id = $1 LIMIT 1;`, [data.organizationId]);
                if (orgRes.rows.length > 0 && orgRes.rows[0].name) {
                    assignedDairyName = orgRes.rows[0].name;
                }
            }
            catch {
                // ignore
            }
        }
        res.json({
            success: true,
            data,
            status: data.registrationStatus,
            registrationStatus: data.registrationStatus,
            reason: data.rejectionReason,
            rejectionReason: data.rejectionReason,
            assignedDairyName,
            customerCode: data.farmerCode,
            fullName: data.fullName,
        });
    }
    catch (err) {
        next(err);
    }
});
// 6. Approve Pending Customer Registration (Administrative Activation)
const handleApprove = async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
        const customCode = req.body?.customerCode || req.body?.farmerCode;
        const organizationId = req.user?.organizationId || req.headers['x-dairy-id'] || req.query['organizationId'];
        const data = await approveRegistrationUseCase.execute(customerId, operatorName, customCode, organizationId);
        res.json({
            success: true,
            status: data.status,
            customerCode: data.farmerCode || data.customerCode,
            farmerCode: data.farmerCode || data.customerCode,
            message: `Successfully approved farmer registration for ${data.fullName} (Assigned Code: ${data.farmerCode || data.customerCode}).`,
            data,
        });
    }
    catch (err) {
        if (err.name === 'DomainValidationError' && err.message.includes('already approved')) {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
};
router.post('/:id/approve', authenticate, authorizePermission('customers:approve'), handleApprove);
router.patch('/:id/approve', authenticate, authorizePermission('customers:approve'), handleApprove);
// 7. Reject Pending Customer Registration with Mandatory Detailed Reason
const handleReject = async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const reason = req.body?.reason;
        const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (req.user?.organizationId || req.headers['x-dairy-id'] || req.query['organizationId'])
            : req.user?.organizationId;
        const data = await rejectRegistrationUseCase.execute(customerId, reason, operatorName, organizationId);
        res.json({
            success: true,
            message: 'Registration request successfully rejected with audit reason.',
            data,
        });
    }
    catch (err) {
        if (err.name === 'DomainValidationError') {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
};
router.post('/:id/reject', authenticate, authorizePermission('customers:approve', 'customers:reject'), handleReject);
router.patch('/:id/reject', authenticate, authorizePermission('customers:approve', 'customers:reject'), handleReject);
// 8. Suspend Customer
router.post('/:id/suspend', authenticate, authorizePermission('customers:update'), async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const reason = req.body?.reason || 'Suspended by dairy administration';
        const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (req.user?.organizationId || req.headers['x-dairy-id'])
            : req.user?.organizationId;
        const data = await suspendCustomerUseCase.execute(customerId, reason, operatorName, organizationId);
        res.json({
            success: true,
            message: `Customer ${data.fullName} (${data.farmerCode}) suspended successfully.`,
            data,
        });
    }
    catch (err) {
        if (err.name === 'DomainValidationError') {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
});
// 9. Reactivate Customer
router.post('/:id/reactivate', authenticate, authorizePermission('customers:update'), async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const operatorName = req.body?.operatorName || req.user?.fullName || 'Dairy Administrator';
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (req.user?.organizationId || req.headers['x-dairy-id'])
            : req.user?.organizationId;
        const data = await reactivateCustomerUseCase.execute(customerId, operatorName, organizationId);
        res.json({
            success: true,
            message: `Customer ${data.fullName} (${data.farmerCode}) reactivated successfully.`,
            data,
        });
    }
    catch (err) {
        if (err.name === 'DomainValidationError') {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
});
// 10. Update Customer Profile Details
router.patch('/:id', authenticate, authorizePermission('customers:update'), async (req, res, next) => {
    try {
        // Security Gate: Generic profile updates cannot mutate bank account details
        if (req.body?.bankAccountNumber || req.body?.bankIfscCode || req.body?.bankName || req.body?.bankDetails) {
            res.status(403).json({
                success: false,
                error: 'Bank beneficiary modifications are restricted and must use the dedicated Customer App beneficiary workflow.',
            });
            return;
        }
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const { fullName, village, permittedCategories, mobileNumber } = req.body;
        const organizationId = req.user?.role === 'SUPER_ADMIN'
            ? (req.user?.organizationId || req.headers['x-dairy-id'])
            : req.user?.organizationId;
        const data = await updateProfileUseCase.execute(customerId, { fullName, village, permittedCategories, mobileNumber }, organizationId);
        res.json({
            success: true,
            message: 'Customer profile updated successfully.',
            data,
        });
    }
    catch (err) {
        if (err.name === 'DomainValidationError') {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
});
// 11. Soft Delete Customer
const handleSoftDeleteCustomer = async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const reason = req.body?.reason || 'Soft-deleted by administrator';
        const customer = await customerRepo.findById(customerId, req.user?.organizationId);
        if (!customer) {
            res.status(404).json({ success: false, error: 'Customer not found' });
            return;
        }
        if (req.user?.organizationId && customer.organizationId !== req.user.organizationId && req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy modification blocked' });
            return;
        }
        const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
        await tenantDb.query(`UPDATE customers SET is_deleted = TRUE, deletion_reason = $1, updated_at = NOW() WHERE id = $2;`, [reason, customerId]);
        res.json({ success: true, message: 'Customer account marked as soft-deleted in audit records.' });
    }
    catch (err) {
        next(err);
    }
};
router.post('/:id/soft-delete', authenticate, authorizePermission('customers:delete', 'customers:update'), handleSoftDeleteCustomer);
router.delete('/:id', authenticate, authorizePermission('customers:delete', 'customers:update'), handleSoftDeleteCustomer);
// 12. Restore Soft Deleted Customer
router.post('/:id/restore', authenticate, authorizePermission('customers:update'), async (req, res, next) => {
    try {
        const id = req.params.id;
        const customerId = (Array.isArray(id) ? id[0] : id) || '';
        const customer = await customerRepo.findById(customerId, req.user?.organizationId, true);
        if (!customer) {
            res.status(404).json({ success: false, error: 'Customer not found' });
            return;
        }
        if (req.user?.organizationId && customer.organizationId !== req.user.organizationId && req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({ success: false, error: 'Cross-dairy modification blocked' });
            return;
        }
        const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
        await tenantDb.query(`UPDATE customers SET is_deleted = FALSE, deletion_reason = NULL, updated_at = NOW() WHERE id = $1;`, [customerId]);
        res.json({ success: true, message: 'Customer account successfully restored to active status.' });
    }
    catch (err) {
        next(err);
    }
});
// 10. Update Biometric Face Enrollment (128-dim vector) & RFID Assignment
const handleBiometricsUpdate = async (req, res, next) => {
    try {
        const rawId = req.params.id;
        const isExplicitId = Boolean(rawId && rawId !== 'me' && rawId !== 'null' && rawId !== 'undefined');
        let customerId = (Array.isArray(rawId) ? rawId[0] : rawId) || '';
        if (!customerId ||
            customerId === 'me' ||
            customerId === 'null' ||
            customerId === 'undefined') {
            customerId =
                req.body?.customerId ||
                    req.query?.['customerId'] ||
                    req.user?.userId ||
                    req.user?.globalCustomerId ||
                    '';
        }
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication is required to update biometrics.',
                },
            });
            return;
        }
        if (req.user.actorType === 'STAFF' &&
            !hasPermission(req.user.role, 'biometrics:manage') &&
            !hasPermission(req.user.role, 'customers:update') &&
            req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Forbidden: Staff role lacks permission to modify customer biometrics.',
            });
            return;
        }
        const { embedding, modelVersion, rfidCardUid, cardUid } = req.body;
        const targetUid = rfidCardUid || cardUid;
        const headerOrgId = req.headers['x-dairy-tenant-id'] ||
            req.headers['x-dairy-id'] ||
            req.headers['x-organization-id'];
        const requestedOrgId = req.body?.organizationId ||
            req.body?.dairyId ||
            req.query?.['organizationId'] ||
            headerOrgId;
        const orgId = req.user?.organizationId || requestedOrgId;
        // Resolve canonical customer record strictly in tenant DB context
        let customer = await customerRepo.findById(customerId, orgId);
        // Fallback: Lookup by globalCustomerId within orgId
        if (!customer && req.user?.globalCustomerId && req.user.globalCustomerId !== customerId) {
            customer = await customerRepo.findById(req.user.globalCustomerId, orgId);
        }
        // Fallback: Lookup by userId within orgId
        if (!customer && req.user?.userId && req.user.userId !== customerId && !req.user.userId.startsWith('unregistered:')) {
            customer = await customerRepo.findById(req.user.userId, orgId);
        }
        // Fallback: Lookup by verified phone within orgId
        const cleanPhone = req.user?.mobileNumber ||
            req.user?.phoneNumber ||
            (req.user?.userId?.startsWith('unregistered:') ? req.user.userId.replace('unregistered:', '') : null) ||
            req.body?.phone ||
            req.body?.mobileNumber;
        if (!customer && cleanPhone && orgId) {
            customer = await customerRepo.findByPhone(cleanPhone, orgId);
        }
        if (!customer) {
            // If customer was explicitly requested but not in this orgId, check central registry to distinguish 403 vs 404
            const customerInAnyDairy = isExplicitId ? await customerRepo.findById(customerId) : null;
            if (customerInAnyDairy && orgId && customerInAnyDairy.organizationId !== orgId) {
                res.status(403).json({
                    success: false,
                    error: 'Cross-dairy modification blocked: Customer belongs to a different dairy organization.',
                });
                return;
            }
            throw new CustomerNotFoundError(customerId || 'Customer');
        }
        // Role-based access control and tenant isolation
        if (req.user?.role === 'FARMER_CUSTOMER' &&
            req.user.userId !== customer.id &&
            req.user.userId !== customer.globalCustomerId &&
            (!req.user.globalCustomerId || req.user.globalCustomerId !== customer.globalCustomerId)) {
            res.status(403).json({
                success: false,
                error: 'Cross-customer modification blocked: customer can only update their own biometrics.',
            });
            return;
        }
        if (req.user?.role === 'GUEST_FARMER' &&
            req.user.globalCustomerId &&
            customer.globalCustomerId &&
            req.user.globalCustomerId !== customer.globalCustomerId) {
            res.status(403).json({
                success: false,
                error: 'Cross-customer modification blocked: guest farmer can only update their own biometrics.',
            });
            return;
        }
        if (req.user?.organizationId &&
            customer.organizationId !== req.user.organizationId &&
            req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy modification blocked: Customer does not belong to authorized dairy.',
            });
            return;
        }
        if (requestedOrgId &&
            requestedOrgId !== customer.organizationId &&
            req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy modification blocked: Customer does not belong to requested dairy organization.',
            });
            return;
        }
        if (targetUid) {
            await customerRepo.assignRfidCard(customer.id, targetUid, customer.organizationId);
        }
        let data = { success: true };
        if (embedding && Array.isArray(embedding)) {
            data = await updateBiometricsUseCase.execute({
                customerId: customer.id,
                organizationId: customer.organizationId,
                embedding,
                modelVersion,
            });
        }
        const effectiveCustomerId = data?.customerId || customer.id;
        const updatedCustomer = await customerRepo.findById(effectiveCustomerId, customer.organizationId).catch(() => null);
        res.json({
            success: true,
            isBiometricEnrolled: Boolean(updatedCustomer?.isBiometricEnrolled ?? true),
            message: 'Biometrics and identification credentials updated successfully.',
            data: updatedCustomer ? updatedCustomer.toJSON() : (data || { id: effectiveCustomerId }),
            customerId: effectiveCustomerId,
            status: 'ENROLLED',
            rfidCardUid: targetUid || updatedCustomer?.rfidCardUid,
            biometricStatus: {
                isEnrolled: Boolean(updatedCustomer?.isBiometricEnrolled ?? true),
                status: 'ENROLLED',
                version: modelVersion || 'sface_int8_2021dec',
                enrolledAt: data?.enrolledAt || new Date().toISOString(),
            },
        });
    }
    catch (err) {
        next(err);
    }
};
// 10.1 Biometrics routes without :id (resolved via token claims / body)
router.post('/biometrics/update', authenticate, handleBiometricsUpdate);
router.put('/biometrics/update', authenticate, handleBiometricsUpdate);
router.patch('/biometrics/update', authenticate, handleBiometricsUpdate);
router.post('/biometrics', authenticate, handleBiometricsUpdate);
router.put('/biometrics', authenticate, handleBiometricsUpdate);
router.patch('/biometrics', authenticate, handleBiometricsUpdate);
// 10.2 Biometrics routes with explicit "me" alias
router.post('/me/biometrics/update', authenticate, handleBiometricsUpdate);
router.put('/me/biometrics/update', authenticate, handleBiometricsUpdate);
router.patch('/me/biometrics/update', authenticate, handleBiometricsUpdate);
router.post('/me/biometrics', authenticate, handleBiometricsUpdate);
router.put('/me/biometrics', authenticate, handleBiometricsUpdate);
router.patch('/me/biometrics', authenticate, handleBiometricsUpdate);
// 10.3 Parameterized :id routes
router.put('/:id/biometrics/update', authenticate, handleBiometricsUpdate);
router.post('/:id/biometrics/update', authenticate, handleBiometricsUpdate);
router.patch('/:id/biometrics/update', authenticate, handleBiometricsUpdate);
router.patch('/:id/biometrics', authenticate, handleBiometricsUpdate);
router.post('/:id/biometrics', authenticate, handleBiometricsUpdate);
router.put('/:id/biometrics', authenticate, handleBiometricsUpdate);
// 11. Get Customer By ID
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const id = req.params.id;
        let customerId = (Array.isArray(id) ? id[0] : id) || '';
        // If "me" is requested, resolve from authenticated user context
        if (customerId === 'me' || !customerId) {
            customerId = req.user?.userId || '';
            if (!customerId) {
                res.status(401).json({ success: false, error: 'Unauthorized: missing authentication context' });
                return;
            }
        }
        if (customerId.startsWith('unregistered:')) {
            const cleanPhone = customerId.replace('unregistered:', '');
            const cust = await customerRepo.findByPhone(cleanPhone, req.user?.organizationId);
            if (cust) {
                customerId = cust.id;
            }
        }
        // Farmer customer / guest can only view their own profile
        if ((req.user?.actorType === 'CUSTOMER' || req.user?.role === 'FARMER_CUSTOMER' || req.user?.role === 'GUEST_FARMER') &&
            customerId !== req.user.userId &&
            (!req.user.globalCustomerId || customerId !== req.user.globalCustomerId)) {
            res.status(403).json({
                success: false,
                error: 'Cross-customer access blocked: customer can only access their own profile.',
            });
            return;
        }
        if (req.user?.actorType === 'STAFF' &&
            !hasPermission(req.user.role, 'customers:read') &&
            !hasPermission(req.user.role, 'customers:identify_manual') &&
            !hasPermission(req.user.role, 'customers:identify_face') &&
            !hasPermission(req.user.role, 'customers:identify_rfid')) {
            res.status(403).json({ success: false, error: 'Forbidden: Role lacks customer read permission.' });
            return;
        }
        const data = await getCustomerByIdUseCase.execute(customerId, req.user?.organizationId);
        // Multi-dairy isolation check
        if (req.user?.organizationId && data.organizationId !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy access blocked: Customer does not belong to authorized dairy.',
            });
            return;
        }
        // Safely mask bank account number in general response
        const maskedData = { ...data };
        if (maskedData.bankDetails && maskedData.bankDetails.accountNumber) {
            const rawAcc = String(maskedData.bankDetails.accountNumber);
            maskedData.bankDetails = {
                ...maskedData.bankDetails,
                accountNumberMask: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
                accountNumber: rawAcc.length >= 4 ? `XXXX-XXXX-${rawAcc.slice(-4)}` : 'XXXX',
            };
        }
        // Map dairy details for customer mobile app schema compatibility
        maskedData.dairyId = maskedData.organizationId;
        maskedData.milkSupplyType = Array.isArray(maskedData.categories)
            ? (maskedData.categories.includes('COW') && maskedData.categories.includes('BUFFALO') ? 'BOTH' : (maskedData.categories[0] || 'COW'))
            : (maskedData.category || 'COW');
        maskedData.isBiometricEnrolled = Boolean(maskedData.faceTemplateEnrolled);
        maskedData.biometricStatus = {
            isEnrolled: Boolean(maskedData.faceTemplateEnrolled),
            status: maskedData.faceTemplateEnrolled ? 'ENROLLED' : (maskedData.faceEnrollmentStatus || 'NOT_ENROLLED'),
            version: 'sface_int8_2021dec',
        };
        if (maskedData.organizationId) {
            try {
                const controlDb = tenantDbManager.getControlPlaneDb();
                const orgRes = await controlDb.query('SELECT name, code FROM organizations WHERE id = $1 LIMIT 1;', [maskedData.organizationId]);
                if (orgRes.rows.length > 0) {
                    maskedData.dairyName = orgRes.rows[0].name || maskedData.dairyName;
                    maskedData.dairyCode = orgRes.rows[0].code || maskedData.dairyCode;
                }
            }
            catch { }
        }
        maskedData.dairyName = maskedData.dairyName || 'DFarm Cooperative Society';
        maskedData.dairyCode = maskedData.dairyCode || 'DFARM';
        maskedData.membershipStatus = maskedData.registrationStatus || (maskedData.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL');
        res.json({ success: true, data: maskedData, ...maskedData });
    }
    catch (err) {
        next(err);
    }
});
// 12. Update Bank Beneficiary Details (Customer App & Dairy Admin)
router.put('/:id/bank-details', authenticate, async (req, res, next) => {
    try {
        const rawId = req.params.id;
        let customerId = (Array.isArray(rawId) ? rawId[0] : rawId) || '';
        if (customerId === 'me' || !customerId) {
            customerId = req.user?.userId || '';
        }
        if (req.user?.role === 'FARMER_CUSTOMER' && customerId !== req.user.userId) {
            res.status(403).json({
                success: false,
                error: 'Cross-customer access blocked: customer can only update their own bank details.',
            });
            return;
        }
        const { bankName, accountNumber, ifscCode, accountHolderName } = req.body;
        if (!bankName || !accountNumber || !ifscCode) {
            res.status(400).json({
                success: false,
                error: 'bankName, accountNumber, and ifscCode are mandatory fields.',
            });
            return;
        }
        const cleanAcc = String(accountNumber).trim();
        const cleanIfsc = String(ifscCode).trim().toUpperCase();
        if (cleanAcc.length < 6 || cleanAcc.length > 30) {
            res.status(400).json({
                success: false,
                error: 'Invalid bank account number length (must be between 6 and 30 characters).',
            });
            return;
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
            res.status(400).json({
                success: false,
                error: 'Invalid IFSC code format (expected 11 alphanumeric characters, e.g., SBIN0001234).',
            });
            return;
        }
        // Enforce actor & tenant authorization on bank details mutation (DF-015)
        if (req.user?.actorType === 'STAFF' &&
            !hasPermission(req.user.role, 'customers:update') &&
            req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Forbidden: Staff role lacks permission to update customer bank details.',
            });
            return;
        }
        // Resolve tenant client with strict tenant isolation
        const customer = await getCustomerByIdUseCase.execute(customerId, req.user?.organizationId);
        if (req.user?.organizationId &&
            customer.organizationId !== req.user.organizationId &&
            req.user.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy modification blocked: Customer belongs to a different dairy organization.',
            });
            return;
        }
        const orgId = customer.organizationId || req.user?.organizationId;
        if (!orgId) {
            res.status(400).json({ success: false, error: 'Dairy organization context is required.' });
            return;
        }
        const client = await tenantDbManager.getStrictTenantDb(orgId);
        const holder = accountHolderName || customer.fullName;
        await client.query(`UPDATE customers 
       SET bank_name = $1, 
           bank_account_number = $2, 
           bank_ifsc_code = $3, 
           bank_account_holder_name = $4,
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6;`, [bankName, cleanAcc, cleanIfsc, holder, customerId, orgId]);
        const mask = cleanAcc.length >= 4 ? `XXXX-XXXX-${cleanAcc.slice(-4)}` : 'XXXX';
        res.json({
            success: true,
            message: 'Bank beneficiary details updated successfully.',
            data: {
                bankName,
                accountNumberMask: mask,
                ifscCode: cleanIfsc,
                accountHolderName: holder,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
export const customerRoutes = router;
//# sourceMappingURL=customers.routes.js.map