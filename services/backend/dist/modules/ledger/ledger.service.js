import { pool } from '../../config/db.js';
import { AppError, ValidationError, NotFoundError, ForbiddenError, } from '../../shared/errors/app-error.js';
export class LedgerService {
    /**
     * Helper: Resolves customer and validates access.
     */
    static async getCustomerOrThrow(customerId, auth) {
        const res = await pool.query(`SELECT c.*, dc.name AS center_name, o.name AS organization_name
       FROM customers c
       JOIN dairy_centers dc ON dc.id = c.primary_center_id
       JOIN organizations o ON o.id = c.organization_id
       WHERE c.id = $1;`, [customerId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Customer with ID '${customerId}' was not found`);
        }
        const customer = res.rows[0];
        // Verify Organization Isolation
        if (auth.role !== 'SUPER_ADMIN' && customer.organization_id !== auth.organizationId) {
            throw new ForbiddenError('Cross-organization ledger access is strictly prohibited', 'CROSS_ORGANIZATION_ACCESS_DENIED');
        }
        return customer;
    }
    /**
     * 1. Get List of Customer Ledger Accounts
     */
    static async getAccounts(query, auth) {
        const page = Math.max(1, parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const conditions = ['c.organization_id = $1', 'c.is_deleted = FALSE'];
        const params = [auth.organizationId];
        let paramIndex = 2;
        if (query.centerId) {
            conditions.push(`c.primary_center_id = $${paramIndex++}`);
            params.push(query.centerId);
        }
        if (query.search) {
            conditions.push(`(c.full_name ILIKE $${paramIndex} OR c.farmer_code ILIKE $${paramIndex})`);
            params.push(`%${query.search}%`);
            paramIndex++;
        }
        if (query.balanceFilter === 'PAYABLE') {
            conditions.push('COALESCE(cla.current_balance, 0.00) > 0.00');
        }
        else if (query.balanceFilter === 'RECEIVABLE') {
            conditions.push('COALESCE(cla.current_balance, 0.00) < 0.00');
        }
        else if (query.balanceFilter === 'ZERO') {
            conditions.push('COALESCE(cla.current_balance, 0.00) = 0.00');
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countRes = await pool.query(`SELECT COUNT(*) FROM customers c
       LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
       ${whereClause};`, params);
        const total = parseInt(countRes.rows[0].count, 10);
        const dataRes = await pool.query(`SELECT 
         c.id AS customer_id,
         c.full_name AS customer_name,
         c.farmer_code,
         c.primary_center_id AS center_id,
         dc.name AS center_name,
         cla.id AS account_id,
         cla.currency,
         COALESCE(cla.current_balance, 0.00)::numeric(12,2) AS current_balance,
         COALESCE(cla.status, 'ACTIVE') AS status,
         cla.last_transaction_at,
         cla.updated_at
       FROM customers c
       JOIN dairy_centers dc ON dc.id = c.primary_center_id
       LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
       ${whereClause}
       ORDER BY c.farmer_code ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++};`, [...params, limit, offset]);
        return {
            accounts: dataRes.rows.map(row => ({
                customerId: row.customer_id,
                customerName: row.customer_name,
                farmerCode: row.farmer_code,
                centerId: row.center_id,
                centerName: row.center_name,
                accountId: row.account_id,
                currency: row.currency || 'INR',
                currentBalance: parseFloat(row.current_balance),
                status: row.status,
                lastTransactionAt: row.last_transaction_at,
                updatedAt: row.updated_at,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * 2. Customer Ledger Summary
     */
    static async getCustomerSummary(customerId, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        // Get Account and aggregated totals directly from PostgreSQL NUMERIC fields
        const accountRes = await pool.query(`SELECT * FROM customer_ledger_accounts WHERE customer_id = $1;`, [customerId]);
        const aggRes = await pool.query(`SELECT 
         COALESCE(SUM(CASE WHEN transaction_type = 'OPENING_BALANCE_CREDIT' THEN amount ELSE 0 END), 0.00) AS ob_credit,
         COALESCE(SUM(CASE WHEN transaction_type = 'OPENING_BALANCE_DEBIT' THEN amount ELSE 0 END), 0.00) AS ob_debit,
         COALESCE(SUM(CASE WHEN transaction_type = 'MILK_COLLECTION_CREDIT' THEN amount ELSE 0 END), 0.00) AS milk_credits,
         COALESCE(SUM(CASE WHEN transaction_type IN ('CUSTOMER_INCENTIVE_CREDIT', 'APPROVED_ADJUSTMENT_CREDIT', 'LEDGER_ADJUSTMENT_CREDIT', 'ADVANCE_RECOVERY_CREDIT') THEN amount ELSE 0 END), 0.00) AS other_credits,
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0.00) AS total_credits,
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0.00) AS total_debits,
         COALESCE(SUM(CASE WHEN transaction_type IN ('CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT') THEN amount ELSE 0 END), 0.00) AS advances,
         COALESCE(SUM(CASE WHEN transaction_type IN ('AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT') THEN amount ELSE 0 END), 0.00) AS deductions,
         COALESCE(SUM(CASE WHEN transaction_type IN ('PAYOUT_SETTLEMENT_DEBIT', 'PAYMENT_PAYOUT_DEBIT') THEN amount ELSE 0 END), 0.00) AS settled_payouts,
         COALESCE(SUM(CASE WHEN transaction_type IN ('FEED_PURCHASE_DEBIT', 'APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT') THEN amount ELSE 0 END), 0.00) AS other_debits
       FROM ledger_transactions
       WHERE customer_id = $1;`, [customerId]);
        const agg = aggRes.rows[0];
        const account = accountRes.rows[0] || { current_balance: '0.00', status: 'ACTIVE' };
        // Latest transaction
        const latestTxnRes = await pool.query(`SELECT id, transaction_type, direction, amount, created_at, description
       FROM ledger_transactions
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`, [customerId]);
        const latestTxn = latestTxnRes.rows[0]
            ? {
                id: latestTxnRes.rows[0].id,
                transactionType: latestTxnRes.rows[0].transaction_type,
                direction: latestTxnRes.rows[0].direction,
                amount: parseFloat(latestTxnRes.rows[0].amount),
                createdAt: latestTxnRes.rows[0].created_at,
                description: latestTxnRes.rows[0].description,
            }
            : null;
        const openingBalance = parseFloat(agg.ob_credit) - parseFloat(agg.ob_debit);
        return {
            customerId: customer.id,
            customerName: customer.full_name,
            farmerCode: customer.farmer_code,
            organizationId: customer.organization_id,
            centerId: customer.primary_center_id,
            centerName: customer.center_name,
            currency: 'INR',
            openingBalance,
            totalMilkCredits: parseFloat(agg.milk_credits),
            otherApprovedCredits: parseFloat(agg.other_credits),
            totalCredits: parseFloat(agg.total_credits),
            totalDebits: parseFloat(agg.total_debits),
            advances: parseFloat(agg.advances),
            deductions: parseFloat(agg.deductions),
            settledPayouts: parseFloat(agg.settled_payouts),
            otherDebits: parseFloat(agg.other_debits),
            currentBalance: parseFloat(account.current_balance),
            latestTransaction: latestTxn,
            accountStatus: account.status || 'ACTIVE',
        };
    }
    /**
     * 3. Paginated Transactions with Filters
     */
    static async getCustomerTransactions(customerId, query, auth) {
        await this.getCustomerOrThrow(customerId, auth);
        const page = Math.max(1, parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const conditions = ['customer_id = $1'];
        const params = [customerId];
        let paramIndex = 2;
        if (query.startDate) {
            conditions.push(`created_at >= $${paramIndex++}::timestamptz`);
            params.push(`${query.startDate}T00:00:00.000Z`);
        }
        if (query.endDate) {
            conditions.push(`created_at <= $${paramIndex++}::timestamptz`);
            params.push(`${query.endDate}T23:59:59.999Z`);
        }
        if (query.direction) {
            conditions.push(`direction = $${paramIndex++}`);
            params.push(query.direction);
        }
        if (query.transactionType) {
            conditions.push(`transaction_type = $${paramIndex++}`);
            params.push(query.transactionType);
        }
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const countRes = await pool.query(`SELECT COUNT(*) FROM ledger_transactions ${whereClause};`, params);
        const total = parseInt(countRes.rows[0].count, 10);
        const dataRes = await pool.query(`SELECT 
         id,
         organization_id,
         center_id,
         customer_id,
         transaction_type,
         direction,
         amount::numeric(10,2) AS amount,
         balance_after::numeric(12,2) AS balance_after,
         reference_entity,
         reference_id,
         description,
         idempotency_key,
         created_by,
         created_at
       FROM ledger_transactions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++};`, [...params, limit, offset]);
        return {
            transactions: dataRes.rows.map(tx => ({
                id: tx.id,
                transactionType: tx.transaction_type,
                direction: tx.direction,
                amount: parseFloat(tx.amount),
                balanceAfter: parseFloat(tx.balance_after),
                referenceEntity: tx.reference_entity,
                referenceId: tx.reference_id,
                description: tx.description,
                idempotencyKey: tx.idempotency_key,
                receiptNumber: 'RCP-' + tx.id.substring(0, 8).toUpperCase(),
                createdAt: tx.created_at,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * 4. Customer Statement for a Period
     */
    static async getCustomerStatement(customerId, query, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        const startDate = query.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] || '';
        const endDate = query.endDate || new Date().toISOString().split('T')[0] || '';
        // Compute Opening Balance before startDate
        const obRes = await pool.query(`SELECT 
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0.00) AS opening_balance
       FROM ledger_transactions
       WHERE customer_id = $1 AND created_at < $2::timestamptz;`, [customerId, `${startDate}T00:00:00.000Z`]);
        const periodOpeningBalance = parseFloat(obRes.rows[0].opening_balance);
        // Get all transactions within statement window (ordered chronologically)
        const txRes = await pool.query(`SELECT 
         id,
         transaction_type,
         direction,
         amount::numeric(10,2) AS amount,
         balance_after::numeric(12,2) AS balance_after,
         reference_entity,
         reference_id,
         description,
         created_at
       FROM ledger_transactions
       WHERE customer_id = $1
         AND created_at >= $2::timestamptz
         AND created_at <= $3::timestamptz
       ORDER BY created_at ASC;`, [customerId, `${startDate}T00:00:00.000Z`, `${endDate}T23:59:59.999Z`]);
        let periodCredits = 0;
        let periodDebits = 0;
        const formattedTxns = txRes.rows.map(tx => {
            const amt = parseFloat(tx.amount);
            if (tx.direction === 'CREDIT') {
                periodCredits += amt;
            }
            else {
                periodDebits += amt;
            }
            return {
                id: tx.id,
                date: tx.created_at,
                transactionType: tx.transaction_type,
                direction: tx.direction,
                amount: amt,
                balanceAfter: parseFloat(tx.balance_after),
                referenceEntity: tx.reference_entity,
                receiptNumber: 'RCP-' + tx.id.substring(0, 8).toUpperCase(),
                description: tx.description || '',
            };
        });
        const closingBalance = periodOpeningBalance + periodCredits - periodDebits;
        return {
            customerId: customer.id,
            customerName: customer.full_name,
            farmerCode: customer.farmer_code,
            organizationName: customer.organization_name || 'DFarm Cooperative',
            centerName: customer.center_name || 'Dairy Center',
            statementPeriod: {
                startDate,
                endDate,
            },
            openingBalance: parseFloat(periodOpeningBalance.toFixed(2)),
            totalCredits: parseFloat(periodCredits.toFixed(2)),
            totalDebits: parseFloat(periodDebits.toFixed(2)),
            closingBalance: parseFloat(closingBalance.toFixed(2)),
            transactions: formattedTxns,
            generatedAt: new Date().toISOString(),
        };
    }
    /**
     * 5. Create Customer Advance
     */
    static async createAdvance(customerId, payload, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        const centerId = payload.centerId || customer.primary_center_id;
        if (payload.amount <= 0) {
            throw new ValidationError('Advance amount must be strictly positive');
        }
        if (payload.autoApprove) {
            // Disburse directly via stored procedure
            const rpcRes = await pool.query(`SELECT public.post_customer_advance(
           $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::text, $6::varchar, $7::varchar, $8::date
         ) as result;`, [
                customerId,
                centerId,
                auth.userId,
                payload.amount,
                payload.reason,
                payload.recoveryType || 'MONTHLY_BILL_DEDUCTION',
                payload.idempotencyKey || null,
                payload.advanceDate || null,
            ]);
            return rpcRes.rows[0].result;
        }
        else {
            // Request advance with PENDING_APPROVAL
            const rpcRes = await pool.query(`SELECT public.request_customer_advance(
           $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::text, $6::varchar, $7::date
         ) as result;`, [
                customerId,
                centerId,
                auth.userId,
                payload.amount,
                payload.reason,
                payload.recoveryType || 'MONTHLY_BILL_DEDUCTION',
                payload.advanceDate || null,
            ]);
            return rpcRes.rows[0].result;
        }
    }
    /**
     * 6. Approve Pending Customer Advance
     */
    static async approveAdvance(advanceId, approvedAmount, auth) {
        const rpcRes = await pool.query(`SELECT public.approve_customer_advance($1::uuid, $2::uuid, $3::numeric) as result;`, [advanceId, auth.userId, approvedAmount || null]);
        return rpcRes.rows[0].result;
    }
    /**
     * 7. Reject Pending Customer Advance
     */
    static async rejectAdvance(advanceId, reason, auth) {
        const rpcRes = await pool.query(`SELECT public.reject_customer_advance($1::uuid, $2::uuid, $3::text) as result;`, [advanceId, auth.userId, reason]);
        return rpcRes.rows[0].result;
    }
    /**
     * 8. Recover Customer Advance (Partial or Full)
     */
    static async recoverAdvance(advanceId, payload, auth) {
        if (payload.amount <= 0) {
            throw new ValidationError('Recovery amount must be strictly positive');
        }
        try {
            const rpcRes = await pool.query(`SELECT public.recover_customer_advance(
           $1::uuid, $2::uuid, $3::numeric, $4::varchar, $5::text
         ) as result;`, [advanceId, auth.userId, payload.amount, payload.idempotencyKey || null, payload.notes || null]);
            return rpcRes.rows[0].result;
        }
        catch (err) {
            if (err.message && err.message.includes('OVER_RECOVERY_PROHIBITED')) {
                throw new ValidationError(err.message, 'OVER_RECOVERY_PROHIBITED');
            }
            throw err;
        }
    }
    /**
     * 9. Post Customer Authorized Deduction
     */
    static async createDeduction(customerId, payload, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        const centerId = payload.centerId || customer.primary_center_id;
        if (payload.amount <= 0) {
            throw new ValidationError('Deduction amount must be strictly positive');
        }
        const rpcRes = await pool.query(`SELECT public.post_customer_deduction(
         $1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::numeric, $6::text, $7::varchar, $8::varchar
       ) as result;`, [
            customerId,
            centerId,
            auth.userId,
            payload.category,
            payload.amount,
            payload.description,
            payload.supportingReference || null,
            payload.idempotencyKey || null,
        ]);
        return rpcRes.rows[0].result;
    }
    /**
     * 10. Post Opening Balance
     */
    static async createOpeningBalance(customerId, payload, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        const centerId = payload.centerId || customer.primary_center_id;
        try {
            const rpcRes = await pool.query(`SELECT public.post_customer_opening_balance(
           $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::varchar, $6::date, $7::varchar, $8::varchar
         ) as result;`, [
                customerId,
                centerId,
                auth.userId,
                payload.amount,
                payload.direction,
                payload.openingDate || null,
                payload.supportingReference,
                payload.idempotencyKey || null,
            ]);
            return rpcRes.rows[0].result;
        }
        catch (err) {
            if (err.message && err.message.includes('OPENING_BALANCE_EXISTS')) {
                throw new AppError(err.message, 409, 'OPENING_BALANCE_EXISTS');
            }
            throw err;
        }
    }
    /**
     * 11. Post Controlled Ledger Adjustment
     */
    static async createAdjustment(customerId, payload, auth) {
        const customer = await this.getCustomerOrThrow(customerId, auth);
        const centerId = payload.centerId || customer.primary_center_id;
        if (payload.amount <= 0) {
            throw new ValidationError('Adjustment amount must be strictly positive');
        }
        if (!payload.reason || payload.reason.trim().length < 5) {
            throw new ValidationError('Mandatory adjustment reason is required (minimum 5 characters)');
        }
        const rpcRes = await pool.query(`SELECT public.post_customer_adjustment(
         $1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::numeric, $6::text, $7::uuid, $8::varchar
       ) as result;`, [
            customerId,
            centerId,
            auth.userId,
            payload.direction,
            payload.amount,
            payload.reason.trim(),
            payload.originalTransactionId || null,
            payload.idempotencyKey || null,
        ]);
        return rpcRes.rows[0].result;
    }
    /**
     * 12. Account Reconciliation
     */
    static async reconcile(customerId, centerId, auth) {
        if (customerId) {
            if (auth) {
                await this.getCustomerOrThrow(customerId, auth);
            }
            const rpcRes = await pool.query(`SELECT public.reconcile_customer_ledger($1::uuid, $2::uuid) as result;`, [customerId, auth?.userId || null]);
            return rpcRes.rows[0].result;
        }
        // Center-wide reconciliation
        const customersRes = await pool.query(`SELECT id FROM customers WHERE primary_center_id = $1 AND is_deleted = FALSE;`, [centerId]);
        const reports = [];
        for (const row of customersRes.rows) {
            const rpcRes = await pool.query(`SELECT public.reconcile_customer_ledger($1::uuid, $2::uuid) as result;`, [row.id, auth?.userId || null]);
            reports.push(rpcRes.rows[0].result);
        }
        return reports;
    }
    /**
     * 13. Financial Reports
     */
    // Customer-wise balance report
    static async getCustomerBalancesReport(filters, auth) {
        const conditions = ['c.organization_id = $1', 'c.is_deleted = FALSE'];
        const params = [auth.organizationId];
        let idx = 2;
        if (filters.centerId) {
            conditions.push(`c.primary_center_id = $${idx++}`);
            params.push(filters.centerId);
        }
        const res = await pool.query(`SELECT 
         c.id AS customer_id,
         c.full_name AS customer_name,
         c.farmer_code,
         dc.id AS center_id,
         dc.name AS center_name,
         COALESCE(cla.current_balance, 0.00)::numeric(12,2) AS current_balance,
         CASE 
           WHEN COALESCE(cla.current_balance, 0.00) > 0.00 THEN 'DAIRY_OWES_CUSTOMER'
           WHEN COALESCE(cla.current_balance, 0.00) < 0.00 THEN 'CUSTOMER_OWES_DAIRY'
           ELSE 'SETTLED'
         END AS balance_position,
         cla.last_transaction_at
       FROM customers c
       JOIN dairy_centers dc ON dc.id = c.primary_center_id
       LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.farmer_code ASC;`, params);
        let totalPayable = 0;
        let totalReceivable = 0;
        const balances = res.rows.map(r => {
            const bal = parseFloat(r.current_balance);
            if (bal > 0)
                totalPayable += bal;
            if (bal < 0)
                totalReceivable += Math.abs(bal);
            return {
                customerId: r.customer_id,
                customerName: r.customer_name,
                farmerCode: r.farmer_code,
                centerId: r.center_id,
                centerName: r.center_name,
                currentBalance: bal,
                balancePosition: r.balance_position,
                lastTransactionAt: r.last_transaction_at,
            };
        });
        return {
            totalCustomers: balances.length,
            totalPayableLiability: parseFloat(totalPayable.toFixed(2)),
            totalCustomerDebt: parseFloat(totalReceivable.toFixed(2)),
            netDairyPosition: parseFloat((totalPayable - totalReceivable).toFixed(2)),
            balances,
        };
    }
    // Daily credit/debit summary
    static async getDailySummaryReport(filters, auth) {
        const conditions = ['organization_id = $1'];
        const params = [auth.organizationId];
        let idx = 2;
        if (filters.centerId) {
            conditions.push(`center_id = $${idx++}`);
            params.push(filters.centerId);
        }
        if (filters.startDate) {
            conditions.push(`created_at >= $${idx++}::timestamptz`);
            params.push(`${filters.startDate}T00:00:00.000Z`);
        }
        if (filters.endDate) {
            conditions.push(`created_at <= $${idx++}::timestamptz`);
            params.push(`${filters.endDate}T23:59:59.999Z`);
        }
        const res = await pool.query(`SELECT 
         DATE(created_at) AS transaction_date,
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0.00)::numeric(12,2) AS total_credits,
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0.00)::numeric(12,2) AS total_debits,
         COALESCE(SUM(CASE WHEN transaction_type = 'MILK_COLLECTION_CREDIT' THEN amount ELSE 0 END), 0.00)::numeric(12,2) AS milk_credits,
         COALESCE(SUM(CASE WHEN transaction_type IN ('CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT') THEN amount ELSE 0 END), 0.00)::numeric(12,2) AS advance_debits,
         COALESCE(SUM(CASE WHEN transaction_type IN ('AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT') THEN amount ELSE 0 END), 0.00)::numeric(12,2) AS deduction_debits,
         COUNT(*) AS transaction_count
       FROM ledger_transactions
       WHERE ${conditions.join(' AND ')}
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC;`, params);
        return {
            summary: res.rows.map(r => ({
                date: r.transaction_date,
                totalCredits: parseFloat(r.total_credits),
                totalDebits: parseFloat(r.total_debits),
                milkCredits: parseFloat(r.milk_credits),
                advanceDebits: parseFloat(r.advance_debits),
                deductionDebits: parseFloat(r.deduction_debits),
                transactionCount: parseInt(r.transaction_count, 10),
            })),
        };
    }
    // Center-wise liabilities
    static async getCenterLiabilitiesReport(filters, auth) {
        const conditions = ['c.organization_id = $1', 'c.is_deleted = FALSE'];
        const params = [auth.organizationId];
        let idx = 2;
        if (filters.centerId) {
            conditions.push(`dc.id = $${idx++}`);
            params.push(filters.centerId);
        }
        const res = await pool.query(`SELECT 
         dc.id AS center_id,
         dc.name AS center_name,
         dc.code AS center_code,
         COUNT(c.id) AS active_farmers,
         COALESCE(SUM(CASE WHEN cla.current_balance > 0 THEN cla.current_balance ELSE 0 END), 0.00)::numeric(12,2) AS total_payable_liability,
         COALESCE(SUM(CASE WHEN cla.current_balance < 0 THEN ABS(cla.current_balance) ELSE 0 END), 0.00)::numeric(12,2) AS total_recoverable_debt,
         COALESCE(SUM(cla.current_balance), 0.00)::numeric(12,2) AS net_liability
       FROM dairy_centers dc
       JOIN customers c ON c.primary_center_id = dc.id
       LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY dc.id, dc.name, dc.code
       ORDER BY dc.name ASC;`, params);
        return {
            centers: res.rows.map(r => ({
                centerId: r.center_id,
                centerName: r.center_name,
                centerCode: r.center_code,
                activeFarmers: parseInt(r.active_farmers, 10),
                totalPayableLiability: parseFloat(r.total_payable_liability),
                totalRecoverableDebt: parseFloat(r.total_recoverable_debt),
                netLiability: parseFloat(r.net_liability),
            })),
        };
    }
    // Outstanding customer advances
    static async getOutstandingAdvancesReport(filters, auth) {
        const conditions = ['c.organization_id = $1', "ca.status IN ('ACTIVE', 'APPROVED')"];
        const params = [auth.organizationId];
        let idx = 2;
        if (filters.centerId) {
            conditions.push(`ca.center_id = $${idx++}`);
            params.push(filters.centerId);
        }
        const res = await pool.query(`SELECT 
         ca.id AS advance_id,
         ca.customer_id,
         c.full_name AS customer_name,
         c.farmer_code,
         ca.center_id,
         dc.name AS center_name,
         ca.advance_date,
         ca.principal_amount::numeric(10,2) AS principal_amount,
         ca.total_recovered_amount::numeric(10,2) AS total_recovered_amount,
         ca.outstanding_amount::numeric(10,2) AS outstanding_amount,
         ca.status,
         ca.reason,
         ca.disbursed_at
       FROM customer_advances ca
       JOIN customers c ON c.id = ca.customer_id
       JOIN dairy_centers dc ON dc.id = ca.center_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ca.outstanding_amount DESC;`, params);
        let totalPrincipal = 0;
        let totalRecovered = 0;
        let totalOutstanding = 0;
        const advances = res.rows.map(r => {
            const p = parseFloat(r.principal_amount);
            const rec = parseFloat(r.total_recovered_amount);
            const out = parseFloat(r.outstanding_amount);
            totalPrincipal += p;
            totalRecovered += rec;
            totalOutstanding += out;
            return {
                advanceId: r.advance_id,
                customerId: r.customer_id,
                customerName: r.customer_name,
                farmerCode: r.farmer_code,
                centerId: r.center_id,
                centerName: r.center_name,
                advanceDate: r.advance_date,
                principalAmount: p,
                totalRecoveredAmount: rec,
                outstandingAmount: out,
                status: r.status,
                reason: r.reason,
                disbursedAt: r.disbursed_at,
            };
        });
        return {
            count: advances.length,
            totalPrincipal: parseFloat(totalPrincipal.toFixed(2)),
            totalRecovered: parseFloat(totalRecovered.toFixed(2)),
            totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
            advances,
        };
    }
    // Transaction register
    static async getTransactionRegisterReport(filters, auth) {
        const page = Math.max(1, parseInt(filters.page || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt(filters.limit || '50', 10)));
        const offset = (page - 1) * limit;
        const conditions = ['lt.organization_id = $1'];
        const params = [auth.organizationId];
        let idx = 2;
        if (filters.centerId) {
            conditions.push(`lt.center_id = $${idx++}`);
            params.push(filters.centerId);
        }
        if (filters.startDate) {
            conditions.push(`lt.created_at >= $${idx++}::timestamptz`);
            params.push(`${filters.startDate}T00:00:00.000Z`);
        }
        if (filters.endDate) {
            conditions.push(`lt.created_at <= $${idx++}::timestamptz`);
            params.push(`${filters.endDate}T23:59:59.999Z`);
        }
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const countRes = await pool.query(`SELECT COUNT(*) FROM ledger_transactions lt ${whereClause};`, params);
        const total = parseInt(countRes.rows[0].count, 10);
        const res = await pool.query(`SELECT 
         lt.id,
         lt.created_at,
         lt.customer_id,
         c.full_name AS customer_name,
         c.farmer_code,
         lt.center_id,
         dc.name AS center_name,
         lt.transaction_type,
         lt.direction,
         lt.amount::numeric(10,2) AS amount,
         lt.balance_after::numeric(12,2) AS balance_after,
         lt.reference_entity,
         lt.description,
         u.full_name AS created_by_name
       FROM ledger_transactions lt
       JOIN customers c ON c.id = lt.customer_id
       JOIN dairy_centers dc ON dc.id = lt.center_id
       LEFT JOIN users u ON u.id = lt.created_by
       ${whereClause}
       ORDER BY lt.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++};`, [...params, limit, offset]);
        return {
            transactions: res.rows.map(r => ({
                id: r.id,
                date: r.created_at,
                customerId: r.customer_id,
                customerName: r.customer_name,
                farmerCode: r.farmer_code,
                centerId: r.center_id,
                centerName: r.center_name,
                transactionType: r.transaction_type,
                direction: r.direction,
                amount: parseFloat(r.amount),
                balanceAfter: parseFloat(r.balance_after),
                referenceEntity: r.reference_entity,
                description: r.description,
                createdByName: r.created_by_name,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * 14. Feed Purchase Debit Integration Contract
     * Adheres strictly to the defined FeedDebitIntegrationContract for Phase 14 handoff.
     * Does NOT generate fake sales; processes authentic feed sales when called with contract.
     */
    static async processFeedPurchaseDebit(contract, auth) {
        if (!contract.feedSaleId || !contract.customerId || contract.totalDebitAmount <= 0) {
            throw new ValidationError('Invalid feed purchase debit contract payload');
        }
        const customer = await this.getCustomerOrThrow(contract.customerId, auth);
        const centerId = contract.centerId || customer.primary_center_id;
        const idempotencyKey = contract.idempotencyKey || `FEED-${contract.feedSaleId}`;
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');
            // 1. Idempotency Check
            const existingTxn = await client.query(`SELECT id, balance_after FROM ledger_transactions WHERE idempotency_key = $1;`, [idempotencyKey]);
            if (existingTxn.rows.length > 0) {
                await client.query('ROLLBACK;');
                return {
                    transactionId: existingTxn.rows[0].id,
                    balanceAfter: parseFloat(existingTxn.rows[0].balance_after),
                    isIdempotentReplay: true,
                };
            }
            // 2. Lock customer ledger account
            const claRes = await client.query(`SELECT * FROM customer_ledger_accounts WHERE customer_id = $1 FOR UPDATE;`, [contract.customerId]);
            let prevBalance = 0.00;
            let newBalance = 0.00;
            let accountId = '';
            if (claRes.rows.length === 0) {
                newBalance = 0.00 - contract.totalDebitAmount;
                const newAcc = await client.query(`INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance, last_transaction_at)
           VALUES ($1, $2, 'INR', $3, NOW()) RETURNING id;`, [contract.customerId, customer.organization_id, newBalance]);
                accountId = newAcc.rows[0].id;
            }
            else {
                prevBalance = parseFloat(claRes.rows[0].current_balance);
                newBalance = prevBalance - contract.totalDebitAmount;
                accountId = claRes.rows[0].id;
                await client.query(`UPDATE customer_ledger_accounts
           SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
           WHERE id = $2;`, [newBalance, accountId]);
            }
            // 3. Post Ledger Transaction (Debit)
            const txnRes = await client.query(`INSERT INTO ledger_transactions (
           organization_id, center_id, customer_id, transaction_type, direction,
           amount, balance_after, reference_entity, reference_id, description,
           idempotency_key, created_by, created_at
         ) VALUES ($1, $2, $3, 'FEED_PURCHASE_DEBIT', 'DEBIT', $4, $5, 'FEED_SALE', $6, $7, $8, $9, NOW())
         RETURNING id;`, [
                customer.organization_id,
                centerId,
                contract.customerId,
                contract.totalDebitAmount,
                newBalance,
                contract.feedSaleId,
                `Feed Purchase Invoice #${contract.saleInvoiceNumber}`,
                idempotencyKey,
                contract.soldByUserId || auth.userId,
            ]);
            const txnId = txnRes.rows[0].id;
            // 4. Balanced Double-Entry Journal
            // Debit: Customer Payable (Liability decreases)
            await client.query(`INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
         VALUES ($1, $2, 'CUSTOMER_PAYABLE', 'DEBIT', $3);`, [txnId, accountId, contract.totalDebitAmount]);
            // Credit: Feed Inventory (Asset decreases)
            await client.query(`INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
         VALUES ($1, $2, 'FEED_INVENTORY', 'CREDIT', $3);`, [txnId, centerId, contract.totalDebitAmount]);
            // 5. Audit Log
            await client.query(`INSERT INTO audit_logs (organization_id, center_id, user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, $3, 'FEED_PURCHASE_DEBIT_POSTED', 'FEED_SALE', $4, $5);`, [
                customer.organization_id,
                centerId,
                auth.userId,
                contract.feedSaleId,
                JSON.stringify({
                    amount: contract.totalDebitAmount,
                    invoice: contract.saleInvoiceNumber,
                    balanceAfter: newBalance,
                }),
            ]);
            await client.query('COMMIT;');
            return {
                transactionId: txnId,
                customerId: contract.customerId,
                totalDebitAmount: contract.totalDebitAmount,
                previousBalance: prevBalance,
                newBalance,
                invoiceNumber: contract.saleInvoiceNumber,
                isIdempotentReplay: false,
            };
        }
        catch (err) {
            await client.query('ROLLBACK;');
            throw err;
        }
        finally {
            client.release();
        }
    }
}
//# sourceMappingURL=ledger.service.js.map