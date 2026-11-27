import crypto from 'node:crypto';
import { CustomerLedgerAccount } from '../../domain/entities/CustomerLedgerAccount.js';
import { CustomerNotFoundError, DomainValidationError, ForbiddenError, ForbiddenTenantError, } from '../../domain/errors/index.js';
import { tenantDbManager, TenantDatabaseUnavailableError, } from '../database/TenantDatabaseManager.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class PostgresLedgerRepository {
    assertValidOrganizationId(organizationId) {
        if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
            throw new DomainValidationError('Authenticated organization ID is strictly required for ledger operations.', 'MISSING_ORGANIZATION_ID');
        }
        const cleanOrgId = organizationId.trim();
        if (!UUID_REGEX.test(cleanOrgId)) {
            throw new DomainValidationError('Invalid organization ID format for ledger operation.', 'INVALID_ORGANIZATION_ID');
        }
        return cleanOrgId;
    }
    async getAuthorizedTenantDb(organizationId) {
        const orgId = this.assertValidOrganizationId(organizationId);
        const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
        return { orgId, tenantDb };
    }
    isConstraintOrDomainError(err) {
        const pgCode = err?.code;
        return (pgCode === '23505' ||
            pgCode === '23503' ||
            pgCode === '23514' ||
            pgCode === '22P02' ||
            err instanceof DomainValidationError ||
            err instanceof ForbiddenError ||
            err instanceof ForbiddenTenantError ||
            err instanceof CustomerNotFoundError);
    }
    async queryTenant(client, organizationId, sql, params) {
        try {
            return await client.query(sql, params);
        }
        catch (err) {
            if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
                throw err;
            }
            throw new TenantDatabaseUnavailableError(organizationId, 'QUERY_FAILED', 'Tenant ledger database query failed');
        }
    }
    async validateCustomerCenterAndOperator(txClient, params) {
        const { organizationId, customerId, operatorId } = params;
        if (!customerId || !UUID_REGEX.test(customerId)) {
            throw new DomainValidationError('Valid customer ID is required for ledger operations.', 'INVALID_CUSTOMER_ID');
        }
        // 1. Validate customer exists in selected tenant DB and belongs to organization
        const custRes = await this.queryTenant(txClient, organizationId, `SELECT id, organization_id, primary_center_id, is_deleted
       FROM customers
       WHERE id = $1
       LIMIT 1;`, [customerId]);
        if (custRes.rows.length === 0) {
            throw new CustomerNotFoundError(customerId);
        }
        const cust = custRes.rows[0];
        if (String(cust.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
            throw new ForbiddenTenantError(`Cross-tenant customer '${customerId}' does not belong to organization '${organizationId}'.`);
        }
        if (cust.is_deleted) {
            throw new DomainValidationError(`Customer '${customerId}' is deleted.`, 'CUSTOMER_DELETED');
        }
        // 2. Validate customer's center exists and belongs to organization (never fabricate default center)
        const centerId = cust.primary_center_id;
        if (!centerId || !UUID_REGEX.test(centerId)) {
            throw new DomainValidationError(`Customer '${customerId}' has no valid primary center in organization '${organizationId}'.`, 'INVALID_CENTER');
        }
        const centerRes = await this.queryTenant(txClient, organizationId, `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`, [centerId]);
        if (centerRes.rows.length === 0) {
            throw new DomainValidationError(`Center '${centerId}' does not exist in tenant database.`, 'INVALID_CENTER');
        }
        if (String(centerRes.rows[0].organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
            throw new ForbiddenTenantError(`Cross-tenant center '${centerId}' does not belong to organization '${organizationId}'.`);
        }
        // 3. Validate real authorized operator if writing a ledger journal entry (never pick random user or fabricate)
        if (operatorId !== undefined) {
            if (!operatorId || !UUID_REGEX.test(operatorId)) {
                throw new DomainValidationError('Valid authenticated operator ID is required for ledger transactions.', 'INVALID_OPERATOR');
            }
            const userRes = await this.queryTenant(txClient, organizationId, `SELECT id, organization_id, role, user_role, status
         FROM users
         WHERE id = $1
         LIMIT 1;`, [operatorId]);
            if (userRes.rows.length === 0) {
                throw new DomainValidationError(`Authoritative operator '${operatorId}' does not exist in tenant database.`, 'INVALID_OPERATOR');
            }
            const op = userRes.rows[0];
            const effRole = String(op.user_role || op.role || '').trim().toUpperCase();
            if (!effRole || effRole === 'FARMER_CUSTOMER' || effRole === 'GUEST_FARMER' || effRole === 'CUSTOMER') {
                throw new ForbiddenError(`User '${operatorId}' is not authorized to post ledger transactions.`, 'UNAUTHORIZED_OPERATOR');
            }
            if (String(op.status || '').toUpperCase() !== 'ACTIVE') {
                throw new ForbiddenError(`Operator '${operatorId}' is not ACTIVE.`, 'OPERATOR_INACTIVE');
            }
            if (effRole !== 'SUPER_ADMIN' &&
                effRole !== 'PLATFORM_OPERATOR' &&
                String(op.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
                throw new ForbiddenTenantError(`Cross-tenant operator '${operatorId}' does not belong to organization '${organizationId}'.`);
            }
        }
        return { customerId: cust.id, centerId, operatorId };
    }
    async appendEntry(params) {
        const { orgId, tenantDb } = await this.getAuthorizedTenantDb(params.organizationId);
        const amount = Number(params.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new DomainValidationError('Ledger entry amount must be a positive number.', 'INVALID_LEDGER_AMOUNT');
        }
        return await tenantDb.withTransaction(async (txClient) => {
            const { customerId, centerId, operatorId } = await this.validateCustomerCenterAndOperator(txClient, {
                organizationId: orgId,
                customerId: params.customerId,
                operatorId: params.operatorId,
            });
            const idempotencyKey = params.idempotencyKey || `LEDGER-${crypto.randomUUID()}`;
            const existingTxn = await this.queryTenant(txClient, orgId, `SELECT id, balance_after
         FROM ledger_transactions
         WHERE idempotency_key = $1 AND organization_id = $2
         LIMIT 1;`, [idempotencyKey, orgId]);
            if (existingTxn.rows.length > 0) {
                return {
                    ledgerTransactionId: existingTxn.rows[0].id,
                    balanceAfter: Number(existingTxn.rows[0].balance_after),
                    isIdempotentReplay: true,
                };
            }
            // Lock customer_ledger_accounts row FOR UPDATE to prevent concurrent lost updates
            const accRes = await this.queryTenant(txClient, orgId, `SELECT id, organization_id, current_balance
         FROM customer_ledger_accounts
         WHERE customer_id = $1
         FOR UPDATE;`, [customerId]);
            let accountId;
            let currentBalance = 0;
            if (accRes.rows.length > 0) {
                if (String(accRes.rows[0].organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
                    throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${customerId}'.`);
                }
                accountId = accRes.rows[0].id;
                currentBalance = Number(accRes.rows[0].current_balance || 0);
            }
            else {
                const createdAcc = await this.queryTenant(txClient, orgId, `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
           VALUES ($1, $2, 'INR', 0.00)
           ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
           WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
           RETURNING id, current_balance;`, [customerId, orgId]);
                if (createdAcc.rows.length === 0) {
                    throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${customerId}'.`);
                }
                accountId = createdAcc.rows[0].id;
                currentBalance = Number(createdAcc.rows[0].current_balance || 0);
            }
            const isCredit = params.entryType === 'CREDIT';
            const newBal = isCredit
                ? Math.round((currentBalance + amount + Number.EPSILON) * 100) / 100
                : Math.round((currentBalance - amount + Number.EPSILON) * 100) / 100;
            const entryId = crypto.randomUUID();
            const txnType = isCredit ? 'MILK_COLLECTION_CREDIT' : 'FEED_PURCHASE_DEBIT';
            const refEntity = isCredit ? 'MILK_COLLECTION' : 'FEED_SALE';
            const refId = params.referenceId && UUID_REGEX.test(params.referenceId) ? params.referenceId : accountId;
            const txnRes = await this.queryTenant(txClient, orgId, `INSERT INTO ledger_transactions (
          id, organization_id, center_id, customer_id, transaction_type,
          direction, amount, balance_after, reference_entity, reference_id,
          description, idempotency_key, created_by, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id;`, [
                entryId,
                orgId,
                centerId,
                customerId,
                txnType,
                params.entryType,
                amount,
                newBal,
                refEntity,
                refId,
                params.description,
                idempotencyKey,
                operatorId,
            ]);
            if (txnRes.rows.length === 0) {
                const recheck = await this.queryTenant(txClient, orgId, `SELECT id, balance_after FROM ledger_transactions WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1;`, [idempotencyKey, orgId]);
                if (recheck.rows.length === 0) {
                    throw new DomainValidationError('Idempotency key conflict across organizations.', 'IDEMPOTENCY_CONFLICT');
                }
                return {
                    ledgerTransactionId: recheck.rows[0].id,
                    balanceAfter: Number(recheck.rows[0].balance_after),
                    isIdempotentReplay: true,
                };
            }
            await this.queryTenant(txClient, orgId, `UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND organization_id = $3;`, [newBal, accountId, orgId]);
            const insertLineSql = `
        INSERT INTO ledger_entries (
          transaction_id, account_id, account_type, entry_type, amount
        ) VALUES ($1, $2, $3, $4, $5);
      `;
            if (isCredit) {
                await this.queryTenant(txClient, orgId, insertLineSql, [entryId, accountId, 'CUSTOMER_PAYABLE', 'CREDIT', amount]);
                await this.queryTenant(txClient, orgId, insertLineSql, [entryId, centerId, 'MILK_PURCHASE_EXPENSE', 'DEBIT', amount]);
            }
            else {
                await this.queryTenant(txClient, orgId, insertLineSql, [entryId, accountId, 'CUSTOMER_PAYABLE', 'DEBIT', amount]);
                await this.queryTenant(txClient, orgId, insertLineSql, [entryId, centerId, 'FEED_INVENTORY', 'CREDIT', amount]);
            }
            return {
                ledgerTransactionId: entryId,
                balanceAfter: newBal,
                isIdempotentReplay: false,
            };
        });
    }
    async findById(accountId, organizationId) {
        const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
        if (!accountId || !UUID_REGEX.test(accountId.trim())) {
            return null;
        }
        const sql = `
      SELECT 
        cla.id,
        cla.customer_id,
        cla.organization_id,
        cla.current_balance,
        cla.updated_at,
        COALESCE(SUM(CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE 0 END), 0.00) AS total_milk_earnings,
        COALESCE(SUM(CASE WHEN lt.direction = 'DEBIT' THEN lt.amount ELSE 0 END), 0.00) AS total_deductions
      FROM customer_ledger_accounts cla
      JOIN customers c ON c.id = cla.customer_id
      LEFT JOIN ledger_transactions lt ON lt.customer_id = cla.customer_id AND lt.organization_id = cla.organization_id
      WHERE cla.id = $1
        AND cla.organization_id = $2
        AND c.organization_id = $2
      GROUP BY cla.id, cla.customer_id, cla.organization_id, cla.current_balance, cla.updated_at;
    `;
        const result = await this.queryTenant(tenantDb, orgId, sql, [accountId.trim(), orgId]);
        if (result.rows.length === 0)
            return null;
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
    async findByCustomer(customerId, organizationId) {
        const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
        if (!customerId || !UUID_REGEX.test(customerId.trim())) {
            return null;
        }
        const cleanCustomerId = customerId.trim();
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
      JOIN customers c ON c.id = cla.customer_id
      LEFT JOIN ledger_transactions lt ON lt.customer_id = cla.customer_id AND lt.organization_id = cla.organization_id
      WHERE (cla.customer_id = $1 OR c.global_customer_id = $1)
        AND cla.organization_id = $2
        AND c.organization_id = $2
        AND c.is_deleted = FALSE
      GROUP BY cla.id, cla.customer_id, cla.organization_id, cla.current_balance, cla.updated_at;
    `;
        const result = await this.queryTenant(tenantDb, orgId, accountSql, [cleanCustomerId, orgId]);
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
        // Initialize ledger account ONLY if verified customer belongs to this tenant DB & org
        const custRes = await this.queryTenant(tenantDb, orgId, `SELECT id, organization_id
       FROM customers
       WHERE (id = $1 OR global_customer_id = $1)
         AND organization_id = $2
         AND is_deleted = FALSE
       LIMIT 1;`, [cleanCustomerId, orgId]);
        if (custRes.rows.length === 0) {
            return null;
        }
        const tenantCustId = custRes.rows[0].id;
        const insertRes = await this.queryTenant(tenantDb, orgId, `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
       VALUES ($1, $2, 'INR', 0.00)
       ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
       WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
       RETURNING id, current_balance, updated_at;`, [tenantCustId, orgId]);
        if (insertRes.rows.length === 0) {
            throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${tenantCustId}'.`);
        }
        const row = insertRes.rows[0];
        return new CustomerLedgerAccount({
            id: row.id,
            customerId: tenantCustId,
            organizationId: orgId,
            currentBalance: Number(row.current_balance || 0),
            totalMilkEarnings: 0.0,
            totalDeductions: 0.0,
            lastUpdated: row.updated_at?.toISOString?.() || new Date().toISOString(),
        });
    }
    async save(account, newEntry, options) {
        const rawOrgId = account.props?.organizationId || account.organizationId;
        const { orgId, tenantDb } = await this.getAuthorizedTenantDb(rawOrgId);
        await tenantDb.withTransaction(async (txClient) => {
            const requestedOpId = newEntry
                ? (options?.operatorId || newEntry.createdBy || newEntry.operatorId || '')
                : undefined;
            const { customerId, centerId, operatorId } = await this.validateCustomerCenterAndOperator(txClient, {
                organizationId: orgId,
                customerId: account.customerId,
                operatorId: requestedOpId,
            });
            if (newEntry) {
                const idempotencyKey = `LEDGER-${newEntry.id}`;
                const existingTxn = await this.queryTenant(txClient, orgId, `SELECT id FROM ledger_transactions WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1;`, [idempotencyKey, orgId]);
                if (existingTxn.rows.length > 0) {
                    return;
                }
            }
            // 1. Lock and update customer_ledger_accounts strictly within orgId
            const existingAcc = await this.queryTenant(txClient, orgId, `SELECT id, organization_id FROM customer_ledger_accounts WHERE customer_id = $1 FOR UPDATE;`, [customerId]);
            let accountId = account.id;
            if (existingAcc.rows.length > 0) {
                if (String(existingAcc.rows[0].organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
                    throw new ForbiddenTenantError(`Cross-tenant ledger account write rejected for customer '${customerId}'.`);
                }
                accountId = existingAcc.rows[0].id;
                await this.queryTenant(txClient, orgId, `UPDATE customer_ledger_accounts
           SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
           WHERE id = $2 AND organization_id = $3;`, [account.currentBalance, accountId, orgId]);
            }
            else {
                const createdAcc = await this.queryTenant(txClient, orgId, `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at)
           VALUES ($1, $2, $3, 'INR', $4, NOW(), NOW())
           RETURNING id;`, [account.id || crypto.randomUUID(), customerId, orgId, account.currentBalance]);
                accountId = createdAcc.rows[0].id;
            }
            // 2. If new ledger entry provided, insert journal transaction + balanced double-entry lines
            if (newEntry) {
                const direction = newEntry.creditAmount > 0 ? 'CREDIT' : 'DEBIT';
                const amount = newEntry.creditAmount > 0 ? newEntry.creditAmount : newEntry.debitAmount;
                const txnType = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION_CREDIT' : 'FEED_PURCHASE_DEBIT';
                const refEntity = newEntry.type === 'MILK_CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE';
                const refId = newEntry.referenceId && UUID_REGEX.test(newEntry.referenceId) ? newEntry.referenceId : accountId;
                const idempotencyKey = `LEDGER-${newEntry.id}`;
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
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id;
        `;
                const txnRes = await this.queryTenant(txClient, orgId, insertTxnSql, [
                    newEntry.id,
                    orgId,
                    centerId,
                    customerId,
                    txnType,
                    direction,
                    amount,
                    newEntry.runningBalance,
                    refEntity,
                    refId,
                    newEntry.description,
                    idempotencyKey,
                    operatorId,
                ]);
                if (txnRes.rows.length === 0) {
                    return;
                }
                const insertLineSql = `
          INSERT INTO ledger_entries (
            transaction_id, account_id, account_type, entry_type, amount
          ) VALUES ($1, $2, $3, $4, $5);
        `;
                if (direction === 'CREDIT') {
                    await this.queryTenant(txClient, orgId, insertLineSql, [newEntry.id, accountId, 'CUSTOMER_PAYABLE', 'CREDIT', amount]);
                    await this.queryTenant(txClient, orgId, insertLineSql, [newEntry.id, centerId, 'MILK_PURCHASE_EXPENSE', 'DEBIT', amount]);
                }
                else {
                    await this.queryTenant(txClient, orgId, insertLineSql, [newEntry.id, accountId, 'CUSTOMER_PAYABLE', 'DEBIT', amount]);
                    const contraAccount = txnType === 'FEED_PURCHASE_DEBIT' ? 'FEED_INVENTORY' : 'CASH_BANK';
                    await this.queryTenant(txClient, orgId, insertLineSql, [newEntry.id, centerId, contraAccount, 'CREDIT', amount]);
                }
            }
        });
    }
    async listEntries(customerId, limit = 50, offset = 0, organizationId) {
        const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
        if (!customerId || !UUID_REGEX.test(customerId.trim())) {
            return [];
        }
        const sql = `
      SELECT 
        lt.id,
        lt.created_at,
        lt.transaction_type,
        lt.direction,
        lt.amount,
        lt.balance_after,
        lt.reference_entity,
        lt.description,
        lt.reference_id
      FROM ledger_transactions lt
      JOIN customers c ON c.id = lt.customer_id
      WHERE (lt.customer_id = $1 OR c.global_customer_id = $1)
        AND lt.organization_id = $4
        AND c.organization_id = $4
      ORDER BY lt.created_at DESC
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
        const result = await this.queryTenant(tenantDb, orgId, sql, [customerId.trim(), limit, offset, orgId]);
        return result.rows.map(mapRow);
    }
}
//# sourceMappingURL=PostgresLedgerRepository.js.map