import { ILedgerRepository } from '../../ports/index.js';
import { CustomerNotFoundError } from '../../../domain/errors/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';

export class GetCustomerKhataSummaryUseCase {
  constructor(private readonly ledgerRepo: ILedgerRepository) {}

  public async execute(customerId: string) {
    const account = await this.ledgerRepo.findByCustomer(customerId);
    if (!account) {
      throw new CustomerNotFoundError(customerId);
    }
    return account.toKhataSummary();
  }
}

export class GetCustomerLedgerEntriesUseCase {
  constructor(private readonly ledgerRepo: ILedgerRepository) {}

  public async execute(customerId: string, limit = 50, offset = 0) {
    const entries = await this.ledgerRepo.listEntries(customerId, limit, offset);
    return entries;
  }
}

export class GetCustomerBillsUseCase {
  public async execute(customerId: string, limit = 12) {
    const sql = `
      SELECT 
        mb.id,
        mb.bill_number,
        mb.billing_period_start,
        mb.billing_period_end,
        mb.total_liters,
        mb.gross_amount,
        mb.deductions_amount,
        mb.net_payable_amount,
        mb.status,
        mb.paid_at
      FROM monthly_bills mb
      WHERE mb.customer_id = $1
      ORDER BY mb.billing_period_end DESC
      LIMIT $2;
    `;
    const result = await db.query(sql, [customerId, limit]);

    return result.rows.map((row: any) => ({
      id: row.id,
      billNumber: row.bill_number,
      periodStart: row.billing_period_start instanceof Date
        ? row.billing_period_start.toISOString().split('T')[0]
        : String(row.billing_period_start),
      periodEnd: row.billing_period_end instanceof Date
        ? row.billing_period_end.toISOString().split('T')[0]
        : String(row.billing_period_end),
      totalLiters: Number(row.total_liters),
      grossAmount: Number(row.gross_amount),
      deductionsAmount: Number(row.deductions_amount),
      netPayableAmount: Number(row.net_payable_amount),
      status: row.status,
      paidAt: row.paid_at?.toISOString?.() || row.paid_at,
    }));
  }
}
