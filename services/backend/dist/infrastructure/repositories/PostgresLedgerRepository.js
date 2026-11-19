import crypto from 'node:crypto';
import { CustomerLedgerAccount } from '../../domain/entities/CustomerLedgerAccount.js';
import { db } from '../database/PostgresPool.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';
export class PostgresLedgerRepository {
    async getDb(organizationId) {
        if (organizationId) {
            return tenantDbManager.getTenantDb(organizationId);
        }
        return db;
    }
    async appendEntry(params) {
        const account = await this.findByCustomer(params.customerId);
        if (!account)
            return;
        const entryId = crypto.randomUUID();
        const isCredit = params.entryType === 'CREDIT';
        const newBal = isCredit ? account.currentBalance + params.amount : account.currentBalance - params.amount;
        account.props.currentBalance = newBal;
        await this.save(account, {
            id: entryId,
            transactionDate: new Date().toISOString(),
            type: isCredit ? 'MILK_CREDIT' : 'FEED_DEBIT',
            description: params.description,
            creditAmount: isCredit ? params.amount : 0,
            debitAmount: !isCredit ? params.amount : 0,
            runningBalance: newBal,
            referenceId: params.referenceId,
        });
    }
    async findByCustomer(customerId, organizationId) {
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
        // 1. Try specified organizationId first
        if (organizationId) {
            try {
                const client = await this.getDb(organizationId);
                const result = await client.query(accountSql, [customerId]);
                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    return new CustomerLedgerAccount({
                        id: row.id,
                        customerId: row.customer_id,
                        organizationId: row.organization_id,
                        currentBalance: Number(row.current_balance || 0),
                        totalMilkEarnings: Number(row.total_milk_earnings || 0),
                        totalDeductions: Number(row.total_deductions || 0),
                        lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
                    });
                }
            }
            catch { }
        }
        // 2. Check control plane / primary database
        try {
            const result = await db.query(accountSql, [customerId]);
            if (result.rows.length > 0) {
                const row = result.rows[0];
                return new CustomerLedgerAccount({
                    id: row.id,
                    customerId: row.customer_id,
                    organizationId: row.organization_id,
                    currentBalance: Number(row.current_balance || 0),
                    totalMilkEarnings: Number(row.total_milk_earnings || 0),
                    totalDeductions: Number(row.total_deductions || 0),
                    lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
                });
            }
        }
        catch { }
        // 3. Search all tenant databases
        for (const tenantDb of tenantDbManager.getAllTenantDbs()) {
            try {
                const result = await tenantDb.query(accountSql, [customerId]);
                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    return new CustomerLedgerAccount({
                        id: row.id,
                        customerId: row.customer_id,
                        organizationId: row.organization_id,
                        currentBalance: Number(row.current_balance || 0),
                        totalMilkEarnings: Number(row.total_milk_earnings || 0),
                        totalDeductions: Number(row.total_deductions || 0),
                        lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
                    });
                }
                // Check if customer exists in this tenant to initialize account
                const custRes = await tenantDb.query(`SELECT organization_id FROM customers WHERE id = $1 LIMIT 1`, [customerId]);
                if (custRes.rows.length > 0) {
                    const orgId = custRes.rows[0].organization_id;
                    const insertRes = await tenantDb.query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
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
            }
            catch { }
        }
        return null;
    }
    async save(account, newEntry) {
        const orgId = account.props.organizationId || account.organizationId;
        const client = await this.getDb(orgId);
        await client.withTransaction(async (txClient) => {
            // 1. Update customer_ledger_accounts
            await txClient.query(`UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE customer_id = $2`, [account.currentBalance, account.customerId]);
            // 2. If new ledger entry provided, insert journal transaction
            if (newEntry) {
                const direction = newEntry.creditAmount > 0 ? 'CREDIT' : 'DEBIT';
                const amount = newEntry.creditAmount > 0 ? newEntry.creditAmount : newEntry.debitAmount;
                const txnType = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION_CREDIT' : 'FEED_PURCHASE_DEBIT';
                const refEntity = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE';
                const refId = newEntry.referenceId || account.id;
                const custCenterRes = await txClient.query(`SELECT primary_center_id FROM customers WHERE id = $1 LIMIT 1`, [account.customerId]);
                const centerId = custCenterRes.rows[0]?.primary_center_id || '00000000-0000-0000-0000-000000000002';
                const userRes = await txClient.query(`SELECT id FROM users WHERE role IN ('COLLECTION_OPERATOR', 'DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1`);
                const createdBy = userRes.rows[0]?.id || '00000000-0000-0000-0000-000000000003';
                const insertTxnSql = `
          INSERT INTO ledger_transactions (
            id, organization_id, center_id, customer_id, transaction_type,
            direction, amount, balance_after, reference_entity, reference_id,
            description, idempotency_key, created_by, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, NOW()
          )
          ON CONFLICT (idempotency_key) DO NOTHING;
        `;
                await txClient.query(insertTxnSql, [
                    newEntry.id,
                    orgId,
                    centerId,
                    account.customerId,
                    txnType,
                    direction,
                    amount,
                    newEntry.runningBalance,
                    refEntity,
                    refId,
                    newEntry.description,
                    `LEDGER-${newEntry.id}`,
                    createdBy,
                ]);
            }
        });
        // Also update control plane DB if reachable
        try {
            await db.query(`UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE customer_id = $2`, [account.currentBalance, account.customerId]);
        }
        catch { }
    }
    async listEntries(customerId, limit = 50, offset = 0, organizationId) {
        const sql = `
      SELECT 
        id,
        created_at,
        transaction_type,
        direction,
        amount,
        balance_after,
        reference_entity,
        description,
        reference_id
      FROM ledger_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
        const mapRow = (row) => ({
            id: row.id,
            transactionDate: row.created_at?.toISOString?.() || String(row.created_at),
            type: (row.direction === 'CREDIT' ? 'MILK_CREDIT' : 'FEED_DEBIT'),
            entryType: (row.direction === 'CREDIT' ? 'MILK_CREDIT' : 'DEBIT'),
            direction: row.direction,
            referenceType: row.reference_entity === 'FEED_SALE' ? 'FEED_PURCHASE' : row.reference_entity,
            amount: Number(row.amount),
            description: row.description || (row.direction === 'CREDIT' ? 'Milk Collection Credit' : 'Deduction Debit'),
            source: row.reference_entity || (row.direction === 'CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE'),
            sourceModule: row.reference_entity || (row.direction === 'CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE'),
            creditAmount: row.direction === 'CREDIT' ? Number(row.amount) : 0.0,
            debitAmount: row.direction === 'DEBIT' ? Number(row.amount) : 0.0,
            runningBalance: Number(row.balance_after),
            referenceId: row.reference_id,
        });
        if (organizationId) {
            try {
                const client = await this.getDb(organizationId);
                const result = await client.query(sql, [customerId, limit, offset]);
                if (result.rows.length > 0) {
                    return result.rows.map(mapRow);
                }
            }
            catch { }
        }
        for (const tenantDb of tenantDbManager.getAllTenantDbs()) {
            try {
                const result = await tenantDb.query(sql, [customerId, limit, offset]);
                if (result.rows.length > 0) {
                    return result.rows.map(mapRow);
                }
            }
            catch { }
        }
        try {
            const result = await db.query(sql, [customerId, limit, offset]);
            return result.rows.map(mapRow);
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=PostgresLedgerRepository.js.map