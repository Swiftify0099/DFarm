import crypto from 'node:crypto';
import {
  ICustomerRepository,
  IShiftSessionRepository,
  ICollectionTransactionRepository,
  IRateChartRepository,
  ILedgerRepository,
} from '../../ports/index.js';
import { MilkCollectionTransaction, IdentificationMethod } from '../../../domain/entities/MilkCollectionTransaction.js';
import { MilkCategory } from '../../../domain/entities/Customer.js';
import {
  DomainValidationError,
  CustomerNotFoundError,
  SessionClosedError,
} from '../../../domain/errors/index.js';
import { FatPercentage, SnfPercentage, MilkWeight } from '../../../domain/value-objects/index.js';
import { financialPolicyResolutionService } from '../../../domain/services/FinancialPolicyResolutionService.js';

export interface ProcessMilkIntakeDTO {
  sessionId?: string;
  sessionCode?: string;
  customerId: string;
  organizationId?: string;
  milkCategory: MilkCategory;
  weightLiters: number;
  fatPercentage: number;
  snfPercentage: number;
  clrDensity?: number;
  identificationMethod: IdentificationMethod;
  deviceId?: string;
  operatorId: string;
  operatorName: string;
  idempotencyKey?: string;
}

export class ProcessMilkIntakeUseCase {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly sessionRepo: IShiftSessionRepository,
    private readonly transactionRepo: ICollectionTransactionRepository,
    private readonly rateChartRepo: IRateChartRepository,
    private readonly ledgerRepo: ILedgerRepository
  ) {}

  public async execute(dto: ProcessMilkIntakeDTO): Promise<{
    transaction: MilkCollectionTransaction;
    receiptNumber: string;
    customerBalanceAfter: number;
    isIdempotentReplay: boolean;
  }> {
    // 1. Idempotency Check
    const idempotencyKey =
      dto.idempotencyKey ||
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
    let session = dto.sessionId
      ? await this.sessionRepo.findById(dto.sessionId, orgId)
      : null;

    if (!session && dto.sessionCode) {
      session = await this.sessionRepo.findByCode(dto.sessionCode, orgId);
    }

    // If the referenced session is closed or missing, check if an active OPEN session exists for this center/device
    if ((!session || !session.isOpen) && (dto.sessionId || customer.centerId)) {
      const activeOpen = await this.sessionRepo.findActiveSession(customer.centerId, dto.deviceId || 'KIOSK_MAIN', orgId);
      if (activeOpen && activeOpen.isOpen) {
        session = activeOpen;
      }
    }

    if (!session || !session.isOpen) {
      throw new SessionClosedError(dto.sessionCode || dto.sessionId || 'Unknown');
    }

    // 5. Authoritative Rate & Amount Calculation
    const rateChart = await this.rateChartRepo.getActiveRateChart(
      customer.centerId,
      customer.organizationId,
      dto.milkCategory,
      session.businessDate
    );

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
    session.recordTransaction(
      dto.milkCategory,
      dto.weightLiters,
      dto.fatPercentage,
      dto.snfPercentage,
      totalAmount
    );
    await this.sessionRepo.save(session);

    // 9. Post Double-Entry Ledger Credit
    let ledger = await this.ledgerRepo.findByCustomer(customer.id, customer.organizationId);
    if (!ledger) {
      throw new DomainValidationError(`Customer financial ledger could not be initialized.`);
    }

    const ledgerEntry = ledger.postCredit(
      totalAmount,
      `Milk Intake Credit (${dto.milkCategory} ${dto.weightLiters}L @ ₹${appliedRate}/L)`,
      transaction.id
    );
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
  constructor(private readonly transactionRepo: ICollectionTransactionRepository) {}

  public async execute(customerId: string, limit = 50, offset = 0, organizationId?: string) {
    const records = await this.transactionRepo.listByCustomer(customerId, limit, offset, organizationId);
    return records.map((r) => r.toJSON());
  }
}

export class GetMonthlyMilkSummaryUseCase {
  constructor(private readonly transactionRepo: ICollectionTransactionRepository) {}

  public async execute(customerId: string, monthYear?: string, organizationId?: string) {
    const my = monthYear || new Date().toISOString().substring(0, 7); // YYYY-MM
    return this.transactionRepo.getMonthlySummary(customerId, my, organizationId);
  }
}
