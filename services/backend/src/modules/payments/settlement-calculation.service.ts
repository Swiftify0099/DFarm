// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// FARMER MILK SETTLEMENT & PAYABLE CALCULATION SERVICE (PROMPT 7)
// ==============================================================================

import crypto from 'node:crypto';
import { query } from '../../config/db.js';
import { BadRequestError, ForbiddenError } from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';

export interface CalculationPeriodParams {
  organizationId: string;
  centerId?: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  customerIds?: string[];
  excludeUnverifiedBankDetails?: boolean;
}

export interface FarmerPayableItem {
  customerId: string;
  farmerCode: string;
  fullName: string;
  centerId: string;
  centerName?: string;
  bankName: string | null;
  bankAccountNumberMask: string | null;
  bankIfsc: string | null;
  bankVerificationStatus: string;
  beneficiaryStatus: string;
  isBankValid: boolean;
  hasBankValidationWarning: boolean;
  bankValidationErrors: string[];
  
  // Financial breakdown (PostgreSQL NUMERIC rounded to 2 decimals)
  openingBalance: number;
  grossMilkAmount: number;
  milkQuantityLiters: number;
  collectionCount: number;
  deductionsAmount: number;
  adjustmentsCredit: number;
  adjustmentsDebit: number;
  alreadyPaidAmount: number;
  pendingReservedAmount: number;
  netPayableAmount: number;
  remainingBalance: number;

  // Source Traceability IDs
  sourceLedgerTransactionIds: string[];
  sourceCollectionIds: string[];
}

export interface CentreTotalSummary {
  centerId: string;
  centerName: string;
  centerCode: string;
  farmerCount: number;
  eligibleCount: number;
  totalMilkQuantity: number;
  totalGrossPayable: number;
  totalDeductions: number;
  totalNetPayable: number;
  totalAlreadyPaid: number;
  totalRemainingBalance: number;
}

export interface SettlementCalculationResult {
  organizationId: string;
  centerId: string | null;
  periodStart: string;
  periodEnd: string;
  calculatedAt: string;
  calculationSnapshotHash: string;
  
  // High-level aggregates
  totalFarmers: number;
  totalEligibleFarmers: number;
  totalMilkQuantityLiters: number;
  totalGrossPayable: number;
  totalDeductions: number;
  totalNetPayable: number;
  totalAlreadyPaid: number;
  totalRemainingBalance: number;
  
  // Validation Warnings
  warningsCount: number;
  farmersWithInvalidBankCount: number;

  // Granular breakdowns
  centerBreakdowns: CentreTotalSummary[];
  farmers: FarmerPayableItem[];
}

export class SettlementCalculationService {
  /**
   * Calculates farmer milk settlement payables using authoritative posted PostgreSQL ledger entries.
   * Enforces exact DECIMAL/NUMERIC arithmetic and multi-center / multi-tenant isolation.
   */
  public static async calculateSettlement(
    params: CalculationPeriodParams,
    _auth?: AuthContext
  ): Promise<SettlementCalculationResult> {
    const { organizationId, centerId, periodStart, periodEnd, customerIds } = params;

    if (!periodStart || !periodEnd) {
      throw new BadRequestError('Both periodStart and periodEnd dates are required (YYYY-MM-DD)', 'INVALID_SETTLEMENT_PERIOD');
    }
    if (new Date(periodStart) > new Date(periodEnd)) {
      throw new BadRequestError('periodStart cannot be after periodEnd', 'INVALID_DATE_RANGE');
    }

    // 1. Fetch eligible customers matching org and optional center/customerIds
    let custSql = `
      SELECT 
        c.id, c.farmer_code, c.full_name, c.primary_center_id, c.bank_name,
        c.bank_account_number, c.bank_ifsc_code, c.bank_account_holder_name,
        COALESCE(c.bank_verification_status, 'UNVERIFIED') as bank_verification_status,
        COALESCE(c.beneficiary_status, 'ACTIVE') as beneficiary_status,
        dc.name as center_name, dc.code as center_code
      FROM customers c
      JOIN dairy_centers dc ON dc.id = c.primary_center_id
      WHERE c.organization_id = $1 AND c.is_deleted = FALSE AND c.status = 'ACTIVE'
    `;
    const custArgs: any[] = [organizationId];

    if (centerId) {
      const centerCheck = await query(
        'SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2;',
        [centerId, organizationId]
      );
      if (centerCheck.rows.length === 0) {
        throw new ForbiddenError(
          `Center '${centerId}' does not belong to organization '${organizationId}'`,
          'CROSS_CENTER_ACCESS_DENIED'
        );
      }
      custArgs.push(centerId);
      custSql += ` AND c.primary_center_id = $${custArgs.length}`;
    }

    if (params.excludeUnverifiedBankDetails) {
      custSql += ` AND COALESCE(c.bank_verification_status, 'UNVERIFIED') = 'VERIFIED'`;
    }

    if (customerIds && customerIds.length > 0) {
      const placeholders = customerIds.map(id => {
        custArgs.push(id);
        return `$${custArgs.length}`;
      }).join(', ');
      custSql += ` AND c.id IN (${placeholders})`;
    }

    custSql += ` ORDER BY dc.name ASC, c.farmer_code ASC;`;

    const customersRes = await query(custSql, custArgs);
    const customers = customersRes.rows;

    if (customers.length === 0) {
      return {
        organizationId,
        centerId: centerId || null,
        periodStart,
        periodEnd,
        calculatedAt: new Date().toISOString(),
        calculationSnapshotHash: crypto.createHash('sha256').update(JSON.stringify({ empty: true })).digest('hex'),
        totalFarmers: 0,
        totalEligibleFarmers: 0,
        totalMilkQuantityLiters: 0,
        totalGrossPayable: 0,
        totalDeductions: 0,
        totalNetPayable: 0,
        totalAlreadyPaid: 0,
        totalRemainingBalance: 0,
        warningsCount: 0,
        farmersWithInvalidBankCount: 0,
        centerBreakdowns: [],
        farmers: [],
      };
    }

    // 2. Perform authoritative PostgreSQL ledger calculation per customer for selected period
    // The payable calculation considers:
    // - Verified milk collection credits between periodStart and periodEnd
    // - Deductions (Feed, Advances, Veterinary, Cooperative deductions) between periodStart and periodEnd
    // - Adjustments between periodStart and periodEnd
    // - Opening balance prior to periodStart
    // - Previous payments settled within period
    // - Currently active batch reservations (status IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED', 'PROCESSING'))
    const calcQuery = `
      WITH period_collections AS (
        SELECT 
          mc.customer_id,
          COALESCE(SUM(mc.total_amount), 0.00)::numeric(12,2) AS milk_gross_amount,
          COALESCE(SUM(COALESCE(mc.volume_liters, mc.net_weight)), 0.00)::numeric(12,2) AS milk_liters,
          COUNT(mc.id)::int AS collection_count,
          COALESCE(json_agg(mc.id::text) FILTER (WHERE mc.id IS NOT NULL), '[]'::json) AS collection_ids
        FROM milk_collections mc
        WHERE mc.organization_id = $1
          AND mc.business_date >= $2::date
          AND mc.business_date <= $3::date
          AND mc.transaction_status = 'COMPLETED'
        GROUP BY mc.customer_id
      ),
      period_ledger_txns AS (
        SELECT 
          lt.customer_id,
          -- Verified milk collection credits
          COALESCE(SUM(CASE WHEN lt.transaction_type IN ('MILK_COLLECTION_CREDIT', 'CUSTOMER_INCENTIVE_CREDIT') THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS credit_milk_incentives,
          -- Deductions: Feed, Advances, Veterinary
          COALESCE(SUM(CASE WHEN lt.transaction_type IN ('FEED_PURCHASE_DEBIT', 'CUSTOMER_ADVANCE_DEBIT', 'ADVANCE_DEBIT', 'AUTHORIZED_DEDUCTION_DEBIT', 'DEDUCTION_DEBIT') THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS debit_deductions,
          -- Adjustments
          COALESCE(SUM(CASE WHEN lt.transaction_type IN ('APPROVED_ADJUSTMENT_CREDIT', 'LEDGER_ADJUSTMENT_CREDIT') THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS credit_adjustments,
          COALESCE(SUM(CASE WHEN lt.transaction_type IN ('APPROVED_ADJUSTMENT_DEBIT', 'LEDGER_ADJUSTMENT_DEBIT', 'COLLECTION_REVERSAL_DEBIT') THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS debit_adjustments,
          -- Already paid within this period
          COALESCE(SUM(CASE WHEN lt.transaction_type IN ('PAYMENT_PAYOUT_DEBIT', 'PAYOUT_SETTLEMENT_DEBIT') THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS already_paid_period,
          -- Compensating reversals
          COALESCE(SUM(CASE WHEN lt.transaction_type = 'PAYOUT_REVERSAL_CREDIT' THEN lt.amount ELSE 0.00 END), 0.00)::numeric(12,2) AS payout_reversals,
          COALESCE(json_agg(lt.id::text) FILTER (WHERE lt.id IS NOT NULL), '[]'::json) AS txn_ids
        FROM ledger_transactions lt
        WHERE lt.organization_id = $1
          AND lt.created_at >= ($2::date)::timestamptz
          AND lt.created_at <= (($3::date + 1)::timestamptz - interval '1 microsecond')
        GROUP BY lt.customer_id
      ),
      opening_ledger_balance AS (
        -- Net posted balance prior to periodStart
        SELECT 
          lt.customer_id,
          COALESCE(SUM(CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END), 0.00)::numeric(12,2) AS opening_balance
        FROM ledger_transactions lt
        WHERE lt.organization_id = $1
          AND lt.created_at < ($2::date)::timestamptz
        GROUP BY lt.customer_id
      ),
      active_batch_reservations AS (
        -- Payouts currently reserved in other active batches not yet settled or cancelled
        SELECT 
          cp.customer_id,
          COALESCE(SUM(cp.amount), 0.00)::numeric(12,2) AS pending_reserved
        FROM customer_payouts cp
        WHERE cp.organization_id = $1
          AND cp.status IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING')
        GROUP BY cp.customer_id
      )
      SELECT 
        c.id AS customer_id,
        COALESCE(olb.opening_balance, 0.00)::numeric(12,2) AS opening_balance,
        -- Gross milk amount: take collection sum, or ledger credit sum if collections unavailable
        GREATEST(
          COALESCE(pc.milk_gross_amount, 0.00),
          COALESCE(plt.credit_milk_incentives, 0.00)
        )::numeric(12,2) AS gross_milk_amount,
        COALESCE(pc.milk_liters, 0.00)::numeric(12,2) AS milk_quantity_liters,
        COALESCE(pc.collection_count, 0)::int AS collection_count,
        COALESCE(plt.debit_deductions, 0.00)::numeric(12,2) AS deductions_amount,
        (COALESCE(plt.credit_adjustments, 0.00) + COALESCE(plt.payout_reversals, 0.00))::numeric(12,2) AS adjustments_credit,
        COALESCE(plt.debit_adjustments, 0.00)::numeric(12,2) AS adjustments_debit,
        COALESCE(plt.already_paid_period, 0.00)::numeric(12,2) AS already_paid_amount,
        COALESCE(abr.pending_reserved, 0.00)::numeric(12,2) AS pending_reserved_amount,
        COALESCE(pc.collection_ids, '[]'::json) AS collection_ids,
        COALESCE(plt.txn_ids, '[]'::json) AS txn_ids
      FROM customers c
      LEFT JOIN opening_ledger_balance olb ON olb.customer_id = c.id
      LEFT JOIN period_collections pc ON pc.customer_id = c.id
      LEFT JOIN period_ledger_txns plt ON plt.customer_id = c.id
      LEFT JOIN active_batch_reservations abr ON abr.customer_id = c.id
      WHERE c.organization_id = $1
    `;

    const calcRes = await query(calcQuery, [organizationId, periodStart, periodEnd]);
    const calcMap = new Map<string, any>();
    for (const row of calcRes.rows) {
      calcMap.set(row.customer_id, row);
    }

    // 3. Process each customer, format banking information, validate IFSC, and compute net payables
    const farmerItems: FarmerPayableItem[] = [];
    const centerMap = new Map<string, CentreTotalSummary>();
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let totalLiters = 0;
    let warningsCount = 0;
    let invalidBankCount = 0;
    let eligibleCount = 0;

    for (const cust of customers) {
      const calc = calcMap.get(cust.id) || {
        opening_balance: 0.00,
        gross_milk_amount: 0.00,
        milk_quantity_liters: 0.00,
        collection_count: 0,
        deductions_amount: 0.00,
        adjustments_credit: 0.00,
        adjustments_debit: 0.00,
        already_paid_amount: 0.00,
        pending_reserved_amount: 0.00,
        collection_ids: [],
        txn_ids: [],
      };

      const openingBalance = Number(calc.opening_balance);
      const grossMilkAmount = Number(calc.gross_milk_amount);
      const milkLiters = Number(calc.milk_quantity_liters);
      const collectionCount = Number(calc.collection_count);
      const deductionsAmount = Number(calc.deductions_amount);
      const adjustmentsCredit = Number(calc.adjustments_credit);
      const adjustmentsDebit = Number(calc.adjustments_debit);
      const alreadyPaidAmount = Number(calc.already_paid_amount);
      const pendingReservedAmount = Number(calc.pending_reserved_amount);

      // Total gross credit = opening balance + gross milk + credit adjustments
      const totalCredit = openingBalance + grossMilkAmount + adjustmentsCredit;
      // Total charges = deductions + debit adjustments
      const totalCharges = deductionsAmount + adjustmentsDebit;

      // Net payable = total credit - total charges - already paid in period - pending reserved in other active batches
      const rawNet = totalCredit - totalCharges - alreadyPaidAmount - pendingReservedAmount;
      const netPayable = Math.max(0.00, Math.round((rawNet + Number.EPSILON) * 100) / 100);

      // Remaining balance reflects cumulative ledger balance minus current reservation
      const remainingBalance = Math.round(((totalCredit - totalCharges - alreadyPaidAmount - netPayable) + Number.EPSILON) * 100) / 100;

      // Validate Bank Details
      const bankErrors: string[] = [];
      const cleanAccount = (cust.bank_account_number || '').trim().replace(/[^0-9]/g, '');
      const cleanIfsc = (cust.bank_ifsc_code || '').trim().toUpperCase();

      if (!cleanAccount) {
        bankErrors.push('Missing bank account number');
      } else if (cleanAccount.length < 9 || cleanAccount.length > 18) {
        bankErrors.push(`Invalid account number length (${cleanAccount.length} digits; expected 9 to 18 digits)`);
      }

      if (!cleanIfsc) {
        bankErrors.push('Missing IFSC code');
      } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        bankErrors.push(`Invalid IFSC format '${cleanIfsc}' (expected 4 letters, '0', 6 alphanumeric characters)`);
      }

      if (cust.beneficiary_status !== 'ACTIVE') {
        bankErrors.push(`Beneficiary status is ${cust.beneficiary_status}`);
      }

      const isBankValid = bankErrors.length === 0;
      if (!isBankValid) {
        invalidBankCount++;
        warningsCount += bankErrors.length;
      }

      const mask = cleanAccount.length >= 4
        ? 'XXXX-XXXX-' + cleanAccount.slice(-4)
        : (cleanAccount ? 'XXXX-' + cleanAccount : null);

      if (netPayable > 0.00 && isBankValid) {
        eligibleCount++;
      }

      const item: FarmerPayableItem = {
        customerId: cust.id,
        farmerCode: cust.farmer_code,
        fullName: cust.full_name,
        centerId: cust.primary_center_id,
        centerName: cust.center_name,
        bankName: cust.bank_name || null,
        bankAccountNumberMask: mask,
        bankIfsc: cleanIfsc || null,
        bankVerificationStatus: cust.bank_verification_status || 'UNVERIFIED',
        beneficiaryStatus: cust.beneficiary_status || 'ACTIVE',
        isBankValid,
        hasBankValidationWarning: !isBankValid || cust.bank_verification_status !== 'VERIFIED',
        bankValidationErrors: bankErrors,
        openingBalance,
        grossMilkAmount,
        milkQuantityLiters: milkLiters,
        collectionCount,
        deductionsAmount,
        adjustmentsCredit,
        adjustmentsDebit,
        alreadyPaidAmount,
        pendingReservedAmount,
        netPayableAmount: netPayable,
        remainingBalance,
        sourceLedgerTransactionIds: Array.isArray(calc.txn_ids) ? calc.txn_ids : [],
        sourceCollectionIds: Array.isArray(calc.collection_ids) ? calc.collection_ids : [],
      };

      farmerItems.push(item);

      // Totals
      totalGross += grossMilkAmount;
      totalDeductions += deductionsAmount;
      totalNet += netPayable;
      totalPaid += alreadyPaidAmount;
      totalRemaining += remainingBalance;
      totalLiters += milkLiters;

      // Group by center
      const cId = cust.primary_center_id;
      if (!centerMap.has(cId)) {
        centerMap.set(cId, {
          centerId: cId,
          centerName: cust.center_name,
          centerCode: cust.center_code,
          farmerCount: 0,
          eligibleCount: 0,
          totalMilkQuantity: 0,
          totalGrossPayable: 0,
          totalDeductions: 0,
          totalNetPayable: 0,
          totalAlreadyPaid: 0,
          totalRemainingBalance: 0,
        });
      }
      const cEntry = centerMap.get(cId)!;
      cEntry.farmerCount++;
      if (netPayable > 0 && isBankValid) cEntry.eligibleCount++;
      cEntry.totalMilkQuantity = Math.round((cEntry.totalMilkQuantity + milkLiters) * 100) / 100;
      cEntry.totalGrossPayable = Math.round((cEntry.totalGrossPayable + grossMilkAmount) * 100) / 100;
      cEntry.totalDeductions = Math.round((cEntry.totalDeductions + deductionsAmount) * 100) / 100;
      cEntry.totalNetPayable = Math.round((cEntry.totalNetPayable + netPayable) * 100) / 100;
      cEntry.totalAlreadyPaid = Math.round((cEntry.totalAlreadyPaid + alreadyPaidAmount) * 100) / 100;
      cEntry.totalRemainingBalance = Math.round((cEntry.totalRemainingBalance + remainingBalance) * 100) / 100;
    }

    const calculatedAt = new Date().toISOString();
    const snapshotData = {
      organizationId,
      centerId: centerId || null,
      periodStart,
      periodEnd,
      totalFarmers: farmerItems.length,
      totalNetPayable: Math.round(totalNet * 100) / 100,
      farmers: farmerItems.map(f => ({
        id: f.customerId,
        code: f.farmerCode,
        net: f.netPayableAmount,
        mask: f.bankAccountNumberMask,
        ifsc: f.bankIfsc,
      })),
    };
    const calculationSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(snapshotData)).digest('hex');

    return {
      organizationId,
      centerId: centerId || null,
      periodStart,
      periodEnd,
      calculatedAt,
      calculationSnapshotHash,
      totalFarmers: farmerItems.length,
      totalEligibleFarmers: eligibleCount,
      totalMilkQuantityLiters: Math.round(totalLiters * 100) / 100,
      totalGrossPayable: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNetPayable: Math.round(totalNet * 100) / 100,
      totalAlreadyPaid: Math.round(totalPaid * 100) / 100,
      totalRemainingBalance: Math.round(totalRemaining * 100) / 100,
      warningsCount,
      farmersWithInvalidBankCount: invalidBankCount,
      centerBreakdowns: Array.from(centerMap.values()),
      farmers: farmerItems,
    };
  }

  /**
   * Persists an immutable calculation snapshot for an approved payment batch.
   */
  public static async persistSettlementSnapshot(
    client: any,
    batchId: string,
    organizationId: string,
    periodStart: string,
    periodEnd: string,
    farmerItems: Array<{
      batchItemId: string;
      item: FarmerPayableItem;
    }>
  ): Promise<void> {
    for (const { batchItemId, item } of farmerItems) {
      await client.query(
        `INSERT INTO payment_settlement_snapshots (
          organization_id, batch_id, batch_item_id, customer_id, period_start, period_end,
          opening_balance, milk_collection_credit, milk_quantity_liters, collection_count,
          deductions_total, advances_recovered, adjustments_total, previous_payments,
          net_payable, paid_amount, remaining_balance,
          source_ledger_transaction_ids, source_collection_ids, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, 0.00, $12, $13,
          $14, 0.00, $15,
          $16::jsonb, $17::jsonb, NOW()
        );`,
        [
          organizationId,
          batchId,
          batchItemId,
          item.customerId,
          periodStart,
          periodEnd,
          item.openingBalance,
          item.grossMilkAmount,
          item.milkQuantityLiters,
          item.collectionCount,
          item.deductionsAmount,
          item.adjustmentsCredit - item.adjustmentsDebit,
          item.alreadyPaidAmount,
          item.netPayableAmount,
          item.remainingBalance,
          JSON.stringify(item.sourceLedgerTransactionIds),
          JSON.stringify(item.sourceCollectionIds),
        ]
      );
    }
  }
}
