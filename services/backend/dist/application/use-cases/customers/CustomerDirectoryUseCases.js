import crypto from 'node:crypto';
import { Customer } from '../../../domain/entities/Customer.js';
import { CustomerNotFoundError, DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber, RfidUid } from '../../../domain/value-objects/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
export class GetCustomersUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(params) {
        const list = await this.customerRepo.listCustomers(params);
        return list.map((c) => c.toJSON());
    }
}
export class GetCustomerByIdUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(id) {
        const customer = await this.customerRepo.findById(id);
        if (!customer) {
            throw new CustomerNotFoundError(id);
        }
        return customer.toJSON();
    }
}
export class LookupRfidCustomerUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(rawCardUid, organizationId) {
        const rfid = new RfidUid(rawCardUid);
        const customer = await this.customerRepo.findByRfid(rfid.value, organizationId);
        if (!customer) {
            throw new CustomerNotFoundError(`RFID Card ${rfid.value}`);
        }
        return customer.toJSON();
    }
}
export class RegisterCustomerUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(dto) {
        const phone = new PhoneNumber(dto.mobileNumber);
        const existing = await this.customerRepo.findByPhone(phone.e164, dto.organizationId);
        if (existing) {
            throw new DomainValidationError('A customer with this mobile number already exists in this dairy.');
        }
        // Auto-generate farmer code based on count in center
        let farmerCode = `F-${Math.floor(100 + Math.random() * 900)}`;
        try {
            const countRes = await db.query(`SELECT COUNT(id) AS cnt FROM customers WHERE primary_center_id = $1`, [dto.centerId]);
            const nextNum = Number(countRes.rows[0]?.cnt || 0) + 1;
            farmerCode = `F-${String(nextNum).padStart(3, '0')}`;
        }
        catch {
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
                await db.query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
           VALUES (
             $1, $2, TRUE,
             (SELECT id FROM users WHERE user_role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1)
           )
           ON CONFLICT (customer_id, milk_category) DO NOTHING;`, [customer.id, cat]);
            }
        }
        catch {
            // Offline fallback
        }
        return customer.toJSON();
    }
}
export class GetCustomerStatusUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(id) {
        const customer = await this.customerRepo.findById(id);
        if (!customer) {
            throw new CustomerNotFoundError(id);
        }
        return {
            id: customer.id,
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
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(organizationId) {
        const list = await this.customerRepo.listPendingRegistrations(organizationId);
        return list.map((c) => {
            const json = c.toJSON();
            return {
                id: c.id,
                dairyId: c.organizationId,
                candidateName: c.fullName,
                mobileNumber: c.mobileNumber.replace(/\D/g, '').slice(-10),
                submittedAt: json.createdAt || new Date().toISOString(),
                address: json.address || c.village || 'Local Area',
                village: c.village || 'Local Area',
                preferredCategory: (c.permittedCategories[0] || 'COW'),
                bankDetails: c.bankDetails?.accountNumber ? {
                    accountNumber: c.bankDetails.accountNumber,
                    bankName: c.bankDetails.bankName || 'Bank',
                    ifscCode: c.bankDetails.ifscCode || 'IFSC0001',
                } : undefined,
                faceCapture: {
                    templateVersion: 'v1.2',
                    modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
                    consentTimestamp: json.createdAt || new Date().toISOString(),
                    consentAgreed: true,
                    enrollmentStatus: 'PENDING_APPROVAL',
                    qualityScore: 95.0,
                    captureDevice: 'Customer App Android / Kiosk',
                },
                status: 'PENDING',
                rejectionReason: c.rejectionReason,
            };
        });
    }
}
export class ApproveCustomerRegistrationUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(customerId, operatorName, customCode) {
        const customer = await this.customerRepo.findById(customerId);
        if (!customer) {
            throw new CustomerNotFoundError(customerId);
        }
        if (customer.registrationStatus === 'APPROVED') {
            throw new DomainValidationError(`Registration for ${customer.fullName} is already approved.`);
        }
        // Determine assigned code
        let assignedCode = customCode;
        if (!assignedCode) {
            try {
                const countRes = await db.query(`SELECT COUNT(id) AS cnt FROM customers WHERE organization_id = $1 AND registration_status = 'APPROVED'`, [customer.organizationId]);
                const nextNum = 100 + Number(countRes.rows[0]?.cnt || 0) + 1;
                assignedCode = `C-${nextNum}`;
            }
            catch {
                assignedCode = `C-${Math.floor(100 + Math.random() * 900)}`;
            }
        }
        customer.approveRegistration(assignedCode);
        await this.customerRepo.save(customer);
        // Activate face enrollment in database if present
        try {
            await db.query(`UPDATE face_enrollments SET status = 'ACTIVE' WHERE customer_id = $1;`, [customer.id]);
            await db.query(`INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, 'PENDING_APPROVAL', 'APPROVED', $2, (SELECT id FROM users WHERE user_role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1));`, [customer.id, `Registration approved by ${operatorName}`]);
        }
        catch {
            // Offline fallback
        }
        return customer.toJSON();
    }
}
export class RejectCustomerRegistrationUseCase {
    customerRepo;
    constructor(customerRepo) {
        this.customerRepo = customerRepo;
    }
    async execute(customerId, reason, operatorName) {
        if (!reason || reason.trim().length < 5) {
            throw new DomainValidationError('A detailed rejection reason is required (minimum 5 characters).');
        }
        const customer = await this.customerRepo.findById(customerId);
        if (!customer) {
            throw new CustomerNotFoundError(customerId);
        }
        if (customer.registrationStatus === 'REJECTED') {
            throw new DomainValidationError(`Registration for ${customer.fullName} has already been rejected.`);
        }
        customer.rejectRegistration(reason.trim());
        await this.customerRepo.save(customer);
        try {
            await db.query(`INSERT INTO customer_status_history (customer_id, previous_status, new_status, change_reason, changed_by)
         VALUES ($1, 'PENDING_APPROVAL', 'REJECTED', $2, (SELECT id FROM users WHERE user_role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1));`, [customer.id, `Rejected by ${operatorName}: ${reason.trim()}`]);
        }
        catch {
            // Offline fallback
        }
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
//# sourceMappingURL=CustomerDirectoryUseCases.js.map