import crypto from 'node:crypto';
import { IOtpService, ITokenService, ICustomerRepository, ICustomerMembershipRepository } from '../../ports/index.js';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { DomainError, DomainValidationError, UnauthorizedError, ForbiddenError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { PostgresCustomerMembershipRepository } from '../../../infrastructure/repositories/PostgresCustomerMembershipRepository.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { tokenRevocationService } from '../../../infrastructure/security/TokenRevocationService.js';

export class RequestCustomerOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string): Promise<{ success: boolean; message: string; cooldownSeconds?: number; expiresAt?: string; previewOtp?: string }> {
    const phone = new PhoneNumber(rawPhone);
    return this.otpService.sendOtp(phone.e164, 'CUSTOMER_AUTH');
  }
}

export interface CustomerAuthSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isRegistered: boolean;
  globalCustomerId?: string;
  memberships?: Array<{
    id: string;
    organizationId: string;
    dairyId: string;
    dairyName: string;
    dairyCode?: string | null;
    dairyAddress?: string | null;
    centerId?: string | null;
    centerName?: string | null;
    farmerCode?: string | null;
    membershipStatus: string;
    status: string;
    isApproved: boolean;
    createdAt?: string;
  }>;
  user: {
    id: string;
    globalCustomerId?: string;
    mobileNumber: string;
    status: 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
    selectedDairyId: string | null;
    customerProfile: {
      name: string;
      dairyName: string;
      village?: string;
    } | null;
  };
  // Backwards-compatibility fields
  token: string;
  customer: {
    id?: string;
    farmerCode?: string;
    fullName?: string;
    mobileNumber: string;
    registrationStatus: string;
    organizationId?: string;
    centerId?: string;
  };
}

export class VerifyCustomerOtpUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly otpService: IOtpService,
    private readonly tokenService: ITokenService,
    private readonly customerRepository: ICustomerRepository,
    membershipRepository?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepository || new PostgresCustomerMembershipRepository();
  }

  public async execute(rawPhone: string, otp: string): Promise<CustomerAuthSessionResult> {
    const phone = new PhoneNumber(rawPhone);

    const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'CUSTOMER_AUTH');
    if (!isValid) {
      throw new DomainValidationError('Invalid or expired OTP.');
    }

    // 1. Resolve or create canonical Global Customer Identity
    let globalIdentity = await this.membershipRepo.findGlobalIdentityByPhone(phone.e164);
    if (!globalIdentity) {
      globalIdentity = await this.membershipRepo.createGlobalIdentity(phone.e164);
    }

    // 2. Discover all memberships registered to this identity
    let memberships = await this.membershipRepo.listMembershipsByGlobalId(globalIdentity.id);

    // 3. Fallback: Check if pre-existing customer exists in tenant database but isn't mapped yet
    if (memberships.length === 0) {
      const legacyCustomer = await this.customerRepository.findByPhone(phone.e164);
      if (legacyCustomer) {
        let dairyName = 'DFarm Cooperative Society';
        let dairyCode = 'DFARM';
        let dairyAddress = 'Regional Center';
        try {
          const orgRes = await db.query(
            `SELECT name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`,
            [legacyCustomer.organizationId]
          );
          if (orgRes.rows.length > 0) {
            dairyName = orgRes.rows[0].name || dairyName;
            dairyCode = orgRes.rows[0].code || dairyCode;
            dairyAddress = orgRes.rows[0].address_line1 || dairyAddress;
          }
        } catch {}

        const mappedMembership = new CustomerMembership({
          id: crypto.randomUUID(),
          globalCustomerId: globalIdentity.id,
          organizationId: legacyCustomer.organizationId,
          tenantCustomerId: legacyCustomer.id,
          farmerCode: legacyCustomer.farmerCode,
          customerName: legacyCustomer.fullName,
          membershipStatus: (legacyCustomer.registrationStatus as any) || (legacyCustomer.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL'),
          dairyName,
          dairyCode,
          dairyAddress,
          centerId: legacyCustomer.centerId,
          centerName: 'Main Collection Center',
        });
        await this.membershipRepo.saveMembership(mappedMembership);
        memberships = [mappedMembership];
      }
    }

    if (memberships.length === 0) {
      // Customer is not registered yet - provide guest registration token
      const guestId = globalIdentity.id;
      const regToken = this.tokenService.signToken({
        userId: `unregistered:${phone.e164}`,
        globalCustomerId: globalIdentity.id,
        role: 'GUEST_FARMER',
        actorType: 'CUSTOMER',
        tokenType: 'access',
      }, 3600); // 1 hour registration window

      return {
        accessToken: regToken,
        refreshToken: regToken,
        expiresIn: 3600,
        isRegistered: false,
        globalCustomerId: globalIdentity.id,
        memberships: [],
        user: {
          id: guestId,
          globalCustomerId: globalIdentity.id,
          mobileNumber: phone.e164,
          status: 'UNREGISTERED',
          selectedDairyId: null,
          customerProfile: null,
        },
        token: regToken,
        customer: {
          id: guestId,
          mobileNumber: phone.e164,
          registrationStatus: 'UNREGISTERED',
        },
      };
    }

    // Pick active membership: prefer first APPROVED, otherwise first available
    const activeMembership = memberships.find((m) => m.isApproved) || memberships[0]!;

    let resolvedCustomerName = activeMembership.customerName;
    if (!resolvedCustomerName && this.customerRepository) {
      try {
        const cust = await this.customerRepository.findById(activeMembership.tenantCustomerId, activeMembership.organizationId);
        if (cust?.fullName) {
          resolvedCustomerName = cust.fullName;
        }
      } catch {}
    }
    const finalCustomerName = resolvedCustomerName || (activeMembership.farmerCode ? `Farmer ${activeMembership.farmerCode}` : 'Valued Farmer');

    const token = this.tokenService.signToken({
      userId: activeMembership.tenantCustomerId,
      organizationId: activeMembership.organizationId,
      centerId: activeMembership.centerId || undefined,
      globalCustomerId: globalIdentity.id,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
      tokenType: 'access',
    });

    const refreshToken = this.tokenService.signToken({
      userId: activeMembership.tenantCustomerId,
      organizationId: activeMembership.organizationId,
      centerId: activeMembership.centerId || undefined,
      globalCustomerId: globalIdentity.id,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
      tokenType: 'refresh',
    }, 30 * 86400); // 30 days

    const statusMapping: 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' =
      activeMembership.membershipStatus === 'APPROVED' ? 'APPROVED' :
      activeMembership.membershipStatus === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' :
      activeMembership.membershipStatus === 'REJECTED' ? 'REJECTED' :
      activeMembership.membershipStatus === 'SUSPENDED' ? 'SUSPENDED' : 'UNREGISTERED';

    return {
      accessToken: token,
      refreshToken,
      expiresIn: 86400,
      isRegistered: true,
      globalCustomerId: globalIdentity.id,
      memberships: memberships.map((m) => m.toJSON()),
      user: {
        id: activeMembership.tenantCustomerId,
        globalCustomerId: globalIdentity.id,
        mobileNumber: phone.e164,
        status: statusMapping,
        selectedDairyId: activeMembership.organizationId,
        customerProfile: {
          name: finalCustomerName,
          dairyName: activeMembership.dairyName,
          village: activeMembership.dairyAddress || undefined,
        },
      },
      token,
      customer: {
        id: activeMembership.tenantCustomerId,
        farmerCode: activeMembership.farmerCode || undefined,
        fullName: finalCustomerName,
        mobileNumber: phone.e164,
        registrationStatus: activeMembership.membershipStatus,
        organizationId: activeMembership.organizationId,
        centerId: activeMembership.centerId || undefined,
      },
    };
  }
}

export class RefreshTokenUseCase {
  constructor(private readonly tokenService: ITokenService) {}

  public async execute(oldToken: string): Promise<{
    token: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    if (!oldToken || typeof oldToken !== 'string' || !oldToken.trim()) {
      throw new UnauthorizedError('Refresh token is required', 'MISSING_REFRESH_TOKEN');
    }

    const cleanToken = oldToken.startsWith('Bearer ') ? oldToken.slice(7).trim() : oldToken.trim();
    const claims = this.tokenService.verifyToken(cleanToken);

    if (claims.tokenType !== 'refresh') {
      throw new UnauthorizedError('Invalid token type: refresh token required', 'INVALID_TOKEN_TYPE');
    }

    if (claims.role === 'GUEST_FARMER' || String(claims.userId || '').startsWith('unregistered:')) {
      throw new UnauthorizedError('Unregistered guest tokens cannot be refreshed', 'INVALID_REFRESH_ACTOR');
    }

    if (await tokenRevocationService.isRevoked(cleanToken, claims.jti)) {
      throw new UnauthorizedError('Refresh token has been revoked', 'TOKEN_REVOKED');
    }

    let resolvedRole = claims.role;
    let resolvedOrgId = claims.organizationId;
    let resolvedCenterId = claims.centerId;

    if (claims.actorType === 'STAFF') {
      let staffRes;
      try {
        staffRes = await db.query(
          `SELECT u.id, u.organization_id, u.role, u.user_role, u.status AS user_status, o.status AS org_status
           FROM users u
           LEFT JOIN organizations o ON o.id = u.organization_id
           WHERE u.id::text = $1
           LIMIT 1;`,
          [claims.userId]
        );
      } catch {
        throw new DomainError('Authentication verification database is unavailable', 'AUTH_DB_UNAVAILABLE', 503);
      }

      if (staffRes.rows.length === 0) {
        throw new UnauthorizedError('Staff account no longer exists', 'USER_NOT_FOUND');
      }

      const row = staffRes.rows[0];
      if (String(row.user_status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError('Staff account is suspended or inactive', 'ACCOUNT_SUSPENDED');
      }

      resolvedRole = String(row.user_role || row.role || claims.role).trim().toUpperCase();
      resolvedOrgId = row.organization_id || resolvedOrgId;

      const isPlatformStaff = resolvedRole === 'SUPER_ADMIN' || resolvedRole === 'PLATFORM_OPERATOR';
      if (!isPlatformStaff && (!row.organization_id || String(row.org_status || '').toUpperCase() !== 'ACTIVE')) {
        throw new ForbiddenError('Assigned dairy cooperative is inactive or suspended', 'ORG_INACTIVE');
      }
    } else {
      let verifiedCustomer = false;
      try {
        const custRes = await db.query(
          `SELECT c.id, c.organization_id, c.primary_center_id, c.status, c.is_deleted, o.status AS org_status
           FROM customers c
           LEFT JOIN organizations o ON o.id = c.organization_id
           WHERE c.id::text = $1
           LIMIT 1;`,
          [claims.userId]
        );

        if (custRes.rows.length > 0) {
          const row = custRes.rows[0];
          if (row.is_deleted) {
            throw new ForbiddenError('Customer account has been deleted', 'ACCOUNT_DELETED');
          }
          const custStatus = String(row.status || '').toUpperCase();
          if (custStatus === 'SUSPENDED' || custStatus === 'INACTIVE' || custStatus === 'SOFT_DELETED') {
            throw new ForbiddenError('Customer account is suspended or inactive', 'ACCOUNT_SUSPENDED');
          }
          if (row.org_status && String(row.org_status).toUpperCase() !== 'ACTIVE') {
            throw new ForbiddenError('Customer dairy cooperative is inactive or suspended', 'ORG_INACTIVE');
          }
          resolvedOrgId = row.organization_id || resolvedOrgId;
          resolvedCenterId = row.primary_center_id || resolvedCenterId;
          resolvedRole = 'FARMER_CUSTOMER';
          verifiedCustomer = true;
        } else {
          const memRes = await db.query(
            `SELECT m.tenant_customer_id, m.organization_id, m.center_id, m.membership_status, o.status AS org_status
             FROM customer_dairy_memberships m
             LEFT JOIN organizations o ON o.id = m.organization_id
             WHERE m.tenant_customer_id::text = $1
               AND ($2::text IS NULL OR m.organization_id::text = $2)
             LIMIT 1;`,
            [claims.userId, claims.organizationId || null]
          );

          if (memRes.rows.length > 0) {
            const m = memRes.rows[0];
            const mStatus = String(m.membership_status || '').toUpperCase();
            if (mStatus === 'SUSPENDED' || mStatus === 'REJECTED') {
              throw new ForbiddenError('Customer membership is suspended or rejected', 'ACCOUNT_SUSPENDED');
            }
            if (m.org_status && String(m.org_status).toUpperCase() !== 'ACTIVE') {
              throw new ForbiddenError('Customer dairy cooperative is inactive or suspended', 'ORG_INACTIVE');
            }
            resolvedOrgId = m.organization_id || resolvedOrgId;
            resolvedCenterId = m.center_id || resolvedCenterId;
            resolvedRole = 'FARMER_CUSTOMER';
            verifiedCustomer = true;
          }
        }
      } catch (err) {
        if (err instanceof DomainError) throw err;
        throw new DomainError('Authentication verification database is unavailable', 'AUTH_DB_UNAVAILABLE', 503);
      }

      if (!verifiedCustomer) {
        throw new UnauthorizedError('Customer account or membership could not be verified', 'USER_NOT_FOUND');
      }
    }

    // Rotate refresh token: revoke the consumed token before issuing a replacement pair
    await tokenRevocationService.revokeAsync({
      token: cleanToken,
      jti: claims.jti,
      expiresAtSeconds: claims.exp,
    });

    const accessTtl = claims.actorType === 'STAFF' ? 24 * 3600 : 86400;
    const accessToken = this.tokenService.signToken({
      userId: claims.userId,
      organizationId: resolvedOrgId,
      centerId: resolvedCenterId,
      globalCustomerId: claims.globalCustomerId,
      role: resolvedRole,
      actorType: claims.actorType,
      deviceId: claims.deviceId,
      tokenType: 'access',
    }, accessTtl);

    const nextRefreshToken = this.tokenService.signToken({
      userId: claims.userId,
      organizationId: resolvedOrgId,
      centerId: resolvedCenterId,
      globalCustomerId: claims.globalCustomerId,
      role: resolvedRole,
      actorType: claims.actorType,
      deviceId: claims.deviceId,
      tokenType: 'refresh',
    }, 30 * 86400);

    return {
      token: accessToken,
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: accessTtl,
    };
  }
}
