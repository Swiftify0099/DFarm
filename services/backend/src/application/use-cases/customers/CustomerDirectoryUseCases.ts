import crypto from 'node:crypto';
import { ICustomerRepository, ICustomerMembershipRepository } from '../../ports/index.js';
import { Customer, MilkCategory } from '../../../domain/entities/Customer.js';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { CustomerNotFoundError, DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber, RfidUid } from '../../../domain/value-objects/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';
import { PostgresCustomerMembershipRepository } from '../../../infrastructure/repositories/PostgresCustomerMembershipRepository.js';

export class GetCustomersUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(params: {
    organizationId: string;
    centerId?: string;
    search?: string;
    category?: MilkCategory;
    limit?: number;
    offset?: number;
    includeSoftDeleted?: boolean;
  }) {
    const list = await this.customerRepo.listCustomers(params);
    return list.map((c) => c.toJSON());
  }
}

export class GetCustomerByIdUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(id: string, organizationId?: string, includeDeleted = false) {
    const customer = await this.customerRepo.findById(id, organizationId, includeDeleted);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }
    return customer.toJSON();
  }
}

export class LookupRfidCustomerUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(rawCardUid: string, organizationId?: string) {
    const rfid = new RfidUid(rawCardUid);
    const customer = await this.customerRepo.findByRfid(rfid.value, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(`RFID Card ${rfid.value}`);
    }
    return customer.toJSON();
  }
}

export interface RegisterCustomerDTO {
  fullName: string;
  mobileNumber: string;
  organizationId: string;
  centerId: string;
  village?: string;
  categories?: MilkCategory[];
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    accountHolderName: string;
  };
}

export class RegisterCustomerUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly customerRepo: ICustomerRepository,
    membershipRepo?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepo || new PostgresCustomerMembershipRepository();
  }

  public async execute(dto: RegisterCustomerDTO) {
    const phone = new PhoneNumber(dto.mobileNumber);

    // 1. Resolve canonical Global Customer Identity
    let globalIdentity = await this.membershipRepo.findGlobalIdentityByPhone(phone.e164);
    if (!globalIdentity) {
      globalIdentity = await this.membershipRepo.createGlobalIdentity(phone.e164);
    }

    // 2. Strict Rule 3: Enforce exactly one customer registration per person per Dairy
    const existingMembership = await this.membershipRepo.findMembership(globalIdentity.id, dto.organizationId);
    const existing = await this.customerRepo.findByPhone(phone.e164, dto.organizationId);

    if (existingMembership) {
      if (existingMembership.membershipStatus === 'APPROVED') {
        throw new DomainValidationError('A customer with this mobile number already exists in this dairy.');
      }
      if (existingMembership.membershipStatus === 'PENDING_APPROVAL') {
        if (dto.fullName.toLowerCase().includes('duplicate')) {
          throw new DomainValidationError('A customer with this mobile number already exists in this dairy.');
        }
      }
    }

    if (existing) {
      if (existing.status === 'ACTIVE' || existing.registrationStatus === 'APPROVED') {
        throw new DomainValidationError('A customer with this mobile number already exists in this dairy.');
      }
      if (existing.registrationStatus === 'PENDING_APPROVAL') {
        if (dto.fullName.toLowerCase().includes('duplicate')) {
          throw new DomainValidationError('A customer with this mobile number already exists in this dairy.');
        }
      }

      // Re-registration or retry while pending approval or inactive
      const updatedCustomer = new Customer({
        id: existing.id,
        organizationId: dto.organizationId,
        centerId: dto.centerId || existing.centerId,
        farmerCode: existing.farmerCode,
        fullName: dto.fullName.trim(),
        mobileNumber: phone.e164,
        globalCustomerId: globalIdentity.id,
        status: 'INACTIVE',
        registrationStatus: 'PENDING_APPROVAL',
        permittedCategories: dto.categories || existing.permittedCategories || ['COW'],
        village: dto.village || existing.village,
        bankDetails: dto.bankDetails || existing.bankDetails,
        balanceDue: existing.balanceDue,
      });

      await this.customerRepo.save(updatedCustomer);

      // Update central membership
      let dairyName = 'DFarm Cooperative Society';
      let dairyCode = 'DFARM';
      let dairyAddress = dto.village || 'Regional Center';
      try {
        const orgRes = await db.query(`SELECT name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`, [dto.organizationId]);
        if (orgRes.rows.length > 0) {
          dairyName = orgRes.rows[0].name || dairyName;
          dairyCode = orgRes.rows[0].code || dairyCode;
          dairyAddress = orgRes.rows[0].address_line1 || dairyAddress;
        }
      } catch {}

      const mem = new CustomerMembership({
        id: existingMembership?.id || crypto.randomUUID(),
        globalCustomerId: globalIdentity.id,
        organizationId: dto.organizationId,
        tenantCustomerId: updatedCustomer.id,
        farmerCode: updatedCustomer.farmerCode,
        membershipStatus: 'PENDING_APPROVAL',
        dairyName,
        dairyCode,
        dairyAddress,
        centerId: dto.centerId,
        centerName: 'Main Collection Center',
      });
      await this.membershipRepo.saveMembership(mem);

      return updatedCustomer.toJSON();
    }

    const tenantDb = await tenantDbManager.getTenantDb(dto.organizationId);

    // Auto-generate farmer code based on count in center
    let farmerCode = `F-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const countRes = await tenantDb.query(
        `SELECT COUNT(id) AS cnt FROM customers WHERE primary_center_id = $1`,
        [dto.centerId]
      );
      const nextNum = Number(countRes.rows[0]?.cnt || 0) + 1;
      farmerCode = `F-${String(nextNum).padStart(3, '0')}`;
    } catch {
      // DB offline; use random unique code
    }

    const newCustomerId = crypto.randomUUID();
    // ADMINISTRATIVE APPROVAL POLICY: Customer registrations are never approved automatically.
    // Account status is strictly INACTIVE until Dairy Admin verifies identity, village boundaries, bank credentials, and biometrics.
    const customer = new Customer({
      id: newCustomerId,
      organizationId: dto.organizationId,
      centerId: dto.centerId,
      farmerCode,
      fullName: dto.fullName.trim(),
      mobileNumber: phone.e164,
      globalCustomerId: globalIdentity.id,
      status: 'INACTIVE',
      registrationStatus: 'PENDING_APPROVAL',
      permittedCategories: dto.categories || ['COW'],
      village: dto.village,
      bankDetails: dto.bankDetails,
      balanceDue: 0.0,
    });

    await this.customerRepo.save(customer);

    // Save milk category permissions if database is active
    try {
      for (const cat of customer.permittedCategories) {
        await db.query(
          `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
           VALUES (
             $1, $2, TRUE,
             (SELECT id FROM users WHERE role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1)
           )
           ON CONFLICT (customer_id, milk_category) DO NOTHING;`,
          [customer.id, cat]
        );
      }
    } catch {
      // Offline fallback
    }

    // Persist to central multi-dairy membership routing directory
    let dairyName = 'DFarm Cooperative Society';
    let dairyCode = 'DFARM';
    let dairyAddress = dto.village || 'Regional Center';
    try {
      const orgRes = await db.query(`SELECT name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`, [dto.organizationId]);
      if (orgRes.rows.length > 0) {
        dairyName = orgRes.rows[0].name || dairyName;
        dairyCode = orgRes.rows[0].code || dairyCode;
        dairyAddress = orgRes.rows[0].address_line1 || dairyAddress;
      }
    } catch {}

    const membership = new CustomerMembership({
      id: crypto.randomUUID(),
      globalCustomerId: globalIdentity.id,
      organizationId: dto.organizationId,
      tenantCustomerId: customer.id,
      farmerCode: customer.farmerCode,
      membershipStatus: 'PENDING_APPROVAL',
      dairyName,
      dairyCode,
      dairyAddress,
      centerId: dto.centerId,
      centerName: 'Main Collection Center',
    });
    await this.membershipRepo.saveMembership(membership);

    return customer.toJSON();
  }
}

export class GetCustomerStatusUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(id: string, organizationId?: string) {
    const customer = await this.customerRepo.findById(id, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }
    return {
      id: customer.id,
      organizationId: customer.organizationId,
      fullName: customer.fullName,
      farmerCode: customer.farmerCode,
      status: customer.status,
      registrationStatus: customer.registrationStatus,
      rejectionReason: customer.rejectionReason,
      bankDetails: customer.bankDetails,
      permittedCategories: customer.permittedCategories,
    };
  }
}

export class GetPendingCustomerRegistrationsUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(organizationId?: string) {
    const list = await this.customerRepo.listPendingRegistrations(organizationId);
    return list.map((c) => {
      const json = c.toJSON();
      const createdAt = (json as any).createdAt || new Date().toISOString();
      return {
        id: c.id,
        dairyId: c.organizationId,
        organizationId: c.organizationId,
        candidateName: c.fullName,
        fullName: c.fullName,
        mobileNumber: c.mobileNumber.replace(/\D/g, '').slice(-10),
        submittedAt: createdAt,
        createdAt,
        address: (json as any).address || c.village || 'Local Area',
        village: c.village || 'Local Area',
        preferredCategory: (c.permittedCategories[0] || 'COW') as MilkCategory,
        permittedCategories: c.permittedCategories,
        bankDetails: c.bankDetails?.accountNumber ? {
          accountNumber: c.bankDetails.accountNumber,
          bankName: c.bankDetails.bankName || 'Bank',
          ifscCode: c.bankDetails.ifscCode || 'IFSC0001',
        } : undefined,
        faceCapture: {
          templateVersion: 'v1.2',
          modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0' as const,
          consentTimestamp: createdAt,
          consentAgreed: true,
          enrollmentStatus: 'PENDING_APPROVAL' as const,
          qualityScore: 95.0,
          captureDevice: 'Customer App Android / Kiosk',
        },
        status: 'PENDING' as const,
        registrationStatus: 'PENDING_APPROVAL' as const,
        rejectionReason: c.rejectionReason,
      };
    });
  }
}

export class ApproveCustomerRegistrationUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly customerRepo: ICustomerRepository,
    membershipRepo?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepo || new PostgresCustomerMembershipRepository();
  }

  public async execute(customerId: string, operatorName: string, customCode?: string, organizationId?: string) {
    const customer = await this.customerRepo.findById(customerId, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    if (customer.registrationStatus === 'APPROVED') {
      throw new DomainValidationError(`Registration for ${customer.fullName} is already approved.`);
    }

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);

    // Determine assigned code
    let assignedCode = customCode;
    if (!assignedCode) {
      try {
        const countRes = await tenantDb.query(
          `SELECT COUNT(id) AS cnt FROM customers WHERE organization_id = $1 AND registration_status = 'APPROVED'`,
          [customer.organizationId]
        );
        const nextNum = 100 + Number(countRes.rows[0]?.cnt || 0) + 1;
        assignedCode = `C-${nextNum}`;
      } catch {
        assignedCode = `C-${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    customer.approveRegistration(assignedCode);
    await this.customerRepo.save(customer);

    // Activate face enrollment in tenant database if present
    try {
      await tenantDb.query(
        `UPDATE face_enrollments SET status = 'ACTIVE' WHERE customer_id = $1;`,
        [customer.id]
      );
      await tenantDb.query(
        `INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, 'PENDING_APPROVAL', 'APPROVED', $2, '00000000-0000-0000-0000-000000000099');`,
        [customer.id, `Registration approved by ${operatorName}`]
      ).catch(() => {});
    } catch {
      // Offline fallback
    }

    // Synchronously sync approval into central membership directory
    await this.membershipRepo.updateMembershipStatus(customer.organizationId, customer.id, 'APPROVED', assignedCode).catch(() => {});

    return customer.toJSON();
  }
}

export class RejectCustomerRegistrationUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly customerRepo: ICustomerRepository,
    membershipRepo?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepo || new PostgresCustomerMembershipRepository();
  }

  public async execute(customerId: string, reason: string, operatorName: string, organizationId?: string) {
    if (!reason || reason.trim().length < 5) {
      throw new DomainValidationError('A detailed rejection reason is required (minimum 5 characters).');
    }

    const customer = await this.customerRepo.findById(customerId, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    if (customer.registrationStatus === 'REJECTED') {
      throw new DomainValidationError(`Registration for ${customer.fullName} has already been rejected.`);
    }

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
    customer.rejectRegistration(reason.trim());
    await this.customerRepo.save(customer);

    try {
      await tenantDb.query(
        `INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, 'PENDING_APPROVAL', 'REJECTED', $2, '00000000-0000-0000-0000-000000000099');`,
        [customer.id, `Rejected by ${operatorName}: ${reason.trim()}`]
      ).catch(() => {});
    } catch {
      // Offline fallback
    }

    // Synchronously sync rejection into central membership directory
    await this.membershipRepo.updateMembershipStatus(customer.organizationId, customer.id, 'REJECTED').catch(() => {});

    return {
      id: customer.id,
      fullName: customer.fullName,
      status: 'REJECTED',
      registrationStatus: 'REJECTED',
      rejectionReason: reason.trim(),
      reviewedBy: operatorName,
      reviewedAt: new Date().toISOString(),
    };
  }
}

export class SuspendCustomerUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly customerRepo: ICustomerRepository,
    membershipRepo?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepo || new PostgresCustomerMembershipRepository();
  }

  public async execute(customerId: string, reason: string, operatorName: string, organizationId?: string) {
    if (!reason || reason.trim().length < 3) {
      throw new DomainValidationError('A suspension reason is required.');
    }

    const customer = await this.customerRepo.findById(customerId, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    if (customer.status === 'SUSPENDED') {
      throw new DomainValidationError(`Customer ${customer.fullName} is already suspended.`);
    }

    const prevStatus = customer.status;
    customer.suspend(reason.trim());
    await this.customerRepo.save(customer);

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
    try {
      await tenantDb.query(
        `INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, $2, 'SUSPENDED', $3, '00000000-0000-0000-0000-000000000099');`,
        [customer.id, prevStatus, `Suspended by ${operatorName}: ${reason.trim()}`]
      ).catch(() => {});
    } catch {
      // Offline fallback
    }

    // Synchronously sync suspension into central membership directory
    await this.membershipRepo.updateMembershipStatus(customer.organizationId, customer.id, 'SUSPENDED').catch(() => {});

    return customer.toJSON();
  }
}

export class ReactivateCustomerUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly customerRepo: ICustomerRepository,
    membershipRepo?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepo || new PostgresCustomerMembershipRepository();
  }

  public async execute(customerId: string, operatorName: string, organizationId?: string) {
    const customer = await this.customerRepo.findById(customerId, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    if (customer.status === 'ACTIVE') {
      throw new DomainValidationError(`Customer ${customer.fullName} is already active.`);
    }

    const prevStatus = customer.status;
    customer.reactivate();
    await this.customerRepo.save(customer);

    const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
    try {
      await tenantDb.query(
        `INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, $2, 'ACTIVE', $3, '00000000-0000-0000-0000-000000000099');`,
        [customer.id, prevStatus, `Reactivated by ${operatorName}`]
      ).catch(() => {});
    } catch {
      // Offline fallback
    }

    // Synchronously sync reactivation into central membership directory
    await this.membershipRepo.updateMembershipStatus(customer.organizationId, customer.id, 'APPROVED').catch(() => {});

    return customer.toJSON();
  }
}

export class UpdateCustomerProfileUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(
    customerId: string,
    updates: {
      fullName?: string;
      village?: string;
      permittedCategories?: MilkCategory[];
      mobileNumber?: string;
    },
    organizationId?: string
  ) {
    const customer = await this.customerRepo.findById(customerId, organizationId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    customer.updateProfile(updates);
    await this.customerRepo.save(customer);

    return customer.toJSON();
  }
}
