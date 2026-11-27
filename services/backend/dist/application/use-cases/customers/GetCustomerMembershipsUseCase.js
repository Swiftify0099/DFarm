import crypto from 'node:crypto';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class GetCustomerMembershipsUseCase {
    membershipRepo;
    customerRepo;
    constructor(membershipRepo, customerRepo) {
        this.membershipRepo = membershipRepo;
        this.customerRepo = customerRepo;
    }
    async execute(params) {
        let globalCustomerId = params.globalCustomerId?.trim() || undefined;
        let normalizedPhone;
        if (params.phone) {
            try {
                const phone = new PhoneNumber(params.phone);
                normalizedPhone = phone.e164;
            }
            catch {
                const digits = params.phone.replace(/\D/g, '');
                if (digits.length === 10) {
                    normalizedPhone = `+91${digits}`;
                }
            }
        }
        // 1. Resolve verified global customer identity strictly from central directory
        if (!globalCustomerId && normalizedPhone) {
            const identity = await this.membershipRepo.findGlobalIdentityByPhone(normalizedPhone);
            if (identity) {
                globalCustomerId = identity.id;
            }
        }
        if (!globalCustomerId && params.customerId && params.organizationId && this.customerRepo) {
            const cust = await this.customerRepo.findById(params.customerId, params.organizationId);
            if (cust) {
                if (cust.globalCustomerId) {
                    globalCustomerId = cust.globalCustomerId;
                }
                else if (cust.mobileNumber) {
                    normalizedPhone = cust.mobileNumber;
                    const identity = await this.membershipRepo.findGlobalIdentityByPhone(cust.mobileNumber);
                    if (identity) {
                        globalCustomerId = identity.id;
                    }
                }
            }
        }
        if (!globalCustomerId) {
            return {
                globalCustomerId: '',
                normalizedMobileNumber: normalizedPhone,
                memberships: [],
            };
        }
        // 2. Fetch authorized memberships strictly from the authoritative central membership index.
        // Request-path global tenant DB scanning and silent discovery mutations are strictly prohibited.
        const memberships = await this.membershipRepo.listMembershipsByGlobalId(globalCustomerId);
        return {
            globalCustomerId,
            normalizedMobileNumber: normalizedPhone,
            memberships: memberships.map((m) => m.toJSON()),
        };
    }
}
/**
 * Dedicated, bounded, idempotent administrative reconciliation command for backfilling
 * historical tenant customer records into the central customer_dairy_memberships index.
 * Must NEVER be invoked on ordinary customer request paths.
 */
export class ReconcileCustomerMembershipsUseCase {
    membershipRepo;
    constructor(membershipRepo) {
        this.membershipRepo = membershipRepo;
    }
    async execute(params) {
        const cleanOrgId = params.organizationId?.trim();
        if (!cleanOrgId || !UUID_REGEX.test(cleanOrgId)) {
            throw new DomainValidationError('Explicit valid organizationId is required for bounded membership reconciliation.', 'MISSING_ORGANIZATION_ID');
        }
        const limit = Math.max(1, Math.min(500, Number(params.limit || 100)));
        const controlDb = tenantDbManager.getControlPlaneDb();
        const orgRes = await controlDb.query(`SELECT id, name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`, [cleanOrgId]);
        if (orgRes.rows.length === 0) {
            throw new DomainValidationError(`Organization '${cleanOrgId}' does not exist.`, 'INVALID_ORGANIZATION');
        }
        const orgMeta = orgRes.rows[0];
        const tenantDb = await tenantDbManager.getStrictTenantDb(cleanOrgId);
        const conditions = ['c.organization_id = $1', 'c.is_deleted = FALSE'];
        const queryParams = [cleanOrgId];
        let idx = 2;
        if (params.normalizedMobileNumber) {
            const phone = new PhoneNumber(params.normalizedMobileNumber);
            conditions.push(`c.normalized_mobile_number = $${idx++}`);
            queryParams.push(phone.e164);
        }
        if (params.tenantCustomerId) {
            if (!UUID_REGEX.test(params.tenantCustomerId.trim())) {
                throw new DomainValidationError('Invalid tenantCustomerId format.', 'INVALID_CUSTOMER_ID');
            }
            conditions.push(`c.id = $${idx++}`);
            queryParams.push(params.tenantCustomerId.trim());
        }
        queryParams.push(limit);
        const custRes = await tenantDb.query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
              c.normalized_mobile_number, c.status, c.registration_status, c.global_customer_id,
              dc.name AS center_name
       FROM customers c
       LEFT JOIN dairy_centers dc ON dc.id = c.primary_center_id AND dc.organization_id = c.organization_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at ASC
       LIMIT $${idx};`, queryParams);
        const records = [];
        let createdCount = 0;
        let linkedCount = 0;
        for (const row of custRes.rows) {
            if (!row.normalized_mobile_number)
                continue;
            let identity = await this.membershipRepo.findGlobalIdentityByPhone(row.normalized_mobile_number);
            if (!identity) {
                identity = await this.membershipRepo.createGlobalIdentity(row.normalized_mobile_number);
            }
            const status = row.registration_status === 'APPROVED'
                ? 'APPROVED'
                : row.registration_status === 'REJECTED'
                    ? 'REJECTED'
                    : row.status === 'SUSPENDED'
                        ? 'SUSPENDED'
                        : 'PENDING_APPROVAL';
            const existingMembership = await this.membershipRepo.findMembership(identity.id, cleanOrgId);
            let action = 'ALREADY_EXISTS';
            if (!existingMembership) {
                const membership = new CustomerMembership({
                    id: crypto.randomUUID(),
                    globalCustomerId: identity.id,
                    organizationId: cleanOrgId,
                    tenantCustomerId: row.id,
                    farmerCode: row.farmer_code,
                    customerName: row.full_name,
                    membershipStatus: status,
                    dairyName: orgMeta.name || 'Cooperative Dairy',
                    dairyCode: orgMeta.code || 'DFARM',
                    dairyAddress: orgMeta.address_line1 || 'Regional Center',
                    centerId: row.primary_center_id,
                    centerName: row.center_name || 'Primary Center',
                });
                await this.membershipRepo.saveMembership(membership);
                action = 'CREATED';
                createdCount++;
            }
            let linkedTenantRow = false;
            if (row.global_customer_id !== identity.id) {
                await tenantDb.query(`UPDATE customers SET global_customer_id = $1 WHERE id = $2 AND organization_id = $3;`, [identity.id, row.id, cleanOrgId]);
                linkedTenantRow = true;
                linkedCount++;
            }
            records.push({
                globalCustomerId: identity.id,
                organizationId: cleanOrgId,
                tenantCustomerId: row.id,
                membershipStatus: existingMembership ? existingMembership.membershipStatus : status,
                action,
                linkedTenantRow,
            });
        }
        return {
            organizationId: cleanOrgId,
            scannedCount: custRes.rows.length,
            createdCount,
            linkedCount,
            records,
        };
    }
}
//# sourceMappingURL=GetCustomerMembershipsUseCase.js.map