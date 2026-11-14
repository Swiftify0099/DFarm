import { pool } from '../../db.js';
import { BillingCycleType, BillStatus, BillItemType, UserRole, NotificationEventType, } from '@dfarm/shared-types';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError, } from '../../shared/errors/app-error.js';
import { PdfStatementGenerator } from './pdf-statement.generator.js';
import { DurableStatementStorage } from './durable-statement-storage.js';
import crypto from 'node:crypto';
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
export class BillingService {
    /**
     * 1. Create a new billing period for a center.
     */
    static async createPeriod(data, auth) {
        const cycleType = data.cycleType || BillingCycleType.CALENDAR_MONTH;
        // Rule: Alternatives (TEN_DAY, FIFTEEN_DAY, CUSTOM_PERIOD) require owner/super admin approval
        if (cycleType !== BillingCycleType.CALENDAR_MONTH) {
            if (auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.SUPER_ADMIN) {
                throw new ForbiddenError(`Activating non-standard billing cycle '${cycleType}' requires explicit DAIRY_OWNER approval`, 'CYCLE_TYPE_APPROVAL_REQUIRED');
            }
        }
        // Verify center
        const centerRes = await pool.query(`SELECT dc.id, dc.organization_id, dc.status, cs.billing_cycle_type 
       FROM dairy_centers dc
       LEFT JOIN center_settings cs ON cs.center_id = dc.id
       WHERE dc.id = $1`, [data.centerId]);
        if (centerRes.rows.length === 0) {
            throw new NotFoundError(`Dairy Center '${data.centerId}' does not exist`);
        }
        const center = centerRes.rows[0];
        if (center.status !== 'ACTIVE') {
            throw new BadRequestError(`Dairy Center '${data.centerId}' is not ACTIVE (status: ${center.status})`);
        }
        // Check organization scoping
        if (auth.role !== UserRole.SUPER_ADMIN && auth.organizationId !== center.organization_id) {
            throw new ForbiddenError('Cross-organization billing period creation is strictly prohibited');
        }
        // Insert period
        try {
            const res = await pool.query(`INSERT INTO billing_periods (
          organization_id, center_id, period_name, start_date, end_date, cycle_type, status, generated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7)
        RETURNING *;`, [center.organization_id, data.centerId, data.periodName, data.startDate, data.endDate, cycleType, auth.userId]);
            return this.mapBillingPeriod(res.rows[0]);
        }
        catch (err) {
            if (err.code === '23505') {
                throw new ConflictError(`A billing period for center '${data.centerId}' with overlapping dates already exists`, 'OVERLAPPING_BILLING_PERIOD');
            }
            throw err;
        }
    }
    /**
     * 2. List billing periods with center/org filters and pagination.
     */
    static async listPeriods(filter, auth) {
        const page = filter.page || 1;
        const limit = filter.limit || 50;
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];
        let idx = 1;
        // Org scoping
        if (auth.role !== UserRole.SUPER_ADMIN) {
            conditions.push(`bp.organization_id = $${idx++}`);
            params.push(auth.organizationId);
        }
        // Center scoping for staff
        if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER) {
            conditions.push(`bp.center_id = ANY($${idx++})`);
            params.push(auth.centerIds);
        }
        if (filter.centerId) {
            conditions.push(`bp.center_id = $${idx++}`);
            params.push(filter.centerId);
        }
        if (filter.status) {
            conditions.push(`bp.status = $${idx++}`);
            params.push(filter.status);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countRes = await pool.query(`SELECT COUNT(*) FROM billing_periods bp ${whereClause};`, params);
        const total = parseInt(countRes.rows[0].count, 10);
        const queryStr = `
      SELECT bp.*
      FROM billing_periods bp
      ${whereClause}
      ORDER BY bp.start_date DESC, bp.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
        params.push(limit, offset);
        const res = await pool.query(queryStr, params);
        const periods = res.rows.map(r => this.mapBillingPeriod(r));
        return { periods, total, page, limit };
    }
    /**
     * 3. Get single billing period by ID.
     */
    static async getPeriod(periodId, auth) {
        const res = await pool.query(`SELECT bp.*, dc.name as center_name, o.name as org_name
       FROM billing_periods bp
       JOIN dairy_centers dc ON dc.id = bp.center_id
       JOIN organizations o ON o.id = bp.organization_id
       WHERE bp.id = $1;`, [periodId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Billing period '${periodId}' was not found`);
        }
        const period = res.rows[0];
        // Auth verification
        if (auth.role !== UserRole.SUPER_ADMIN && auth.organizationId !== period.organization_id) {
            throw new ForbiddenError('Cross-organization access is strictly prohibited');
        }
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            !auth.centerIds.includes(period.center_id)) {
            throw new ForbiddenError(`Actor does not have access to center '${period.center_id}'`);
        }
        // Bills count and status summary
        const summaryRes = await pool.query(`SELECT 
         COUNT(*) as total_bills,
         COUNT(*) FILTER (WHERE bill_status = 'DRAFT') as draft_count,
         COUNT(*) FILTER (WHERE bill_status = 'GENERATED') as generated_count,
         COUNT(*) FILTER (WHERE bill_status = 'UNDER_REVIEW') as under_review_count,
         COUNT(*) FILTER (WHERE bill_status = 'APPROVED') as approved_count,
         COUNT(*) FILTER (WHERE bill_status = 'FINALIZED') as finalized_count,
         COUNT(*) FILTER (WHERE is_negative_balance = TRUE) as negative_balance_count,
         COALESCE(SUM(total_milk_weight), 0.00) as total_weight,
         COALESCE(SUM(gross_milk_amount), 0.00) as total_gross,
         COALESCE(SUM(net_payable_amount), 0.00) as total_net_payable
       FROM monthly_bills
       WHERE billing_period_id = $1;`, [periodId]);
        return {
            ...this.mapBillingPeriod(period),
            billsSummary: summaryRes.rows[0],
        };
    }
    /**
     * 4. Get period generation progress.
     */
    static async getPeriodProgress(periodId, auth) {
        const period = await this.getPeriod(periodId, auth);
        return {
            periodId: period.id,
            status: period.status,
            periodName: period.periodName,
            startDate: period.startDate,
            endDate: period.endDate,
            totalFarmersBilled: period.totalFarmersBilled,
            totalMilkWeight: period.totalMilkWeight,
            totalGrossMilkAmount: period.totalGrossMilkAmount,
            totalNetPayableAmount: period.totalNetPayableAmount,
            billsSummary: period.billsSummary,
        };
    }
    /**
     * 5. Generate Bills for a Billing Period (All customers or single customer).
     * Follows strict financial model:
     * Closing Balance = Opening Balance + Credits - Debits - Settled Payouts.
     */
    static async generateBills(periodId, options, auth) {
        const startTime = Date.now();
        // 1. Fetch Period
        const periodRes = await pool.query(`SELECT * FROM billing_periods WHERE id = $1 FOR UPDATE;`, [periodId]);
        if (periodRes.rows.length === 0) {
            throw new NotFoundError(`Billing period '${periodId}' was not found`);
        }
        const period = periodRes.rows[0];
        // Check center access for non-owner/admin
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            !auth.centerIds.includes(period.center_id)) {
            throw new ForbiddenError(`Actor does not have access to center '${period.center_id}'`, 'CENTER_ACCESS_DENIED');
        }
        // Cannot generate bills if period is already FINALIZED
        if (period.status === 'FINALIZED') {
            throw new ConflictError(`Billing period '${periodId}' is already FINALIZED. Finalized bills cannot be overwritten.`, 'PERIOD_ALREADY_FINALIZED');
        }
        if (period.status === 'CANCELLED') {
            throw new BadRequestError(`Billing period '${periodId}' is CANCELLED`, 'PERIOD_CANCELLED');
        }
        // Role authorization: Accountant, Center Manager, Dairy Owner, Super Admin
        const allowedRoles = [
            UserRole.SUPER_ADMIN,
            UserRole.DAIRY_OWNER,
            UserRole.CENTER_MANAGER,
            UserRole.ACCOUNTANT,
        ];
        if (!allowedRoles.includes(auth.role)) {
            throw new ForbiddenError(`Role '${auth.role}' is not authorized to generate settlement statements`, 'FORBIDDEN');
        }
        // Update status to GENERATING
        await pool.query(`UPDATE billing_periods SET status = 'GENERATING', updated_at = NOW() WHERE id = $1;`, [periodId]);
        // 2. Identify customers to bill
        let targetCustomers = [];
        if (options.customerId) {
            const custRes = await pool.query(`SELECT id, farmer_code, full_name 
         FROM customers 
         WHERE id = $1 AND primary_center_id = $2 AND is_deleted = FALSE;`, [options.customerId, period.center_id]);
            if (custRes.rows.length === 0) {
                throw new NotFoundError(`Customer '${options.customerId}' not found or does not belong to center '${period.center_id}'`);
            }
            targetCustomers = custRes.rows;
        }
        else {
            // All active customers belonging to this center who either delivered milk, have ledger activity, or have non-zero balance
            const custRes = await pool.query(`SELECT DISTINCT c.id, c.farmer_code, c.full_name
         FROM customers c
         WHERE c.primary_center_id = $1 
           AND c.is_deleted = FALSE
           AND (
             c.status = 'ACTIVE'
             OR EXISTS (
               SELECT 1 FROM milk_collections mc 
               WHERE mc.customer_id = c.id 
                 AND mc.business_date >= $2::date 
                 AND mc.business_date <= $3::date
             )
             OR EXISTS (
               SELECT 1 FROM ledger_transactions lt
               WHERE lt.customer_id = c.id
                 AND lt.created_at >= $2::date
                 AND lt.created_at < ($3::date + INTERVAL '1 day')
             )
             OR EXISTS (
               SELECT 1 FROM customer_ledger_accounts cla
               WHERE cla.customer_id = c.id AND cla.current_balance <> 0.00
             )
           )
         ORDER BY c.farmer_code ASC;`, [period.center_id, period.start_date, period.end_date]);
            targetCustomers = custRes.rows;
        }
        let billsGenerated = 0;
        let failedCount = 0;
        let periodGrossMilk = 0;
        let periodNetPayable = 0;
        let periodTotalWeight = 0;
        // 3. Process each customer
        for (const cust of targetCustomers) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // Check if a FINALIZED bill already exists for this customer in this period
                const existingBillRes = await client.query(`SELECT id, bill_status, bill_number FROM monthly_bills 
           WHERE customer_id = $1 AND billing_period_id = $2;`, [cust.id, periodId]);
                if (existingBillRes.rows.length > 0 && existingBillRes.rows[0].bill_status === 'FINALIZED') {
                    // Skip customer if already finalized
                    await client.query('ROLLBACK');
                    continue;
                }
                // A. Opening balance immediately before start_date
                const opBalRes = await client.query(`SELECT balance_after 
           FROM ledger_transactions 
           WHERE customer_id = $1 
             AND created_at < $2::date
           ORDER BY created_at DESC, id DESC 
           LIMIT 1;`, [cust.id, period.start_date]);
                const openingBalance = opBalRes.rows.length > 0 ? Number(opBalRes.rows[0].balance_after) : 0.00;
                // B. Milk Collections during period
                const milkRes = await client.query(`SELECT id, business_date, shift_type, milk_category, net_weight, measurement_unit,
                  fat_percentage, snf_percentage, applied_rate_per_unit, total_amount, created_at
           FROM milk_collections
           WHERE customer_id = $1 
             AND center_id = $2
             AND business_date >= $3::date 
             AND business_date <= $4::date
             AND transaction_status = 'COMPLETED'
           ORDER BY business_date ASC, shift_type ASC, created_at ASC;`, [cust.id, period.center_id, period.start_date, period.end_date]);
                let totalCowWeight = 0;
                let totalCowAmount = 0;
                let cowCount = 0;
                let totalBufWeight = 0;
                let totalBufAmount = 0;
                let bufCount = 0;
                for (const m of milkRes.rows) {
                    const w = Number(m.net_weight);
                    const amt = Number(m.total_amount);
                    if (m.milk_category === 'COW') {
                        totalCowWeight += w;
                        totalCowAmount += amt;
                        cowCount++;
                    }
                    else {
                        totalBufWeight += w;
                        totalBufAmount += amt;
                        bufCount++;
                    }
                }
                totalCowWeight = round2(totalCowWeight);
                totalCowAmount = round2(totalCowAmount);
                totalBufWeight = round2(totalBufWeight);
                totalBufAmount = round2(totalBufAmount);
                const totalMilkWeight = round2(totalCowWeight + totalBufWeight);
                const grossMilkAmount = round2(totalCowAmount + totalBufAmount);
                const totalMilkCount = cowCount + bufCount;
                // C. Feed purchases debits during period
                const feedRes = await client.query(`SELECT id, amount, created_at, description
           FROM ledger_transactions
           WHERE customer_id = $1 
             AND center_id = $2
             AND created_at >= $3::date 
             AND created_at < ($4::date + INTERVAL '1 day')
             AND transaction_type = 'FEED_PURCHASE_DEBIT';`, [cust.id, period.center_id, period.start_date, period.end_date]);
                const feedDebit = round2(feedRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // D. Advances debits during period
                const advRes = await client.query(`SELECT id, amount, created_at, description
           FROM ledger_transactions
           WHERE customer_id = $1 
             AND center_id = $2
             AND created_at >= $3::date 
             AND created_at < ($4::date + INTERVAL '1 day')
             AND transaction_type = 'ADVANCE_DEBIT';`, [cust.id, period.center_id, period.start_date, period.end_date]);
                const advancesDebit = round2(advRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // E. Other deductions during period
                const dedRes = await client.query(`SELECT id, deduction_category, amount, description, created_at
           FROM customer_deductions
           WHERE customer_id = $1 
             AND center_id = $2
             AND (
               (created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day'))
               OR (is_applied_to_bill = FALSE AND created_at < ($4::date + INTERVAL '1 day'))
             );`, [cust.id, period.center_id, period.start_date, period.end_date]);
                const deductionsDebit = round2(dedRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // F. Settled Payouts during period
                // CRITICAL RULE: DO NOT subtract pending or submitted payouts! Only SUCCESSFUL or RECONCILED.
                const payoutRes = await client.query(`SELECT id, amount, paid_at, transaction_reference
           FROM customer_payments
           WHERE customer_id = $1 
             AND center_id = $2
             AND payment_status IN ('SUCCESSFUL', 'RECONCILED')
             AND (
               (paid_at >= $3::date AND paid_at < ($4::date + INTERVAL '1 day'))
               OR (paid_at IS NULL AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day'))
             );`, [cust.id, period.center_id, period.start_date, period.end_date]);
                let settledPayouts = round2(payoutRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // Also check ledger_transactions for PAYMENT_PAYOUT_DEBIT if any exists without customer_payments row
                const ledgerPayoutRes = await client.query(`SELECT id, amount, created_at, description
           FROM ledger_transactions
           WHERE customer_id = $1 
             AND center_id = $2
             AND created_at >= $3::date 
             AND created_at < ($4::date + INTERVAL '1 day')
             AND transaction_type = 'PAYMENT_PAYOUT_DEBIT'
             AND reference_id NOT IN (
               SELECT id FROM customer_payments WHERE customer_id = $1
             );`, [cust.id, period.center_id, period.start_date, period.end_date]);
                settledPayouts = round2(settledPayouts + ledgerPayoutRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // G. Other Credits & Debits (manual adjustments, reversals)
                const adjCreditsRes = await client.query(`SELECT id, amount, created_at, description
           FROM ledger_transactions
           WHERE customer_id = $1 
             AND center_id = $2
             AND created_at >= $3::date 
             AND created_at < ($4::date + INTERVAL '1 day')
             AND transaction_type = 'LEDGER_ADJUSTMENT_CREDIT';`, [cust.id, period.center_id, period.start_date, period.end_date]);
                const otherCredits = round2(adjCreditsRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                const adjDebitsRes = await client.query(`SELECT id, amount, created_at, description
           FROM ledger_transactions
           WHERE customer_id = $1 
             AND center_id = $2
             AND created_at >= $3::date 
             AND created_at < ($4::date + INTERVAL '1 day')
             AND transaction_type IN ('LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT');`, [cust.id, period.center_id, period.start_date, period.end_date]);
                const otherDebits = round2(adjDebitsRes.rows.reduce((sum, r) => sum + Number(r.amount), 0));
                // H. Calculate Totals and Balances
                const totalCredits = round2(grossMilkAmount + otherCredits);
                const totalDebits = round2(feedDebit + advancesDebit + deductionsDebit + otherDebits);
                const closingBalance = round2(openingBalance + totalCredits - totalDebits - settledPayouts);
                const isNegativeBalance = closingBalance < 0;
                const netPayableAmount = isNegativeBalance ? 0.00 : closingBalance;
                // Bill Number formatting: BILL-YYYYMM-FARMERCODE
                const periodDateStr = period.start_date instanceof Date ? period.start_date.toISOString() : String(period.start_date);
                const ym = periodDateStr.slice(0, 7).replace('-', '');
                const cleanFarmerCode = cust.farmer_code.replace(/[^A-Za-z0-9]/g, '');
                const billNumber = `BILL-${ym}-${cleanFarmerCode}`;
                // I. Upsert monthly_bills record
                let billId;
                if (existingBillRes.rows.length > 0) {
                    billId = existingBillRes.rows[0].id;
                    await client.query(`UPDATE monthly_bills SET
               opening_balance = $1,
               total_cow_milk_weight = $2,
               total_cow_milk_amount = $3,
               cow_collections_count = $4,
               total_buffalo_milk_weight = $5,
               total_buffalo_milk_amount = $6,
               buffalo_collections_count = $7,
               total_milk_collections_count = $8,
               total_milk_weight = $9,
               gross_milk_amount = $10,
               other_credits_amount = $11,
               total_credits = $12,
               feed_purchases_debit = $13,
               advances_debit = $14,
               deductions_debit = $15,
               other_debits_amount = $16,
               total_debits = $17,
               settled_payouts_amount = $18,
               closing_balance = $19,
               net_payable_amount = $20,
               is_negative_balance = $21,
               bill_status = 'GENERATED',
               generated_at = NOW(),
               generated_by = $22,
               updated_at = NOW()
             WHERE id = $23;`, [
                        openingBalance,
                        totalCowWeight,
                        totalCowAmount,
                        cowCount,
                        totalBufWeight,
                        totalBufAmount,
                        bufCount,
                        totalMilkCount,
                        totalMilkWeight,
                        grossMilkAmount,
                        otherCredits,
                        totalCredits,
                        feedDebit,
                        advancesDebit,
                        deductionsDebit,
                        otherDebits,
                        totalDebits,
                        settledPayouts,
                        closingBalance,
                        netPayableAmount,
                        isNegativeBalance,
                        auth.userId,
                        billId,
                    ]);
                    // Delete existing line items for clean recalculation
                    await client.query(`DELETE FROM monthly_bill_items WHERE bill_id = $1;`, [billId]);
                }
                else {
                    const insertBillRes = await client.query(`INSERT INTO monthly_bills (
               billing_period_id, customer_id, center_id, organization_id, bill_number, bill_status,
               opening_balance, total_cow_milk_weight, total_cow_milk_amount, cow_collections_count,
               total_buffalo_milk_weight, total_buffalo_milk_amount, buffalo_collections_count,
               total_milk_collections_count, total_milk_weight, gross_milk_amount,
               other_credits_amount, total_credits, feed_purchases_debit, advances_debit,
               deductions_debit, other_debits_amount, total_debits, settled_payouts_amount,
               closing_balance, net_payable_amount, is_negative_balance,
               generated_at, generated_by
             ) VALUES (
               $1, $2, $3, $4, $5, 'GENERATED',
               $6, $7, $8, $9,
               $10, $11, $12,
               $13, $14, $15,
               $16, $17, $18, $19,
               $20, $21, $22, $23,
               $24, $25, $26,
               NOW(), $27
             ) RETURNING id;`, [
                        periodId,
                        cust.id,
                        period.center_id,
                        period.organization_id,
                        billNumber,
                        openingBalance,
                        totalCowWeight,
                        totalCowAmount,
                        cowCount,
                        totalBufWeight,
                        totalBufAmount,
                        bufCount,
                        totalMilkCount,
                        totalMilkWeight,
                        grossMilkAmount,
                        otherCredits,
                        totalCredits,
                        feedDebit,
                        advancesDebit,
                        deductionsDebit,
                        otherDebits,
                        totalDebits,
                        settledPayouts,
                        closingBalance,
                        netPayableAmount,
                        isNegativeBalance,
                        auth.userId,
                    ]);
                    billId = insertBillRes.rows[0].id;
                }
                // J. Insert monthly_bill_items for detailed milk collections
                for (const col of milkRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, shift_type, milk_category,
               quantity, measurement_unit, fat_percentage, snf_percentage, rate_per_unit,
               amount, direction, description
             ) VALUES ($1, 'MILK_COLLECTION', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CREDIT', $12);`, [
                        billId,
                        col.id,
                        col.business_date,
                        col.shift_type,
                        col.milk_category,
                        col.net_weight,
                        col.measurement_unit || 'KG',
                        col.fat_percentage,
                        col.snf_percentage,
                        col.applied_rate_per_unit,
                        col.total_amount,
                        `${col.milk_category} Milk Collection (${col.shift_type})`,
                    ]);
                }
                // Insert items for feed
                for (const f of feedRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, amount, direction, description
             ) VALUES ($1, 'FEED_PURCHASE', $2, $3::date, $4, 'DEBIT', $5);`, [billId, f.id, f.created_at, f.amount, f.description || 'Cattle Feed Purchase']);
                }
                // Insert items for advances
                for (const a of advRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, amount, direction, description
             ) VALUES ($1, 'ADVANCE_RECOVERY', $2, $3::date, $4, 'DEBIT', $5);`, [billId, a.id, a.created_at, a.amount, a.description || 'Farmer Emergency Advance Recovery']);
                }
                // Insert items for deductions & mark customer_deductions
                for (const d of dedRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, amount, direction, description
             ) VALUES ($1, 'DEDUCTION', $2, $3::date, $4, 'DEBIT', $5);`, [billId, d.id, d.created_at, d.amount, d.description || `Deduction: ${d.deduction_category}`]);
                    await client.query(`UPDATE customer_deductions SET is_applied_to_bill = TRUE, applied_bill_id = $1 WHERE id = $2;`, [billId, d.id]);
                }
                // Insert items for settled payouts (customer_payments)
                for (const p of payoutRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, amount, direction, description
             ) VALUES ($1, 'SETTLED_PAYMENT', $2, COALESCE($3, NOW())::date, $4, 'DEBIT', $5);`, [billId, p.id, p.paid_at, p.amount, `Settled Payout ref: ${p.transaction_reference || p.id}`]);
                }
                // Insert items for settled payouts (ledger_transactions debit entries)
                for (const lp of ledgerPayoutRes.rows) {
                    await client.query(`INSERT INTO monthly_bill_items (
               bill_id, item_type, reference_id, item_date, amount, direction, description
             ) VALUES ($1, 'SETTLED_PAYMENT', $2, $3::date, $4, 'DEBIT', $5);`, [billId, lp.id, lp.created_at, lp.amount, lp.description || 'Settled Customer Payout']);
                }
                await client.query('COMMIT');
                // Enqueue monthly bill notification after commit
                NotificationService.enqueueNotification({
                    organizationId: period.organization_id,
                    centerId: period.center_id,
                    customerId: cust.id,
                    eventType: NotificationEventType.MONTHLY_BILL_GENERATED,
                    eventId: `evt_bill_${billId}`,
                    idempotencyKey: `notif_bill_${billId}`,
                    metadata: {
                        billId,
                        billNumber,
                        periodName: period.period_name,
                        totalMilkWeight,
                        grossMilkAmount,
                        totalDebits,
                        netPayableAmount,
                    },
                }).catch((e) => logger.error({ error: e.message }, 'Failed to enqueue bill notification'));
                billsGenerated++;
                periodGrossMilk += grossMilkAmount;
                periodNetPayable += netPayableAmount;
                periodTotalWeight += totalMilkWeight;
            }
            catch (custErr) {
                await client.query('ROLLBACK');
                failedCount++;
            }
            finally {
                client.release();
            }
        }
        // 4. Update Billing Period Totals & Status
        await pool.query(`UPDATE billing_periods SET
         total_farmers_billed = (SELECT COUNT(*) FROM monthly_bills WHERE billing_period_id = $1),
         total_milk_weight = (SELECT COALESCE(SUM(total_milk_weight), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         total_gross_milk_amount = (SELECT COALESCE(SUM(gross_milk_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         total_net_payable_amount = (SELECT COALESCE(SUM(net_payable_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         status = 'GENERATED',
         generated_at = NOW(),
         generated_by = $2,
         updated_at = NOW()
       WHERE id = $1;`, [periodId, auth.userId]);
        const durationMs = Date.now() - startTime;
        return {
            periodId,
            billsGenerated,
            failedCount,
            totalGrossMilkAmount: round2(periodGrossMilk),
            totalNetPayableAmount: round2(periodNetPayable),
            durationMs,
        };
    }
    /**
     * 6. Submit Bill for Review.
     */
    static async submitForReview(billId, _notes, _auth) {
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE id = $1;`, [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        if (bill.bill_status === 'FINALIZED') {
            throw new ConflictError(`Cannot submit a FINALIZED bill for review`);
        }
        const res = await pool.query(`UPDATE monthly_bills SET bill_status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1 RETURNING *;`, [billId]);
        // Update period status to UNDER_REVIEW if appropriate
        await pool.query(`UPDATE billing_periods SET status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1 AND status = 'GENERATED';`, [bill.billing_period_id]);
        return this.mapMonthlyBill(res.rows[0]);
    }
    /**
     * 7. Approve Bill.
     * Allowed roles: Center Manager, Dairy Owner, Super Admin.
     */
    static async approveBill(billId, _notes, auth) {
        const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER];
        if (!allowedRoles.includes(auth.role)) {
            throw new ForbiddenError(`Actor with role '${auth.role}' is not authorized to approve bills. Required: [${allowedRoles.join(', ')}]`, 'FORBIDDEN');
        }
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE id = $1;`, [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        if (bill.bill_status === 'FINALIZED') {
            throw new ConflictError(`Bill '${billId}' is already FINALIZED`);
        }
        const res = await pool.query(`UPDATE monthly_bills SET 
         bill_status = 'APPROVED', 
         approved_at = NOW(), 
         approved_by = $1, 
         updated_at = NOW() 
       WHERE id = $2 
       RETURNING *;`, [auth.userId, billId]);
        return this.mapMonthlyBill(res.rows[0]);
    }
    /**
     * 8. Finalize Bill.
     * Allowed roles: Dairy Owner, Super Admin.
     * Generates PDF, computes cryptographic hash, locks statement immutability.
     */
    static async finalizeBill(billId, _notes, auth) {
        const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER];
        if (!allowedRoles.includes(auth.role)) {
            throw new ForbiddenError(`Actor with role '${auth.role}' is not authorized to finalize bills. Only Dairy Owner or Super Admin may finalize.`, 'FORBIDDEN');
        }
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE id = $1;`, [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        if (bill.bill_status === 'FINALIZED') {
            throw new ConflictError(`Bill '${billId}' has already been finalized.`);
        }
        // Build statement summary for PDF generation
        const statement = await this.getCustomerStatementSummary(bill.customer_id, bill.billing_period_id);
        // Generate real PDF statement & SHA256 hash
        const pdfResult = await PdfStatementGenerator.generate({
            ...statement,
            bill: {
                ...statement.bill,
                billStatus: BillStatus.FINALIZED,
            },
        });
        // Update bill to FINALIZED
        const updateRes = await pool.query(`UPDATE monthly_bills SET
         bill_status = 'FINALIZED',
         pdf_storage_path = $1,
         pdf_sha256_hash = $2,
         finalized_at = NOW(),
         finalized_by = $3,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *;`, [pdfResult.storagePath, pdfResult.sha256Hash, auth.userId, billId]);
        // Check if all bills in this period are finalized
        const unfinalizedRes = await pool.query(`SELECT COUNT(*) FROM monthly_bills 
       WHERE billing_period_id = $1 AND bill_status <> 'FINALIZED';`, [bill.billing_period_id]);
        if (parseInt(unfinalizedRes.rows[0].count, 10) === 0) {
            // Finalize period & create bill_finalization_records
            await this.finalizePeriod(bill.billing_period_id, auth.userId);
        }
        return this.mapMonthlyBill(updateRes.rows[0]);
    }
    /**
     * Finalize the entire billing period and create cryptographic audit record.
     */
    static async finalizePeriod(periodId, finalizedByUserId) {
        const periodRes = await pool.query(`SELECT * FROM billing_periods WHERE id = $1 FOR UPDATE;`, [periodId]);
        if (periodRes.rows.length === 0)
            return;
        // Compute period snapshot checksum across all bill hashes and bill numbers
        const billsRes = await pool.query(`SELECT bill_number, pdf_sha256_hash, closing_balance, net_payable_amount
       FROM monthly_bills
       WHERE billing_period_id = $1
       ORDER BY bill_number ASC;`, [periodId]);
        const snapshotPayload = billsRes.rows
            .map(b => `${b.bill_number}:${b.pdf_sha256_hash}:${b.closing_balance}:${b.net_payable_amount}`)
            .join('|');
        const snapshotChecksum = crypto.createHash('sha256').update(snapshotPayload).digest('hex');
        // Insert into bill_finalization_records
        await pool.query(`INSERT INTO bill_finalization_records (
         billing_period_id, total_farmers_billed, total_gross_milk_amount, total_net_payout_amount,
         total_feed_deductions, total_advances_deductions, total_other_deductions, total_settled_payouts,
         snapshot_checksum, finalized_by, finalized_at
       ) VALUES (
         $1, 
         (SELECT COUNT(*) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(gross_milk_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(net_payable_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(feed_purchases_debit), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(advances_debit), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(deductions_debit + other_debits_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         (SELECT COALESCE(SUM(settled_payouts_amount), 0.00) FROM monthly_bills WHERE billing_period_id = $1),
         $2, $3, NOW()
       ) ON CONFLICT (billing_period_id) DO UPDATE SET
         snapshot_checksum = EXCLUDED.snapshot_checksum,
         finalized_at = NOW();`, [periodId, snapshotChecksum, finalizedByUserId]);
        // Update billing period status
        await pool.query(`UPDATE billing_periods SET
         status = 'FINALIZED',
         finalized_at = NOW(),
         finalized_by = $1,
         updated_at = NOW()
       WHERE id = $2;`, [finalizedByUserId, periodId]);
    }
    /**
     * 9. Adjust Bill (Controlled Audited Adjustment).
     * Authorized roles: Accountant, Center Manager, Dairy Owner, Super Admin.
     */
    static async adjustBill(billId, data, auth) {
        const allowedRoles = [
            UserRole.SUPER_ADMIN,
            UserRole.DAIRY_OWNER,
            UserRole.CENTER_MANAGER,
            UserRole.ACCOUNTANT,
        ];
        if (!allowedRoles.includes(auth.role)) {
            throw new ForbiddenError(`Actor with role '${auth.role}' is not authorized to adjust bills. Required: [${allowedRoles.join(', ')}]`, 'FORBIDDEN');
        }
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE id = $1 FOR UPDATE;`, [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        const adjAmount = round2(data.amount);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 1. Insert into monthly_bill_adjustments
            await client.query(`INSERT INTO monthly_bill_adjustments (
           bill_id, adjustment_type, amount, reason, authorized_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, NOW());`, [billId, data.adjustmentType, adjAmount, data.reason, auth.userId]);
            // 2. Insert item into monthly_bill_items
            await client.query(`INSERT INTO monthly_bill_items (
           bill_id, item_type, item_date, amount, direction, description
         ) VALUES ($1, 'LEDGER_ADJUSTMENT', CURRENT_DATE, $2, $3, $4);`, [billId, adjAmount, data.adjustmentType, `Bill Adjustment: ${data.reason}`]);
            // 3. Recalculate bill balance
            let newCredits = Number(bill.total_credits);
            let newDebits = Number(bill.total_debits);
            let otherCredits = Number(bill.other_credits_amount);
            let otherDebits = Number(bill.other_debits_amount);
            if (data.adjustmentType === 'CREDIT') {
                otherCredits = round2(otherCredits + adjAmount);
                newCredits = round2(newCredits + adjAmount);
            }
            else {
                otherDebits = round2(otherDebits + adjAmount);
                newDebits = round2(newDebits + adjAmount);
            }
            const opBal = Number(bill.opening_balance);
            const settled = Number(bill.settled_payouts_amount);
            const newClosing = round2(opBal + newCredits - newDebits - settled);
            const isNeg = newClosing < 0;
            const netPayable = isNeg ? 0.00 : newClosing;
            const newVersion = bill.version + 1;
            const updateRes = await client.query(`UPDATE monthly_bills SET
           other_credits_amount = $1,
           total_credits = $2,
           other_debits_amount = $3,
           total_debits = $4,
           closing_balance = $5,
           net_payable_amount = $6,
           is_negative_balance = $7,
           bill_status = 'CORRECTION_REQUIRED',
           version = $8,
           updated_at = NOW()
         WHERE id = $9
         RETURNING *;`, [
                otherCredits,
                newCredits,
                otherDebits,
                newDebits,
                newClosing,
                netPayable,
                isNeg,
                newVersion,
                billId,
            ]);
            await client.query('COMMIT');
            return this.mapMonthlyBill(updateRes.rows[0]);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 10. Get Customer Statement Summary.
     * Enforces customer ownership: Customer A cannot access Customer B's statement.
     */
    static async getCustomerStatement(customerId, periodId, auth) {
        // Customer isolation check
        if (auth.actorType === 'CUSTOMER') {
            const allowedCustId = auth.customerProfile?.customerId || auth.userId;
            if (allowedCustId !== customerId) {
                throw new ForbiddenError('Customer accounts may only access their own profile and records', 'CUSTOMER_ISOLATION_VIOLATION');
            }
        }
        // Resolve periodId if omitted (default to latest period for customer's center)
        let resolvedPeriodId = periodId;
        if (!resolvedPeriodId) {
            const custCenterRes = await pool.query(`SELECT primary_center_id FROM customers WHERE id = $1;`, [customerId]);
            if (custCenterRes.rows.length === 0) {
                throw new NotFoundError(`Customer '${customerId}' was not found`);
            }
            const centerId = custCenterRes.rows[0].primary_center_id;
            const latestPeriodRes = await pool.query(`SELECT id FROM billing_periods 
         WHERE center_id = $1 
         ORDER BY start_date DESC LIMIT 1;`, [centerId]);
            if (latestPeriodRes.rows.length === 0) {
                throw new NotFoundError(`No billing periods found for center '${centerId}'`);
            }
            resolvedPeriodId = latestPeriodRes.rows[0].id;
        }
        return this.getCustomerStatementSummary(customerId, resolvedPeriodId);
    }
    /**
     * Internal helper to build CustomerStatementSummary data structure.
     */
    static async getCustomerStatementSummary(customerId, periodId) {
        // 1. Fetch Period
        const periodRes = await pool.query(`SELECT * FROM billing_periods WHERE id = $1;`, [periodId]);
        if (periodRes.rows.length === 0) {
            throw new NotFoundError(`Billing period '${periodId}' was not found`);
        }
        const period = periodRes.rows[0];
        // 2. Fetch Customer & Center & Org
        const custRes = await pool.query(`SELECT c.*, dc.name as center_name, dc.code as center_code, o.name as org_name
       FROM customers c
       JOIN dairy_centers dc ON dc.id = c.primary_center_id
       JOIN organizations o ON o.id = c.organization_id
       WHERE c.id = $1;`, [customerId]);
        if (custRes.rows.length === 0) {
            throw new NotFoundError(`Customer '${customerId}' was not found`);
        }
        const cust = custRes.rows[0];
        // Mask mobile number: e.g. +91 98*** **234
        const rawMobile = cust.normalized_mobile_number || '';
        const maskedMobile = rawMobile.length > 7
            ? `${rawMobile.slice(0, 5)}****${rawMobile.slice(-3)}`
            : '****';
        // 3. Fetch or construct Bill
        let bill;
        let items = [];
        let adjustments = [];
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE customer_id = $1 AND billing_period_id = $2;`, [customerId, periodId]);
        if (billRes.rows.length > 0) {
            bill = this.mapMonthlyBill(billRes.rows[0]);
            // Items
            const itemsRes = await pool.query(`SELECT * FROM monthly_bill_items WHERE bill_id = $1 ORDER BY item_date ASC, created_at ASC;`, [bill.id]);
            items = itemsRes.rows.map(r => this.mapMonthlyBillItem(r));
            // Adjustments
            const adjRes = await pool.query(`SELECT * FROM monthly_bill_adjustments WHERE bill_id = $1 ORDER BY created_at ASC;`, [bill.id]);
            adjustments = adjRes.rows.map(r => ({
                id: r.id,
                billId: r.bill_id,
                adjustmentType: r.adjustment_type,
                amount: Number(r.amount),
                reason: r.reason,
                authorizedBy: r.authorized_by,
                createdAt: r.created_at,
            }));
        }
        else {
            // Real-time preview calculation if not yet persisted in monthly_bills
            const preview = await this.calculateCustomerStatementPreview(customerId, period);
            bill = preview.bill;
            items = preview.items;
        }
        return {
            bill,
            customer: {
                id: cust.id,
                farmerCode: cust.farmer_code,
                fullName: cust.full_name,
                mobileNumber: cust.normalized_mobile_number,
                maskedMobileNumber: maskedMobile,
                bankName: cust.bank_name,
                bankAccountNumber: cust.bank_account_number,
                bankIfscCode: cust.bank_ifsc_code,
            },
            period: this.mapBillingPeriod(period),
            dairy: {
                organizationName: cust.org_name,
                centerName: cust.center_name,
                centerCode: cust.center_code,
            },
            milkBreakdown: {
                cow: {
                    totalQuantityKg: bill.totalCowMilkWeight,
                    collectionsCount: bill.cowCollectionsCount,
                    totalAmount: bill.totalCowMilkAmount,
                },
                buffalo: {
                    totalQuantityKg: bill.totalBuffaloMilkWeight,
                    collectionsCount: bill.buffaloCollectionsCount,
                    totalAmount: bill.totalBuffaloMilkAmount,
                },
                totalQuantityKg: bill.totalMilkWeight,
                totalCollectionsCount: bill.totalMilkCollectionsCount,
                totalAmount: bill.grossMilkAmount,
            },
            items,
            adjustments,
        };
    }
    /**
     * Helper to calculate a customer statement preview without saving to database.
     */
    static async calculateCustomerStatementPreview(customerId, period) {
        // A. Opening balance
        const opBalRes = await pool.query(`SELECT balance_after 
       FROM ledger_transactions 
       WHERE customer_id = $1 
         AND created_at < $2::date
       ORDER BY created_at DESC, id DESC 
       LIMIT 1;`, [customerId, period.start_date]);
        const openingBalance = opBalRes.rows.length > 0 ? Number(opBalRes.rows[0].balance_after) : 0.00;
        // B. Milk collections
        const milkRes = await pool.query(`SELECT id, business_date, shift_type, milk_category, net_weight, measurement_unit,
              fat_percentage, snf_percentage, applied_rate_per_unit, total_amount, created_at
       FROM milk_collections
       WHERE customer_id = $1 
         AND center_id = $2
         AND business_date >= $3::date 
         AND business_date <= $4::date
         AND transaction_status = 'COMPLETED'
       ORDER BY business_date ASC, shift_type ASC;`, [customerId, period.center_id, period.start_date, period.end_date]);
        let totalCowWeight = 0;
        let totalCowAmount = 0;
        let cowCount = 0;
        let totalBufWeight = 0;
        let totalBufAmount = 0;
        let bufCount = 0;
        const items = [];
        for (const m of milkRes.rows) {
            const w = Number(m.net_weight);
            const amt = Number(m.total_amount);
            if (m.milk_category === 'COW') {
                totalCowWeight += w;
                totalCowAmount += amt;
                cowCount++;
            }
            else {
                totalBufWeight += w;
                totalBufAmount += amt;
                bufCount++;
            }
            items.push({
                id: m.id,
                billId: 'preview',
                itemType: BillItemType.MILK_COLLECTION,
                referenceId: m.id,
                itemDate: m.business_date instanceof Date ? m.business_date.toISOString().slice(0, 10) : String(m.business_date),
                shiftType: m.shift_type,
                milkCategory: m.milk_category,
                quantity: w,
                measurementUnit: m.measurement_unit || 'KG',
                fatPercentage: m.fat_percentage ? Number(m.fat_percentage) : null,
                snfPercentage: m.snf_percentage ? Number(m.snf_percentage) : null,
                ratePerUnit: m.applied_rate_per_unit ? Number(m.applied_rate_per_unit) : null,
                amount: amt,
                direction: 'CREDIT',
                description: `${m.milk_category} Milk Collection (${m.shift_type})`,
                createdAt: m.created_at,
            });
        }
        totalCowWeight = round2(totalCowWeight);
        totalCowAmount = round2(totalCowAmount);
        totalBufWeight = round2(totalBufWeight);
        totalBufAmount = round2(totalBufAmount);
        const totalMilkWeight = round2(totalCowWeight + totalBufWeight);
        const grossMilkAmount = round2(totalCowAmount + totalBufAmount);
        // C. Debits
        const feedRes = await pool.query(`SELECT COALESCE(SUM(amount), 0.00) as sum FROM ledger_transactions
       WHERE customer_id = $1 AND center_id = $2
         AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day')
         AND transaction_type = 'FEED_PURCHASE_DEBIT';`, [customerId, period.center_id, period.start_date, period.end_date]);
        const feedDebit = round2(Number(feedRes.rows[0].sum));
        const advRes = await pool.query(`SELECT COALESCE(SUM(amount), 0.00) as sum FROM ledger_transactions
       WHERE customer_id = $1 AND center_id = $2
         AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day')
         AND transaction_type = 'ADVANCE_DEBIT';`, [customerId, period.center_id, period.start_date, period.end_date]);
        const advancesDebit = round2(Number(advRes.rows[0].sum));
        const dedRes = await pool.query(`SELECT COALESCE(SUM(amount), 0.00) as sum FROM customer_deductions
       WHERE customer_id = $1 AND center_id = $2
         AND (
           (created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day'))
           OR (is_applied_to_bill = FALSE AND created_at < ($4::date + INTERVAL '1 day'))
         );`, [customerId, period.center_id, period.start_date, period.end_date]);
        const deductionsDebit = round2(Number(dedRes.rows[0].sum));
        // Settled Payouts (Unified single source of truth across customer_payments and ledger debits)
        const payoutRes = await pool.query(`SELECT COALESCE(SUM(amount), 0.00) as sum FROM customer_payments
       WHERE customer_id = $1 AND center_id = $2
         AND payment_status IN ('SUCCESSFUL', 'RECONCILED')
         AND (
           (paid_at >= $3::date AND paid_at < ($4::date + INTERVAL '1 day'))
           OR (paid_at IS NULL AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day'))
         );`, [customerId, period.center_id, period.start_date, period.end_date]);
        const ledgerPayoutRes = await pool.query(`SELECT COALESCE(SUM(amount), 0.00) as sum
       FROM ledger_transactions
       WHERE customer_id = $1 
         AND center_id = $2
         AND created_at >= $3::date 
         AND created_at < ($4::date + INTERVAL '1 day')
         AND transaction_type = 'PAYMENT_PAYOUT_DEBIT'
         AND reference_id NOT IN (
           SELECT id FROM customer_payments WHERE customer_id = $1
         );`, [customerId, period.center_id, period.start_date, period.end_date]);
        const settledPayouts = round2(Number(payoutRes.rows[0].sum) + Number(ledgerPayoutRes.rows[0].sum));
        const totalCredits = grossMilkAmount;
        const totalDebits = round2(feedDebit + advancesDebit + deductionsDebit);
        const closingBalance = round2(openingBalance + totalCredits - totalDebits - settledPayouts);
        const isNegativeBalance = closingBalance < 0;
        const netPayableAmount = isNegativeBalance ? 0.00 : closingBalance;
        const bill = {
            id: 'preview',
            billingPeriodId: period.id,
            customerId,
            centerId: period.center_id,
            organizationId: period.organization_id,
            billNumber: `PREVIEW-${customerId.slice(0, 8)}`,
            billStatus: BillStatus.DRAFT,
            openingBalance,
            totalCowMilkWeight: totalCowWeight,
            totalCowMilkAmount: totalCowAmount,
            cowCollectionsCount: cowCount,
            totalBuffaloMilkWeight: totalBufWeight,
            totalBuffaloMilkAmount: totalBufAmount,
            buffaloCollectionsCount: bufCount,
            totalMilkCollectionsCount: cowCount + bufCount,
            totalMilkWeight,
            grossMilkAmount,
            otherCreditsAmount: 0.00,
            totalCredits,
            feedPurchasesDebit: feedDebit,
            advancesDebit,
            deductionsDebit,
            otherDebitsAmount: 0.00,
            totalDebits,
            settledPayoutsAmount: settledPayouts,
            closingBalance,
            netPayableAmount,
            isNegativeBalance,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        return { bill, items };
    }
    /**
     * 11. Fetch or generate PDF statement for a bill.
     */
    static async getPdfStatement(billId, auth) {
        const billRes = await pool.query(`SELECT * FROM monthly_bills WHERE id = $1;`, [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        // Customer isolation check
        if (auth.actorType === 'CUSTOMER') {
            const allowedCustId = auth.customerProfile?.customerId || auth.userId;
            if (allowedCustId !== bill.customer_id) {
                throw new ForbiddenError('Customer accounts may only access their own statement PDFs', 'CUSTOMER_ISOLATION_VIOLATION');
            }
        }
        else {
            // Staff center check
            if (auth.role !== UserRole.SUPER_ADMIN &&
                auth.role !== UserRole.DAIRY_OWNER &&
                !auth.centerIds.includes(bill.center_id)) {
                throw new ForbiddenError(`Actor does not have access to center '${bill.center_id}'`);
            }
        }
        // If PDF already in durable or local storage, read it
        if (bill.pdf_storage_path) {
            const buffer = await DurableStatementStorage.getStatementBuffer(bill.pdf_storage_path);
            if (buffer) {
                const hash = bill.pdf_sha256_hash || crypto.createHash('sha256').update(buffer).digest('hex');
                return {
                    buffer,
                    filename: `${bill.bill_number}.pdf`,
                    sha256Hash: hash,
                };
            }
        }
        // Generate on the fly
        const statement = await this.getCustomerStatementSummary(bill.customer_id, bill.billing_period_id);
        const genResult = await PdfStatementGenerator.generate(statement);
        // Save hash and path
        await pool.query(`UPDATE monthly_bills SET pdf_storage_path = $1, pdf_sha256_hash = $2 WHERE id = $3;`, [genResult.storagePath, genResult.sha256Hash, billId]);
        return {
            buffer: genResult.buffer,
            filename: `${bill.bill_number}.pdf`,
            sha256Hash: genResult.sha256Hash,
        };
    }
    /**
     * Generates a short-lived authorized download link for a finalized statement.
     */
    static async getSignedStatementDownloadUrl(billId, auth, expiresInSeconds = 900) {
        const billRes = await pool.query('SELECT * FROM monthly_bills WHERE id = $1;', [billId]);
        if (billRes.rows.length === 0) {
            throw new NotFoundError(`Bill '${billId}' not found`);
        }
        const bill = billRes.rows[0];
        // Access check
        if (auth.actorType === 'CUSTOMER') {
            if (bill.customer_id !== auth.userId) {
                throw new ForbiddenError('Customer cannot access statements of other customers');
            }
        }
        else {
            if (auth.role !== UserRole.SUPER_ADMIN &&
                auth.role !== UserRole.DAIRY_OWNER &&
                !auth.centerIds.includes(bill.center_id)) {
                throw new ForbiddenError(`Actor does not have access to center '${bill.center_id}'`);
            }
        }
        if (!bill.pdf_storage_path) {
            // Generate statement first if missing
            await this.getPdfStatement(billId, auth);
            const reloaded = await pool.query('SELECT pdf_storage_path FROM monthly_bills WHERE id = $1;', [billId]);
            bill.pdf_storage_path = reloaded.rows[0]?.pdf_storage_path;
        }
        if (bill.pdf_storage_path) {
            return DurableStatementStorage.getSignedDownloadUrl(bill.pdf_storage_path, expiresInSeconds);
        }
        return null;
    }
    /**
     * Mapper helper for BillingPeriod.
     */
    static mapBillingPeriod(r) {
        return {
            id: r.id,
            organizationId: r.organization_id,
            centerId: r.center_id,
            periodName: r.period_name,
            startDate: r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date),
            endDate: r.end_date instanceof Date ? r.end_date.toISOString().slice(0, 10) : String(r.end_date),
            cycleType: r.cycle_type,
            status: r.status,
            totalFarmersBilled: parseInt(r.total_farmers_billed || '0', 10),
            totalMilkWeight: Number(r.total_milk_weight || 0),
            totalGrossMilkAmount: Number(r.total_gross_milk_amount || 0),
            totalNetPayableAmount: Number(r.total_net_payable_amount || 0),
            generatedAt: r.generated_at,
            generatedBy: r.generated_by,
            approvedAt: r.approved_at,
            approvedBy: r.approved_by,
            finalizedAt: r.finalized_at,
            finalizedBy: r.finalized_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
    /**
     * Mapper helper for MonthlyBill.
     */
    static mapMonthlyBill(r) {
        return {
            id: r.id,
            billingPeriodId: r.billing_period_id,
            customerId: r.customer_id,
            centerId: r.center_id,
            organizationId: r.organization_id,
            billNumber: r.bill_number,
            billStatus: r.bill_status,
            openingBalance: Number(r.opening_balance),
            totalCowMilkWeight: Number(r.total_cow_milk_weight),
            totalCowMilkAmount: Number(r.total_cow_milk_amount),
            cowCollectionsCount: parseInt(r.cow_collections_count || '0', 10),
            totalBuffaloMilkWeight: Number(r.total_buffalo_milk_weight),
            totalBuffaloMilkAmount: Number(r.total_buffalo_milk_amount),
            buffaloCollectionsCount: parseInt(r.buffalo_collections_count || '0', 10),
            totalMilkCollectionsCount: parseInt(r.total_milk_collections_count || '0', 10),
            totalMilkWeight: Number(r.total_milk_weight),
            grossMilkAmount: Number(r.gross_milk_amount),
            otherCreditsAmount: Number(r.other_credits_amount),
            totalCredits: Number(r.total_credits),
            feedPurchasesDebit: Number(r.feed_purchases_debit),
            advancesDebit: Number(r.advances_debit),
            deductionsDebit: Number(r.deductions_debit),
            otherDebitsAmount: Number(r.other_debits_amount),
            totalDebits: Number(r.total_debits),
            settledPayoutsAmount: Number(r.settled_payouts_amount),
            closingBalance: Number(r.closing_balance),
            netPayableAmount: Number(r.net_payable_amount),
            isNegativeBalance: Boolean(r.is_negative_balance),
            pdfStoragePath: r.pdf_storage_path,
            pdfSha256Hash: r.pdf_sha256_hash,
            generatedAt: r.generated_at,
            generatedBy: r.generated_by,
            approvedAt: r.approved_at,
            approvedBy: r.approved_by,
            finalizedAt: r.finalized_at,
            finalizedBy: r.finalized_by,
            version: parseInt(r.version || '1', 10),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
    /**
     * Mapper helper for MonthlyBillItem.
     */
    static mapMonthlyBillItem(r) {
        return {
            id: r.id,
            billId: r.bill_id,
            itemType: r.item_type,
            referenceId: r.reference_id,
            itemDate: r.item_date instanceof Date ? r.item_date.toISOString().slice(0, 10) : String(r.item_date),
            shiftType: r.shift_type,
            milkCategory: r.milk_category,
            quantity: Number(r.quantity),
            measurementUnit: r.measurement_unit || 'KG',
            fatPercentage: r.fat_percentage ? Number(r.fat_percentage) : null,
            snfPercentage: r.snf_percentage ? Number(r.snf_percentage) : null,
            ratePerUnit: r.rate_per_unit ? Number(r.rate_per_unit) : null,
            amount: Number(r.amount),
            direction: r.direction,
            description: r.description,
            createdAt: r.created_at,
        };
    }
}
//# sourceMappingURL=billing.service.js.map