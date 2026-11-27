import { ILedgerRepository } from '../../ports/index.js';
import { CustomerNotFoundError, DomainValidationError } from '../../../domain/errors/index.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';

export class GetCustomerKhataSummaryUseCase {
  constructor(private readonly ledgerRepo: ILedgerRepository) {}

  public async execute(customerId: string, organizationId?: string) {
    if (!organizationId || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is required for customer ledger summary.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const account = await this.ledgerRepo.findByCustomer(customerId, organizationId);
    if (!account) {
      throw new CustomerNotFoundError(customerId);
    }
    return account.toKhataSummary();
  }
}

export class GetCustomerLedgerEntriesUseCase {
  constructor(private readonly ledgerRepo: ILedgerRepository) {}

  public async execute(customerId: string, limit = 50, offset = 0, organizationId?: string) {
    if (!organizationId || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is required for customer ledger entries.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const entries = await this.ledgerRepo.listEntries(customerId, limit, offset, organizationId);
    return entries;
  }
}

export class GetCustomerBillsUseCase {
  public async execute(customerId: string, limit = 12, organizationId?: string) {
    if (!organizationId || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is required for customer bills lookup.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const cleanOrgId = organizationId.trim();
    const sql = `
      SELECT 
        mb.id,
        mb.bill_number,
        COALESCE(bp.start_date, mb.created_at) as billing_period_start,
        COALESCE(bp.end_date, mb.created_at) as billing_period_end,
        mb.total_milk_weight as total_liters,
        mb.gross_milk_amount as gross_amount,
        mb.total_debits as deductions_amount,
        mb.net_payable_amount,
        mb.bill_status as status,
        mb.approved_at as paid_at
      FROM monthly_bills mb
      LEFT JOIN billing_periods bp ON bp.id = mb.billing_period_id
      JOIN customers c ON c.id = mb.customer_id
      WHERE (mb.customer_id = $1 OR c.global_customer_id = $1)
        AND mb.organization_id = $3
        AND c.organization_id = $3
      ORDER BY mb.created_at DESC
      LIMIT $2;
    `;
    const client = await tenantDbManager.getStrictTenantDb(cleanOrgId);
    const result = await client.query(sql, [customerId, limit, cleanOrgId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      billId: row.id,
      billNumber: row.bill_number,
      cycleStartDate: row.billing_period_start instanceof Date
        ? row.billing_period_start.toISOString().split('T')[0]
        : String(row.billing_period_start),
      cycleEndDate: row.billing_period_end instanceof Date
        ? row.billing_period_end.toISOString().split('T')[0]
        : String(row.billing_period_end),
      periodStart: row.billing_period_start instanceof Date
        ? row.billing_period_start.toISOString().split('T')[0]
        : String(row.billing_period_start),
      periodEnd: row.billing_period_end instanceof Date
        ? row.billing_period_end.toISOString().split('T')[0]
        : String(row.billing_period_end),
      cycleLabel: `Billing Period (${row.bill_number})`,
      totalLiters: Number(row.total_liters),
      grossAmount: Number(row.gross_amount),
      grossMilkAmount: Number(row.gross_amount),
      deductionsAmount: Number(row.deductions_amount),
      feedDeductions: Number(row.deductions_amount),
      otherDeductions: 0,
      netPayableAmount: Number(row.net_payable_amount),
      status: row.status === 'PAID' ? 'DISBURSED' : (row.status || 'PENDING'),
      paidAt: row.paid_at?.toISOString?.() || row.paid_at,
      disbursedDate: row.paid_at ? new Date(row.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
    }));
  }
}
