import crypto from 'node:crypto';
import { MilkCollectionTransaction } from '../../../domain/entities/MilkCollectionTransaction.js';
import { DomainValidationError, CustomerNotFoundError, SessionClosedError, } from '../../../domain/errors/index.js';
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
        // 1. Idempotency Check
        const idempotencyKey = dto.idempotencyKey ||
            `IDEM-${dto.customerId}-${dto.sessionId || dto.sessionCode}-${dto.weightLiters}-${dto.fatPercentage}`;
        const existingTxn = await this.transactionRepo.findByIdempotencyKey(idempotencyKey);
        if (existingTxn) {
            const ledger = await this.ledgerRepo.findByCustomer(existingTxn.customerId);
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
        const customer = await this.customerRepo.findById(dto.customerId, dto.organizationId);
        if (!customer) {
            throw new CustomerNotFoundError(dto.customerId);
        }
        customer.validateCanDeliver(dto.milkCategory);
        // 4. Verify Active Session
        const orgId = dto.organizationId || customer.organizationId;
        let session = dto.sessionCode
            ? await this.sessionRepo.findByCode(dto.sessionCode, orgId)
            : null;
        if (!session && dto.sessionId) {
            // Find active session for customer's center
            session = await this.sessionRepo.findActiveSession(customer.centerId, dto.deviceId || 'KIOSK_MAIN', orgId);
        }
        if (!session || !session.isOpen) {
            throw new SessionClosedError(dto.sessionCode || dto.sessionId || 'Unknown');
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
        // 7. Atomic DB Persistence
        await this.transactionRepo.save(transaction);
        // 8. Update Session Cumulative Totals
        session.recordTransaction(dto.milkCategory, dto.weightLiters, dto.fatPercentage, dto.snfPercentage, totalAmount);
        await this.sessionRepo.save(session);
        // 9. Post Double-Entry Ledger Credit
        let ledger = await this.ledgerRepo.findByCustomer(customer.id);
        if (!ledger) {
            throw new DomainValidationError(`Customer financial ledger could not be initialized.`);
        }
        const ledgerEntry = ledger.postCredit(totalAmount, `Milk Intake Credit (${dto.milkCategory} ${dto.weightLiters}L @ ₹${appliedRate}/L)`, transaction.id);
        await this.ledgerRepo.save(ledger, ledgerEntry);
        return {
            transaction,
            receiptNumber: `RCP-${transactionId.substring(0, 8).toUpperCase()}`,
            customerBalanceAfter: ledger.currentBalance,
            isIdempotentReplay: false,
        };
    }
}
export class GetCustomerCollectionHistoryUseCase {
    transactionRepo;
    constructor(transactionRepo) {
        this.transactionRepo = transactionRepo;
    }
    async execute(customerId, limit = 50, offset = 0, organizationId) {
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
        const my = monthYear || new Date().toISOString().substring(0, 7); // YYYY-MM
        return this.transactionRepo.getMonthlySummary(customerId, my, organizationId);
    }
}
//# sourceMappingURL=MilkIntakeUseCases.js.map