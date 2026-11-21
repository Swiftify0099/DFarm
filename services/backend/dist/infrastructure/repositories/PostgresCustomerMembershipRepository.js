import crypto from 'node:crypto';
import { CustomerMembership } from '../../domain/entities/CustomerMembership.js';
import { GlobalCustomerIdentity } from '../../domain/entities/GlobalCustomerIdentity.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';
import { db } from '../database/PostgresPool.js';
export class PostgresCustomerMembershipRepository {
    getDb() {
        return tenantDbManager.getControlPlaneDb() || db;
    }
    async findGlobalIdentityByPhone(phoneE164) {
        const client = this.getDb();
        try {
            const sql = `
        SELECT id, normalized_mobile_number, phone_verified_at, created_at, updated_at
        FROM global_customer_identities
        WHERE normalized_mobile_number = $1
        LIMIT 1;
      `;
            const res = await client.query(sql, [phoneE164]);
            if (res.rows.length === 0)
                return null;
            const row = res.rows[0];
            return new GlobalCustomerIdentity({
                id: row.id,
                normalizedMobileNumber: row.normalized_mobile_number,
                phoneVerifiedAt: row.phone_verified_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            });
        }
        catch (err) {
            // If table doesn't exist yet, return null
            return null;
        }
    }
    async createGlobalIdentity(phoneE164) {
        const client = this.getDb();
        const id = crypto.randomUUID();
        const now = new Date();
        const sql = `
      INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at, created_at, updated_at)
      VALUES ($1, $2, $3, $3, $3)
      ON CONFLICT (normalized_mobile_number) DO UPDATE SET
        phone_verified_at = EXCLUDED.phone_verified_at,
        updated_at = EXCLUDED.updated_at
      RETURNING id, normalized_mobile_number, phone_verified_at, created_at, updated_at;
    `;
        const res = await client.query(sql, [id, phoneE164, now]);
        const row = res.rows[0];
        return new GlobalCustomerIdentity({
            id: row.id,
            normalizedMobileNumber: row.normalized_mobile_number,
            phoneVerifiedAt: row.phone_verified_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }
    async listMembershipsByGlobalId(globalCustomerId) {
        const client = this.getDb();
        try {
            const sql = `
        SELECT 
          m.id,
          m.global_customer_id,
          m.organization_id,
          m.tenant_customer_id,
          m.farmer_code,
          m.customer_name,
          m.membership_status,
          COALESCE(m.dairy_name, o.name, 'Cooperative Dairy') AS dairy_name,
          COALESCE(m.dairy_code, o.code, 'DFARM') AS dairy_code,
          COALESCE(m.dairy_address, o.address_line1, 'Regional Center') AS dairy_address,
          m.center_id,
          COALESCE(m.center_name, dc.name, 'Primary Center') AS center_name,
          m.created_at,
          m.updated_at,
          m.last_synchronized_at
        FROM customer_dairy_memberships m
        LEFT JOIN organizations o ON o.id = m.organization_id
        LEFT JOIN dairy_centers dc ON dc.id = m.center_id
        WHERE m.global_customer_id = $1
        ORDER BY 
          CASE WHEN m.membership_status = 'APPROVED' THEN 1
               WHEN m.membership_status = 'PENDING_APPROVAL' THEN 2
               ELSE 3 END,
          m.created_at DESC;
      `;
            const res = await client.query(sql, [globalCustomerId]);
            return res.rows.map((row) => new CustomerMembership({
                id: row.id,
                globalCustomerId: row.global_customer_id,
                organizationId: row.organization_id,
                tenantCustomerId: row.tenant_customer_id,
                farmerCode: row.farmer_code,
                customerName: row.customer_name,
                membershipStatus: row.membership_status,
                dairyName: row.dairy_name,
                dairyCode: row.dairy_code,
                dairyAddress: row.dairy_address,
                centerId: row.center_id,
                centerName: row.center_name,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastSynchronizedAt: row.last_synchronized_at,
            }));
        }
        catch {
            return [];
        }
    }
    async findMembership(globalCustomerId, organizationId) {
        const client = this.getDb();
        try {
            const sql = `
        SELECT 
          m.id,
          m.global_customer_id,
          m.organization_id,
          m.tenant_customer_id,
          m.farmer_code,
          m.customer_name,
          m.membership_status,
          COALESCE(m.dairy_name, o.name, 'Cooperative Dairy') AS dairy_name,
          COALESCE(m.dairy_code, o.code, 'DFARM') AS dairy_code,
          COALESCE(m.dairy_address, o.address_line1, 'Regional Center') AS dairy_address,
          m.center_id,
          COALESCE(m.center_name, dc.name, 'Primary Center') AS center_name,
          m.created_at,
          m.updated_at,
          m.last_synchronized_at
        FROM customer_dairy_memberships m
        LEFT JOIN organizations o ON o.id = m.organization_id
        LEFT JOIN dairy_centers dc ON dc.id = m.center_id
        WHERE m.global_customer_id = $1 AND m.organization_id = $2
        LIMIT 1;
      `;
            const res = await client.query(sql, [globalCustomerId, organizationId]);
            if (res.rows.length === 0)
                return null;
            const row = res.rows[0];
            return new CustomerMembership({
                id: row.id,
                globalCustomerId: row.global_customer_id,
                organizationId: row.organization_id,
                tenantCustomerId: row.tenant_customer_id,
                farmerCode: row.farmer_code,
                customerName: row.customer_name,
                membershipStatus: row.membership_status,
                dairyName: row.dairy_name,
                dairyCode: row.dairy_code,
                dairyAddress: row.dairy_address,
                centerId: row.center_id,
                centerName: row.center_name,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastSynchronizedAt: row.last_synchronized_at,
            });
        }
        catch {
            return null;
        }
    }
    async saveMembership(membership) {
        const client = this.getDb();
        const sql = `
      INSERT INTO customer_dairy_memberships (
        id, global_customer_id, organization_id, tenant_customer_id,
        farmer_code, customer_name, membership_status, dairy_name, dairy_code,
        dairy_address, center_id, center_name, created_at, updated_at, last_synchronized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())
      ON CONFLICT (organization_id, global_customer_id) DO UPDATE SET
        tenant_customer_id = EXCLUDED.tenant_customer_id,
        farmer_code = COALESCE(EXCLUDED.farmer_code, customer_dairy_memberships.farmer_code),
        customer_name = COALESCE(EXCLUDED.customer_name, customer_dairy_memberships.customer_name),
        membership_status = EXCLUDED.membership_status,
        dairy_name = COALESCE(EXCLUDED.dairy_name, customer_dairy_memberships.dairy_name),
        dairy_code = COALESCE(EXCLUDED.dairy_code, customer_dairy_memberships.dairy_code),
        dairy_address = COALESCE(EXCLUDED.dairy_address, customer_dairy_memberships.dairy_address),
        center_id = COALESCE(EXCLUDED.center_id, customer_dairy_memberships.center_id),
        center_name = COALESCE(EXCLUDED.center_name, customer_dairy_memberships.center_name),
        updated_at = NOW(),
        last_synchronized_at = NOW();
    `;
        await client.query(sql, [
            membership.id,
            membership.globalCustomerId,
            membership.organizationId,
            membership.tenantCustomerId,
            membership.farmerCode || null,
            membership.customerName || null,
            membership.membershipStatus,
            membership.dairyName,
            membership.dairyCode || null,
            membership.dairyAddress || null,
            membership.centerId || null,
            membership.centerName || null,
        ]);
    }
    async updateMembershipStatus(organizationId, tenantCustomerId, status, farmerCode, customerName) {
        const client = this.getDb();
        try {
            const sql = `
        UPDATE customer_dairy_memberships
        SET 
          membership_status = $1,
          farmer_code = COALESCE($2, farmer_code),
          customer_name = COALESCE($3, customer_name),
          updated_at = NOW(),
          last_synchronized_at = NOW()
        WHERE organization_id = $4 AND tenant_customer_id = $5;
      `;
            await client.query(sql, [status, farmerCode || null, customerName || null, organizationId, tenantCustomerId]);
        }
        catch {
            // Ignore if table not present in test doubles
        }
    }
    async getMembershipCount(globalCustomerId) {
        const client = this.getDb();
        try {
            const sql = `SELECT COUNT(id) AS cnt FROM customer_dairy_memberships WHERE global_customer_id = $1;`;
            const res = await client.query(sql, [globalCustomerId]);
            return Number(res.rows[0]?.cnt || 0);
        }
        catch {
            return 0;
        }
    }
}
//# sourceMappingURL=PostgresCustomerMembershipRepository.js.map