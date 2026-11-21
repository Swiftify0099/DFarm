import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';
export class GetCustomerMembershipsUseCase {
    membershipRepo;
    customerRepo;
    constructor(membershipRepo, customerRepo) {
        this.membershipRepo = membershipRepo;
        this.customerRepo = customerRepo;
    }
    async execute(params) {
        let globalCustomerId = params.globalCustomerId;
        let normalizedPhone;
        if (params.phone) {
            try {
                const phone = new PhoneNumber(params.phone);
                normalizedPhone = phone.e164;
            }
            catch {
                normalizedPhone = params.phone.replace(/\D/g, '');
                if (normalizedPhone.length === 10)
                    normalizedPhone = `+91${normalizedPhone}`;
            }
        }
        // 1. Resolve global identity
        if (!globalCustomerId && normalizedPhone) {
            let identity = await this.membershipRepo.findGlobalIdentityByPhone(normalizedPhone);
            if (!identity) {
                identity = await this.membershipRepo.createGlobalIdentity(normalizedPhone);
            }
            globalCustomerId = identity.id;
        }
        if (!globalCustomerId && params.customerId && params.organizationId && this.customerRepo) {
            const cust = await this.customerRepo.findById(params.customerId, params.organizationId);
            if (cust) {
                normalizedPhone = cust.mobileNumber;
                let identity = await this.membershipRepo.findGlobalIdentityByPhone(cust.mobileNumber);
                if (!identity) {
                    identity = await this.membershipRepo.createGlobalIdentity(cust.mobileNumber);
                }
                globalCustomerId = identity.id;
            }
        }
        if (!globalCustomerId) {
            return {
                globalCustomerId: '',
                normalizedMobileNumber: normalizedPhone,
                memberships: [],
            };
        }
        // 2. Fetch existing central memberships
        let memberships = await this.membershipRepo.listMembershipsByGlobalId(globalCustomerId);
        // 3. Fallback scan / reconciliation across tenant DBs if central memberships are empty and phone is known
        if (memberships.length === 0 && normalizedPhone) {
            const allTenants = tenantDbManager.getAllTenantDbs();
            for (const tenantDb of allTenants) {
                try {
                    const res = await tenantDb.query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name, c.status, c.registration_status,
                    o.name AS dairy_name, o.code AS dairy_code, o.address_line1 AS dairy_address,
                    dc.name AS center_name
             FROM customers c
             LEFT JOIN organizations o ON o.id = c.organization_id
             LEFT JOIN dairy_centers dc ON dc.id = c.primary_center_id
             WHERE c.normalized_mobile_number = $1 AND c.is_deleted = FALSE;`, [normalizedPhone]);
                    for (const row of res.rows) {
                        const orgId = row.organization_id;
                        const membership = new CustomerMembership({
                            id: crypto.randomUUID(),
                            globalCustomerId: globalCustomerId,
                            organizationId: orgId,
                            tenantCustomerId: row.id,
                            farmerCode: row.farmer_code,
                            membershipStatus: row.registration_status || (row.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL'),
                            dairyName: row.dairy_name || 'Cooperative Dairy',
                            dairyCode: row.dairy_code || 'DFARM',
                            dairyAddress: row.dairy_address || 'Regional Center',
                            centerId: row.primary_center_id,
                            centerName: row.center_name || 'Primary Center',
                        });
                        await this.membershipRepo.saveMembership(membership);
                        // Also link tenant customer row
                        try {
                            await tenantDb.query(`UPDATE customers SET global_customer_id = $1 WHERE id = $2;`, [globalCustomerId, row.id]);
                        }
                        catch { }
                    }
                }
                catch {
                    // Ignore tenant read errors during discovery
                }
            }
            // Re-fetch after reconciliation
            memberships = await this.membershipRepo.listMembershipsByGlobalId(globalCustomerId);
        }
        return {
            globalCustomerId,
            normalizedMobileNumber: normalizedPhone,
            memberships: memberships.map((m) => m.toJSON()),
        };
    }
}
//# sourceMappingURL=GetCustomerMembershipsUseCase.js.map