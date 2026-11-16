import { CustomerLedgerAccount } from '../../domain/entities/CustomerLedgerAccount.js';
import { db } from '../database/PostgresPool.js';
export class PostgresLedgerRepository {
    async findByCustomer(customerId) {
        const accountSql = `
      SELECT 
        cla.id,
        cla.customer_id,
        cla.organization_id,
        cla.current_balance,
        cla.updated_at,
        COALESCE(SUM(CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE 0 END), 0.00) AS total_milk_earnings,
        COALESCE(SUM(CASE WHEN lt.direction = 'DEBIT' THEN lt.amount ELSE 0 END), 0.00) AS total_deductions
      FROM customer_ledger_accounts cla
      LEFT JOIN ledger_transactions lt ON lt.customer_id = cla.customer_id
      WHERE cla.customer_id = $1
      GROUP BY cla.id, cla.customer_id, cla.organization_id, cla.current_balance, cla.updated_at;
    `;
        const result = await db.query(accountSql, [customerId]);
        if (result.rows.length === 0) {
            // Check if customer exists to get org id and create initial account
            const custRes = await db.query(`SELECT organization_id FROM customers WHERE id = $1 LIMIT 1`, [customerId]);
            if (custRes.rows.length === 0)
                return null;
            const orgId = custRes.rows[0].organization_id;
            const insertRes = await db.query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
         VALUES ($1, $2, 'INR', 0.00)
         ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
         RETURNING id, current_balance, updated_at`, [customerId, orgId]);
            const row = insertRes.rows[0];
            return new CustomerLedgerAccount({
                id: row.id,
                customerId,
                organizationId: orgId,
                currentBalance: Number(row.current_balance || 0),
                totalMilkEarnings: 0.0,
                totalDeductions: 0.0,
                lastUpdated: row.updated_at?.toISOString?.() || new Date().toISOString(),
            });
        }
        const row = result.rows[0];
        const props = {
            id: row.id,
            customerId: row.customer_id,
            organizationId: row.organization_id,
            currentBalance: Number(row.current_balance || 0),
            totalMilkEarnings: Number(row.total_milk_earnings || 0),
            totalDeductions: Number(row.total_deductions || 0),
            lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
        };
        return new CustomerLedgerAccount(props);
    }
    async save(account, newEntry) {
        await db.withTransaction(async (client) => {
            // 1. Update customer_ledger_accounts
            await client.query(`UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE customer_id = $2`, [account.currentBalance, account.customerId]);
            // 2. If new ledger entry provided, insert journal transaction
            if (newEntry) {
                const direction = newEntry.creditAmount > 0 ? 'CREDIT' : 'DEBIT';
                const amount = newEntry.creditAmount > 0 ? newEntry.creditAmount : newEntry.debitAmount;
                const txnType = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION_CREDIT' : 'FEED_PURCHASE_DEBIT';
                const refEntity = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE';
                const refId = newEntry.referenceId || account.id;
                const insertTxnSql = `
          INSERT INTO ledger_transactions (
            id, organization_id, center_id, customer_id, transaction_type,
            direction, amount, balance_after, reference_entity, reference_id,
            description, idempotency_key, created_by, created_at
          ) VALUES (
            $1, $2,
            (SELECT primary_center_id FROM customers WHERE id = $3 LIMIT 1),
            $3, $4, $5, $6, $7, $8, $9, $10, $11,
            (SELECT id FROM users WHERE user_role IN ('COLLECTION_OPERATOR', 'DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1),
            NOW()
          )
          ON CONFLICT (idempotency_key) DO NOTHING;
        `;
                await client.query(insertTxnSql, [
                    newEntry.id,
                    account.props.organizationId,
                    account.customerId,
                    txnType,
                    direction,
                    amount,
                    newEntry.runningBalance,
                    refEntity,
                    refId,
                    newEntry.description,
                    `LEDGER-${newEntry.id}`,
                ]);
            }
        });
    }
    async listEntries(customerId, limit = 50, offset = 0) {
        const sql = `
      SELECT 
        id,
        created_at,
        transaction_type,
        direction,
        amount,
        balance_after,
        description,
        reference_id
      FROM ledger_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
        const result = await db.query(sql, [customerId, limit, offset]);
        return result.rows.map((row) => {
            const isCredit = row.direction === 'CREDIT';
            return {
                id: row.id,
                transactionDate: row.created_at?.toISOString?.() || String(row.created_at),
                type: isCredit ? 'MILK_CREDIT' : 'FEED_DEBIT',
                description: row.description || (isCredit ? 'Milk Collection Credit' : 'Deduction Debit'),
                creditAmount: isCredit ? Number(row.amount) : 0.0,
                debitAmount: !isCredit ? Number(row.amount) : 0.0,
                runningBalance: Number(row.balance_after),
                referenceId: row.reference_id,
            };
        });
    }
}
//# sourceMappingURL=PostgresLedgerRepository.js.map