import crypto from 'node:crypto';
import { MilkCollectionTransaction } from '../../../domain/entities/MilkCollectionTransaction.js';
import { CustomerNotFoundError, SessionClosedError, DomainValidationError, ForbiddenTenantError, } from '../../../domain/errors/index.js';
import { FatPercentage, SnfPercentage, MilkWeight } from '../../../domain/value-objects/index.js';
import { financialPolicyResolutionService } from '../../../domain/services/FinancialPolicyResolutionService.js';
export class ProcessMilkIntakeUseCase {
    customerRepo;
    sessionRepo;
    transactionRepo;
    rateChartRepo;
    ledgerRepo;
    constructor(customerRepo, sessionRepo, transactionRepo, rateChartRepo, ledgerRepo) {
        this.customerRepo = customerRepo;
        this.sessionRepo = sessionRepo;
        this.transactionRepo = transactionRepo;
        this.rateChartRepo = rateChartRepo;
        this.ledgerRepo = ledgerRepo;
    }
    async execute(dto) {
        if (!dto.organizationId || !dto.organizationId.trim()) {
            throw new DomainValidationError('Authenticated organization ID is required for collection processing');
        }
        const orgId = dto.organizationId.trim();
        // 1. Idempotency Check with Tenant Scoping
        const idempotencyKey = dto.idempotencyKey ||
            `IDEM-${dto.customerId}-${dto.sessionId || dto.sessionCode}-${dto.weightLiters}-${dto.fatPercentage}`;
        const existingTxn = await this.transactionRepo.findByIdempotencyKey(idempotencyKey, orgId);
        if (existingTxn) {
            const ledger = await this.ledgerRepo.findByCustomer(existingTxn.customerId, orgId);
            return {
                transaction: existingTxn,
                receiptNumber: `RCP-${existingTxn.id.substring(0, 8).toUpperCase()}`,
                customerBalanceAfter: ledger?.currentBalance || 0.0,
                isIdempotentReplay: true,
            };
        }
        // 2. Validate Domain Value Objects
        new MilkWeight(dto.weightLiters);
        new FatPercentage(dto.fatPercentage, dto.milkCategory);
        new SnfPercentage(dto.snfPercentage, dto.milkCategory);
        // 3. Verify Customer & Permissions
        const customer = await this.customerRepo.findById(dto.customerId, orgId);
        if (!customer) {
            throw new CustomerNotFoundError(dto.customerId);
        }
        if (customer.organizationId.toLowerCase() !== orgId.toLowerCase()) {
            throw new ForbiddenTenantError('Cross-dairy collection blocked: customer belongs to a different organization.');
        }
        customer.validateCanDeliver(dto.milkCategory);
        // 4. Verify Active Session
        const resolvedOrgId = orgId;
        let session = dto.sessionId
            ? await this.sessionRepo.findById(dto.sessionId, resolvedOrgId)
            : null;
        if (!session && dto.sessionCode) {
            session = await this.sessionRepo.findByCode(dto.sessionCode, resolvedOrgId);
        }
        // If no explicit session ID or code was provided, check if an active OPEN session exists for this center/device
        if (!session && !dto.sessionId && !dto.sessionCode && customer.centerId) {
            const activeOpen = await this.sessionRepo.findActiveSession(customer.centerId, dto.deviceId || 'KIOSK_MAIN', resolvedOrgId);
            if (activeOpen && activeOpen.isOpen) {
                session = activeOpen;
            }
        }
        if (!session || !session.isOpen) {
            throw new SessionClosedError(dto.sessionCode || dto.sessionId || 'Unknown');
        }
        if (session.organizationId.toLowerCase() !== resolvedOrgId.toLowerCase()) {
            throw new ForbiddenTenantError('Cross-dairy collection blocked: session belongs to a different organization.');
        }
        // 5. Authoritative Rate & Amount Calculation
        const rateChart = await this.rateChartRepo.getActiveRateChart(customer.centerId, customer.organizationId, dto.milkCategory, session.businessDate);
        const calculation = await financialPolicyResolutionService.calculateAuthoritativePrice({
            rateChart,
            milkCategory: dto.milkCategory,
            weightLiters: dto.weightLiters,
            fatPercentage: dto.fatPercentage,
            snfPercentage: dto.snfPercentage,
            businessDate: session.businessDate,
        });
        const appliedRate = calculation.ratePerLiter;
        const totalAmount = calculation.totalAmount;
        // 6. Instantiate MilkCollectionTransaction Entity
        const transactionId = crypto.randomUUID();
        const transactionCode = `TXN-${transactionId.substring(0, 8).toUpperCase()}`;
        const transaction = new MilkCollectionTransaction({
            id: transactionId,
            transactionCode,
            sessionId: session.id,
            dairyId: customer.organizationId,
            centerId: customer.centerId,
            customerId: customer.id,
            customerCode: customer.farmerCode,
            customerName: customer.fullName,
            timestamp: new Date().toISOString(),
            date: session.businessDate,
            shift: session.shift,
            milkCategory: dto.milkCategory,
            weightLiters: dto.weightLiters,
            fatPercentage: dto.fatPercentage,
            snfPercentage: dto.snfPercentage,
            clrDensity: dto.clrDensity || 28.0,
            appliedRatePerLiter: appliedRate,
            rateChartVersion: rateChart.version,
            totalAmount,
            identificationMethod: dto.identificationMethod,
            syncStatus: 'SYNCED_CLOUD',
            deviceId: dto.deviceId || session.deviceIdentifier,
            operatorName: dto.operatorName,
            idempotencyKey,
        });
        // 7. Atomic DB Persistence (Collection Insert + Session Tally + Farmer Ledger Credit in ONE Transaction)
        return await this.transactionRepo.saveAtomicIntake({
            transaction,
            session,
            totalAmount,
            weightLiters: dto.weightLiters,
            fatPercentage: dto.fatPercentage,
            snfPercentage: dto.snfPercentage,
            milkCategory: dto.milkCategory,
            customerId: customer.id,
            organizationId: resolvedOrgId,
            centerId: customer.centerId,
            operatorId: dto.operatorId,
            operatorName: dto.operatorName,
            appliedRate,
        });
    }
}
export class GetCustomerCollectionHistoryUseCase {
    transactionRepo;
    constructor(transactionRepo) {
        this.transactionRepo = transactionRepo;
    }
    async execute(customerId, limit = 50, offset = 0, organizationId) {
        if (!organizationId || !organizationId.trim()) {
            throw new DomainValidationError('Authenticated organization ID is required for collection history lookup.', 'MISSING_ORGANIZATION_ID');
        }
        const records = await this.transactionRepo.listByCustomer(customerId, limit, offset, organizationId);
        return records.map((r) => r.toJSON());
    }
}
export class GetMonthlyMilkSummaryUseCase {
    transactionRepo;
    constructor(transactionRepo) {
        this.transactionRepo = transactionRepo;
    }
    async execute(customerId, monthYear, organizationId) {
        if (!organizationId || !organizationId.trim()) {
            throw new DomainValidationError('Authenticated organization ID is required for monthly milk summary.', 'MISSING_ORGANIZATION_ID');
        }
        const my = monthYear || new Date().toISOString().substring(0, 7); // YYYY-MM
        return this.transactionRepo.getMonthlySummary(customerId, my, organizationId);
    }
}
//# sourceMappingURL=MilkIntakeUseCases.js.map