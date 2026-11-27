import crypto from 'node:crypto';
import { ICustomerMembershipRepository } from '../../application/ports/index.js';
import { CustomerMembership, MembershipStatus } from '../../domain/entities/CustomerMembership.js';
import { GlobalCustomerIdentity } from '../../domain/entities/GlobalCustomerIdentity.js';
import { tenantDbManager, TenantDatabaseUnavailableError } from '../database/TenantDatabaseManager.js';
import { db } from '../database/PostgresPool.js';

// ---------------------------------------------------------------------------
// Schema alignment note (migration 037):
//   The control-plane `customer_dairy_memberships` table includes:
//     id, global_customer_id, organization_id, tenant_customer_id, farmer_code,
//     membership_status, dairy_name, dairy_code, dairy_address, center_id,
//     center_name, created_at, updated_at, last_synchronized_at.
//   It does NOT define `customer_name`. Customer PII (`full_name`) lives in the
//   authoritative tenant database (`customers.full_name`) and is resolved per-tenant
//   via strict tenant DB resolution without duplicating PII onto the control plane
//   or inventing synthetic customer names.
// ---------------------------------------------------------------------------

export class PostgresCustomerMembershipRepository implements ICustomerMembershipRepository {
  private getDb() {
    return tenantDbManager.getControlPlaneDb() || db;
  }

  /**
   * Resolves authoritative `customers.full_name` from each mapped, ACTIVE tenant DB
   * strictly scoped by `(id, organization_id)`. Never invents fake names and never
   * breaks control-plane membership listing when a tenant DB is unmapped or offline
   * (returns `null` for `customerName` in that case so partial-outage callers can proceed).
   */
  private async resolveTenantCustomerNames(
    rows: Array<{ organization_id: string; tenant_customer_id: string }>
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    if (rows.length === 0) return nameMap;

    const byOrg = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.organization_id || !row.tenant_customer_id) continue;
      const orgId = String(row.organization_id);
      const list = byOrg.get(orgId) || [];
      list.push(String(row.tenant_customer_id));
      byOrg.set(orgId, list);
    }

    for (const [orgId, customerIds] of byOrg.entries()) {
      const mapping = tenantDbManager.getTenantMapping(orgId);
      if (!mapping || mapping.provisioningStatus !== 'ACTIVE') {
        continue;
      }
      try {
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        const uniqueIds = [...new Set(customerIds)];
        const placeholders = uniqueIds.map((_, idx) => `$${idx + 2}`).join(', ');
        const custRes = await tenantDb.query<{ id: string; full_name: string | null }>(
          `SELECT id, full_name
           FROM customers
           WHERE organization_id = $1
             AND id IN (${placeholders})
             AND is_deleted = FALSE;`,
          [orgId, ...uniqueIds]
        );
        for (const cRow of custRes.rows) {
          if (cRow.full_name) {
            nameMap.set(`${orgId}:${cRow.id}`, cRow.full_name);
          }
        }
      } catch {
        // Leave customerName as null if tenant DB is currently unavailable; never fabricate names.
      }
    }

    return nameMap;
  }

  public async findGlobalIdentityByPhone(phoneE164: string): Promise<GlobalCustomerIdentity | null> {
    const client = this.getDb();
    try {
      const sql = `
        SELECT id, normalized_mobile_number, phone_verified_at, created_at, updated_at
        FROM global_customer_identities
        WHERE normalized_mobile_number = $1
        LIMIT 1;
      `;
      const res = await client.query(sql, [phoneE164]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return new GlobalCustomerIdentity({
        id: row.id,
        normalizedMobileNumber: row.normalized_mobile_number,
        phoneVerifiedAt: row.phone_verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        'CONTROL_PLANE',
        'CONTROL_PLANE_UNAVAILABLE',
        err?.message || 'Control-plane customer identity lookup failed'
      );
    }
  }

  public async createGlobalIdentity(phoneE164: string): Promise<GlobalCustomerIdentity> {
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

  public async listMembershipsByGlobalId(globalCustomerId: string): Promise<CustomerMembership[]> {
    const client = this.getDb();
    try {
      const sql = `
        SELECT 
          m.id,
          m.global_customer_id,
          m.organization_id,
          m.tenant_customer_id,
          m.farmer_code,
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
      const nameMap = await this.resolveTenantCustomerNames(res.rows);

      return res.rows.map((row: any) => new CustomerMembership({
        id: row.id,
        globalCustomerId: row.global_customer_id,
        organizationId: row.organization_id,
        tenantCustomerId: row.tenant_customer_id,
        farmerCode: row.farmer_code,
        customerName: nameMap.get(`${row.organization_id}:${row.tenant_customer_id}`) ?? null,
        membershipStatus: row.membership_status as MembershipStatus,
        dairyName: row.dairy_name,
        dairyCode: row.dairy_code,
        dairyAddress: row.dairy_address,
        centerId: row.center_id,
        centerName: row.center_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSynchronizedAt: row.last_synchronized_at,
      }));
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        'CONTROL_PLANE',
        'CONTROL_PLANE_UNAVAILABLE',
        err?.message || 'Control-plane customer membership query failed'
      );
    }
  }

  public async findMembership(globalCustomerId: string, organizationId: string): Promise<CustomerMembership | null> {
    const client = this.getDb();
    try {
      const sql = `
        SELECT 
          m.id,
          m.global_customer_id,
          m.organization_id,
          m.tenant_customer_id,
          m.farmer_code,
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
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const nameMap = await this.resolveTenantCustomerNames([row]);

      return new CustomerMembership({
        id: row.id,
        globalCustomerId: row.global_customer_id,
        organizationId: row.organization_id,
        tenantCustomerId: row.tenant_customer_id,
        farmerCode: row.farmer_code,
        customerName: nameMap.get(`${row.organization_id}:${row.tenant_customer_id}`) ?? null,
        membershipStatus: row.membership_status as MembershipStatus,
        dairyName: row.dairy_name,
        dairyCode: row.dairy_code,
        dairyAddress: row.dairy_address,
        centerId: row.center_id,
        centerName: row.center_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSynchronizedAt: row.last_synchronized_at,
      });
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        'CONTROL_PLANE',
        'CONTROL_PLANE_UNAVAILABLE',
        err?.message || 'Control-plane membership lookup failed'
      );
    }
  }

  public async saveMembership(membership: CustomerMembership): Promise<void> {
    const client = this.getDb();
    const sql = `
      INSERT INTO customer_dairy_memberships (
        id, global_customer_id, organization_id, tenant_customer_id,
        farmer_code, membership_status, dairy_name, dairy_code,
        dairy_address, center_id, center_name, created_at, updated_at, last_synchronized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
      ON CONFLICT (organization_id, global_customer_id) DO UPDATE SET
        tenant_customer_id = EXCLUDED.tenant_customer_id,
        farmer_code = COALESCE(EXCLUDED.farmer_code, customer_dairy_memberships.farmer_code),
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
      membership.membershipStatus,
      membership.dairyName,
      membership.dairyCode || null,
      membership.dairyAddress || null,
      membership.centerId || null,
      membership.centerName || null,
    ]);
  }

  public async updateMembershipStatus(
    organizationId: string,
    tenantCustomerId: string,
    status: string,
    farmerCode?: string,
    _customerName?: string
  ): Promise<void> {
    const client = this.getDb();
    const sql = `
      UPDATE customer_dairy_memberships
      SET 
        membership_status = $1,
        farmer_code = COALESCE($2, farmer_code),
        updated_at = NOW(),
        last_synchronized_at = NOW()
      WHERE organization_id = $3 AND tenant_customer_id = $4;
    `;
    await client.query(sql, [status, farmerCode || null, organizationId, tenantCustomerId]);
  }

  public async getMembershipCount(globalCustomerId: string): Promise<number> {
    const client = this.getDb();
    try {
      const sql = `SELECT COUNT(id) AS cnt FROM customer_dairy_memberships WHERE global_customer_id = $1;`;
      const res = await client.query(sql, [globalCustomerId]);
      return Number(res.rows[0]?.cnt || 0);
    } catch (err: any) {
      throw new TenantDatabaseUnavailableError(
        'CONTROL_PLANE',
        'CONTROL_PLANE_UNAVAILABLE',
        err?.message || 'Control-plane membership count failed'
      );
    }
  }
}
