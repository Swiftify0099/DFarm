import { DomainError, ForbiddenError } from '../../domain/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';

export interface VerifiedStaffAuthority {
  found: true;
  actorType: 'STAFF';
  userId: string;
  organizationId: string;
  role: string;
  fullName?: string;
  phoneNumber?: string;
  centerIds: string[];
  primaryCenterId?: string;
}

export interface VerifiedCustomerAuthority {
  found: true;
  actorType: 'CUSTOMER';
  userId: string;
  organizationId?: string;
  centerId?: string;
  globalCustomerId?: string;
  role: 'FARMER_CUSTOMER' | 'GUEST_FARMER';
  fullName?: string;
  phoneNumber?: string;
  farmerCode?: string;
  registrationStatus?: string;
  accountStatus: string;
}

export type VerifiedAuthorityResult = VerifiedStaffAuthority | VerifiedCustomerAuthority;

/**
 * Shared authoritative identity and organization verification service.
 * Used by both `middleware/authenticate.ts` and `presentation/middleware/authenticate.ts`
 * plus `RefreshTokenUseCase` so all authentication paths enforce identical fail-closed rules.
 */
export class AccountAuthorityService {
  private throwUnavailable(context: string, err: unknown): never {
    logger.error(
      { context, err: err instanceof Error ? err.message : 'unknown' },
      '[AccountAuthorityService] Database verification failed (failing closed)'
    );
    throw new DomainError(
      'Authentication verification database is unavailable',
      'AUTH_DB_UNAVAILABLE',
      503
    );
  }

  public async verifyStaff(params: {
    userId: string;
    claimedOrganizationId?: string;
    loadCenterAssignments?: boolean;
  }): Promise<VerifiedStaffAuthority | null> {
    const controlDb = tenantDbManager.getControlPlaneDb();
    let staffRow: any = null;
    try {
      const staffRes = await controlDb.query(
        `SELECT u.id, u.organization_id, u.username, u.full_name, u.email, u.phone_number,
                u.role, u.user_role, u.status, o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id::text = $1
         LIMIT 1;`,
        [params.userId]
      );
      if (staffRes.rows.length > 0) {
        staffRow = staffRes.rows[0];
      }
    } catch (err) {
      this.throwUnavailable('verifyStaff.userLookup', err);
    }

    if (!staffRow) {
      return null;
    }

    const userStatus = String(staffRow.status || '').toUpperCase();
    if (userStatus !== 'ACTIVE') {
      throw new ForbiddenError(
        `Staff account status is ${staffRow.status || 'INACTIVE'}. Access denied.`,
        'ACCOUNT_SUSPENDED'
      );
    }

    const resolvedRole = String(staffRow.user_role || staffRow.role || '').trim().toUpperCase();
    if (!resolvedRole) {
      throw new ForbiddenError('Staff account has no valid authoritative role.', 'ROLE_MISSING');
    }

    const isPlatformStaff = resolvedRole === 'SUPER_ADMIN' || resolvedRole === 'PLATFORM_OPERATOR';
    const dbOrgId = staffRow.organization_id ? String(staffRow.organization_id) : undefined;

    if (!isPlatformStaff) {
      if (!dbOrgId) {
        throw new ForbiddenError('Staff account is not mapped to an active dairy cooperative.', 'ORG_MISSING');
      }
      if (String(staffRow.org_status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError(
          'Assigned dairy cooperative is currently inactive or suspended.',
          'ORG_SUSPENDED'
        );
      }
      if (
        params.claimedOrganizationId &&
        params.claimedOrganizationId.trim().toLowerCase() !== dbOrgId.toLowerCase()
      ) {
        throw new ForbiddenError(
          'Token organization context does not match authoritative user organization.',
          'TENANT_CONTEXT_MISMATCH'
        );
      }
    }

    const resolvedOrgId = dbOrgId || params.claimedOrganizationId || '';
    let centerIds: string[] = [];
    let primaryCenterId: string | undefined;

    if (params.loadCenterAssignments !== false) {
      try {
        const assignRes = await controlDb.query(
          `SELECT uca.center_id, uca.is_primary
           FROM user_center_assignments uca
           JOIN dairy_centers dc ON dc.id = uca.center_id
           WHERE uca.user_id::text = $1
             AND ($2::text = '' OR dc.organization_id::text = $2);`,
          [staffRow.id, dbOrgId || '']
        );
        const rows = assignRes.rows as Array<{ center_id: string; is_primary: boolean }>;
        centerIds = rows.map((r) => String(r.center_id));
        const primaryRow = rows.find((r) => r.is_primary);
        primaryCenterId = primaryRow ? String(primaryRow.center_id) : centerIds[0];
      } catch (err) {
        this.throwUnavailable('verifyStaff.centerAssignments', err);
      }
    }

    return {
      found: true,
      actorType: 'STAFF',
      userId: String(staffRow.id),
      organizationId: resolvedOrgId,
      role: resolvedRole,
      fullName: staffRow.full_name || undefined,
      phoneNumber: staffRow.phone_number || undefined,
      centerIds,
      primaryCenterId,
    };
  }

  public async verifyCustomer(params: {
    userId: string;
    claimedRole?: string;
    organizationId?: string;
    globalCustomerId?: string;
    allowGuestFarmer: boolean;
    strictActiveOnly: boolean;
  }): Promise<VerifiedCustomerAuthority | null> {
    const controlDb = tenantDbManager.getControlPlaneDb();
    const claimedRoleUpper = String(params.claimedRole || '').trim().toUpperCase();
    const isGuestSubject = params.userId.startsWith('unregistered:');

    if (claimedRoleUpper === 'GUEST_FARMER' || isGuestSubject) {
      if (!params.allowGuestFarmer) {
        return null;
      }
      const guestPhone = isGuestSubject ? params.userId.slice('unregistered:'.length).trim() : '';
      let identityRow: any = null;
      try {
        const res = await controlDb.query(
          `SELECT id, normalized_mobile_number, phone_verified_at
           FROM global_customer_identities
           WHERE ($1::text IS NOT NULL AND id::text = $1)
              OR ($2::text <> '' AND normalized_mobile_number = $2)
           LIMIT 1;`,
          [params.globalCustomerId || null, guestPhone]
        );
        if (res.rows.length > 0) {
          identityRow = res.rows[0];
        }
      } catch (err) {
        this.throwUnavailable('verifyCustomer.guestIdentity', err);
      }

      if (!identityRow || !identityRow.phone_verified_at) {
        return null;
      }

      return {
        found: true,
        actorType: 'CUSTOMER',
        userId: `unregistered:${identityRow.normalized_mobile_number}`,
        globalCustomerId: String(identityRow.id),
        role: 'GUEST_FARMER',
        phoneNumber: String(identityRow.normalized_mobile_number),
        registrationStatus: 'UNREGISTERED',
        accountStatus: 'GUEST',
      };
    }

    // -------------------------------------------------------------------------
    // Registered Customer verification:
    //   1. Resolve membership & organization from CONTROL PLANE only.
    //      (NEVER query tenant-only `customers` on the control-plane DB.)
    //   2. Reject claimed organizationId mismatches with 403 TENANT_CONTEXT_MISMATCH.
    //   3. Resolve tenant DB strictly via tenantDbManager.getStrictTenantDb(orgId).
    //   4. Query `customers` + `dairy_centers` inside the resolved tenant DB only.
    //   5. Verify cross-plane consistency (customer ID, org ID, global ID, center
    //      ownership, status, registration status, deletion state).
    //   6. Fail closed on missing membership, missing tenant record, or DB outage.
    // -------------------------------------------------------------------------
    let membershipRow: any = null;
    let customerRow: any = null;
    let orgStatus: string | null = null;
    const claimedOrgId = params.organizationId?.trim() || undefined;

    try {
      // Step 1: Control-plane membership lookup by tenant_customer_id
      // Order matching organizationId first so multi-org edge cases prefer exact match,
      // while still detecting when tenant_customer_id belongs to a different organization.
      const memRes = await controlDb.query(
        `SELECT m.tenant_customer_id, m.global_customer_id, m.organization_id, m.center_id,
                m.farmer_code, m.membership_status, o.status AS org_status
         FROM customer_dairy_memberships m
         LEFT JOIN organizations o ON o.id = m.organization_id
         WHERE m.tenant_customer_id::text = $1
         ORDER BY (CASE WHEN $2::text IS NOT NULL AND m.organization_id::text = $2 THEN 0 ELSE 1 END)
         LIMIT 1;`,
        [params.userId, claimedOrgId || null]
      );
      if (memRes.rows.length > 0) {
        membershipRow = memRes.rows[0];
        orgStatus = membershipRow.org_status || null;
      }

      // Fallback lookup by globalCustomerId only when tenant_customer_id wasn't matched directly
      if (!membershipRow && params.globalCustomerId) {
        const gMemRes = await controlDb.query(
          `SELECT m.tenant_customer_id, m.global_customer_id, m.organization_id, m.center_id,
                  m.farmer_code, m.membership_status, o.status AS org_status
           FROM customer_dairy_memberships m
           LEFT JOIN organizations o ON o.id = m.organization_id
           WHERE m.global_customer_id::text = $1
           ORDER BY (CASE WHEN $2::text IS NOT NULL AND m.organization_id::text = $2 THEN 0 ELSE 1 END)
           LIMIT 1;`,
          [params.globalCustomerId, claimedOrgId || null]
        );
        if (gMemRes.rows.length > 0) {
          const candidate = gMemRes.rows[0];
          // Reject subject spoofing if caller's userId doesn't match the membership's tenant_customer_id or globalCustomerId
          if (
            String(candidate.tenant_customer_id || '').toLowerCase() !== params.userId.toLowerCase() &&
            String(candidate.global_customer_id || '').toLowerCase() !== params.userId.toLowerCase()
          ) {
            throw new ForbiddenError(
              'Customer subject does not match authoritative membership identity.',
              'TENANT_CONTEXT_MISMATCH'
            );
          }
          membershipRow = candidate;
          orgStatus = membershipRow.org_status || null;
        }
      }

      if (!membershipRow || !membershipRow.organization_id) {
        return null;
      }

      const authoritativeOrgId = String(membershipRow.organization_id);

      // Step 2: Reject mismatched tenant claim immediately (403)
      if (claimedOrgId && claimedOrgId.toLowerCase() !== authoritativeOrgId.toLowerCase()) {
        throw new ForbiddenError(
          'Customer token organization context does not match authoritative dairy membership.',
          'TENANT_CONTEXT_MISMATCH'
        );
      }

      if (
        params.globalCustomerId &&
        membershipRow.global_customer_id &&
        String(membershipRow.global_customer_id).toLowerCase() !== params.globalCustomerId.toLowerCase()
      ) {
        throw new ForbiddenError(
          'Global customer identity mismatch between JWT claim and control-plane membership.',
          'GLOBAL_IDENTITY_MISMATCH'
        );
      }

      // Step 3: Validate active organization in control plane
      if (!orgStatus) {
        const orgRes = await controlDb.query(
          `SELECT status FROM organizations WHERE id::text = $1 LIMIT 1;`,
          [authoritativeOrgId]
        );
        if (orgRes.rows.length > 0) {
          orgStatus = orgRes.rows[0].status;
        }
      }
      if (!orgStatus || String(orgStatus).toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError('Customer dairy cooperative is inactive or suspended.', 'ORG_SUSPENDED');
      }

      const memStatusPre = String(membershipRow.membership_status || '').toUpperCase();
      if (memStatusPre === 'SUSPENDED' || memStatusPre === 'REJECTED') {
        throw new ForbiddenError('Customer membership is suspended or rejected.', 'ACCOUNT_SUSPENDED');
      }

      // Step 4: Resolve exact tenant DB strictly (never falls back to control plane or another tenant)
      const tenantDb = await tenantDbManager.getStrictTenantDb(authoritativeOrgId);
      const tenantCustId = String(membershipRow.tenant_customer_id || params.userId);

      const tenantCustRes = await tenantDb.query(
        `SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name,
                c.normalized_mobile_number, c.status, c.registration_status, c.is_deleted,
                c.global_customer_id,
                dc.id AS resolved_center_id, dc.organization_id AS center_org_id
         FROM customers c
         LEFT JOIN dairy_centers dc ON dc.id = c.primary_center_id
         WHERE c.id::text = $1
         LIMIT 1;`,
        [tenantCustId]
      );
      if (tenantCustRes.rows.length > 0) {
        customerRow = tenantCustRes.rows[0];
      }

      // Fail closed if tenant database has no matching customer record for this membership
      if (!customerRow) {
        return null;
      }

      // Step 5: Verify tenant customer ownership & cross-plane consistency
      const tenantOrgId = String(customerRow.organization_id || '');
      if (tenantOrgId.toLowerCase() !== authoritativeOrgId.toLowerCase()) {
        logger.error(
          { userId: params.userId, controlPlaneOrg: authoritativeOrgId, tenantOrg: tenantOrgId },
          '[AccountAuthorityService] Cross-plane org mismatch — failing closed'
        );
        throw new ForbiddenError(
          'Customer organization mismatch between control plane and tenant database.',
          'TENANT_ORG_MISMATCH'
        );
      }

      if (
        customerRow.primary_center_id &&
        (!customerRow.resolved_center_id ||
          String(customerRow.center_org_id || '').toLowerCase() !== authoritativeOrgId.toLowerCase())
      ) {
        throw new ForbiddenError(
          'Customer center ownership mismatch in tenant database.',
          'CENTER_ORG_MISMATCH'
        );
      }

      if (
        params.globalCustomerId &&
        customerRow.global_customer_id &&
        String(customerRow.global_customer_id).toLowerCase() !== params.globalCustomerId.toLowerCase()
      ) {
        throw new ForbiddenError(
          'Global customer identity mismatch between JWT claim and tenant database.',
          'GLOBAL_IDENTITY_MISMATCH'
        );
      }

      if (
        membershipRow.global_customer_id &&
        customerRow.global_customer_id &&
        String(customerRow.global_customer_id).toLowerCase() !==
          String(membershipRow.global_customer_id).toLowerCase()
      ) {
        throw new ForbiddenError(
          'Global customer identity mismatch between control-plane membership and tenant database.',
          'GLOBAL_IDENTITY_MISMATCH'
        );
      }
    } catch (err) {
      if (err instanceof DomainError) throw err;
      this.throwUnavailable('verifyCustomer.lookup', err);
    }

    if (customerRow.is_deleted) {
      throw new ForbiddenError('Customer account has been soft-deleted.', 'ACCOUNT_DELETED');
    }

    const custStatus = String(customerRow.status || '').toUpperCase();
    const regStatus = String(
      customerRow.registration_status || membershipRow.membership_status || ''
    ).toUpperCase();
    const memStatus = String(membershipRow.membership_status || '').toUpperCase();

    if (
      custStatus === 'SUSPENDED' ||
      custStatus === 'SOFT_DELETED' ||
      regStatus === 'REJECTED' ||
      memStatus === 'SUSPENDED' ||
      memStatus === 'REJECTED'
    ) {
      throw new ForbiddenError('Customer account or membership is suspended or rejected.', 'ACCOUNT_SUSPENDED');
    }

    if (params.strictActiveOnly) {
      if (custStatus !== 'ACTIVE') {
        throw new ForbiddenError('Customer account is not active.', 'ACCOUNT_SUSPENDED');
      }
    } else if (custStatus === 'INACTIVE' && regStatus !== 'PENDING_APPROVAL') {
      throw new ForbiddenError('Customer account is inactive or suspended.', 'ACCOUNT_SUSPENDED');
    }

    const authoritativeOrgId = String(customerRow.organization_id);

    return {
      found: true,
      actorType: 'CUSTOMER',
      userId: String(customerRow.id),
      organizationId: authoritativeOrgId,
      centerId: customerRow.primary_center_id || membershipRow.center_id || undefined,
      globalCustomerId:
        customerRow.global_customer_id ||
        membershipRow.global_customer_id ||
        params.globalCustomerId,
      role: 'FARMER_CUSTOMER',
      fullName: customerRow.full_name || undefined,
      phoneNumber: customerRow.normalized_mobile_number || undefined,
      farmerCode: customerRow.farmer_code || membershipRow.farmer_code || undefined,
      registrationStatus: regStatus || undefined,
      accountStatus: custStatus || memStatus || 'ACTIVE',
    };
  }
}

export const accountAuthorityService = new AccountAuthorityService();
