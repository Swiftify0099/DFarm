import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function runAudit() {
  await client.connect();
  console.log('=== DFARM PRODUCTION FINANCIAL & DATABASE RECONCILIATION AUDIT ===\n');

  // 1. Double-Entry General Ledger Balance (Total Debits == Total Credits)
  const journalSum = await client.query(`
    SELECT
      COUNT(*)::int as total_entries,
      COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)::numeric(14,2) as total_debits,
      COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)::numeric(14,2) as total_credits,
      (COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0))::numeric(14,2) as journal_imbalance
    FROM ledger_entries;
  `);
  console.log('1. Double-Entry General Ledger Balance:', journalSum.rows[0]);

  // 2. Transaction-Level Imbalance Check (Every transaction must balance to 0)
  const imbalancedTxns = await client.query(`
    SELECT
      transaction_id,
      COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END), 0)::numeric(14,2) as net_diff
    FROM ledger_entries
    GROUP BY transaction_id
    HAVING COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END), 0) != 0;
  `);
  console.log(`2. Imbalanced Transactions in ledger_entries: ${imbalancedTxns.rows.length}`);

  // 3. Customer Ledger Accounts vs Last Transaction Balance After
  const accountDrift = await client.query(`
    WITH latest_txn AS (
      SELECT DISTINCT ON (customer_id)
        customer_id,
        balance_after
      FROM ledger_transactions
      ORDER BY customer_id, created_at DESC
    )
    SELECT
      cla.customer_id,
      cla.current_balance::numeric(14,2) as account_current_balance,
      lt.balance_after::numeric(14,2) as last_txn_balance_after,
      (cla.current_balance - lt.balance_after)::numeric(14,2) as drift
    FROM customer_ledger_accounts cla
    JOIN latest_txn lt ON lt.customer_id = cla.customer_id
    WHERE (cla.current_balance - lt.balance_after) != 0;
  `);
  console.log(`3. Balance Drifts between customer_ledger_accounts and latest transaction: ${accountDrift.rows.length}`);

  // 4. Duplicate Idempotency Keys in ledger_transactions
  const dupIdem = await client.query(`
    SELECT idempotency_key, COUNT(*) as cnt
    FROM ledger_transactions
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1;
  `);
  console.log(`4. Duplicate Idempotency Keys in ledger_transactions: ${dupIdem.rows.length}`);

  // 5. Approved / Completed Payment Batches vs Itemized Payouts Reconciliation
  const batchRecon = await client.query(`
    SELECT
      b.id,
      b.batch_number,
      b.total_amount::numeric(14,2) as batch_header_amount,
      b.total_beneficiaries,
      COALESCE(SUM(p.amount), 0)::numeric(14,2) as sum_payout_amount,
      COUNT(p.id)::int as actual_payout_count,
      (b.total_amount - COALESCE(SUM(p.amount), 0))::numeric(14,2) as discrepancy
    FROM payment_batches b
    LEFT JOIN customer_payouts p ON p.batch_id = b.id
    WHERE b.status IN ('APPROVED', 'SUBMITTED', 'SETTLED', 'COMPLETED')
    GROUP BY b.id, b.batch_number, b.total_amount, b.total_beneficiaries
    HAVING (b.total_amount - COALESCE(SUM(p.amount), 0)) != 0;
  `);
  console.log(`5. Settled Payment Batch Header vs Payout Item Discrepancies: ${batchRecon.rows.length}`);

  // 6. Milk Collection Price Computation Integrity (total_amount = net_weight * applied_rate_per_unit)
  const collectionMath = await client.query(`
    SELECT
      COUNT(*)::int as total_collections,
      COUNT(CASE WHEN (total_amount - ROUND((net_weight * applied_rate_per_unit)::numeric, 2)) != 0 THEN 1 END)::int as math_discrepancies
    FROM milk_collections;
  `);
  console.log('6. Milk Collection Pricing Arithmetic:', collectionMath.rows[0]);

  // 7. Feed Sales Arithmetic Verification (total_amount = subtotal - discount_amount + tax_amount)
  const feedMath = await client.query(`
    SELECT
      COUNT(*)::int as total_feed_sales,
      COUNT(CASE WHEN (total_amount - (subtotal - discount_amount + tax_amount)) != 0 THEN 1 END)::int as math_discrepancies
    FROM feed_sales;
  `);
  console.log('7. Feed Sales Header Arithmetic:', feedMath.rows[0]);

  // 8. Payroll Payslip Net Salary Computation Integrity (net_salary = gross_earnings - total_deductions)
  const payslipMath = await client.query(`
    SELECT
      COUNT(*)::int as total_payslips,
      COUNT(CASE WHEN (net_salary - (gross_earnings - total_deductions)) != 0 THEN 1 END)::int as math_discrepancies
    FROM employee_payslips;
  `);
  console.log('8. Employee Payslip Arithmetic:', payslipMath.rows[0]);

  // 9. Foreign Key Orphan Integrity Checks
  const orphanChecks = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM ledger_transactions lt WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = lt.customer_id))::int as orphan_ledger_txns,
      (SELECT COUNT(*) FROM milk_collections mc WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = mc.customer_id))::int as orphan_collections,
      (SELECT COUNT(*) FROM feed_sales fs WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = fs.customer_id))::int as orphan_feed_sales,
      (SELECT COUNT(*) FROM customer_payouts cp WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = cp.customer_id))::int as orphan_payouts,
      (SELECT COUNT(*) FROM employee_payslips ep WHERE NOT EXISTS (SELECT 1 FROM employees emp WHERE emp.id = ep.employee_id))::int as orphan_payslips;
  `);
  console.log('9. Foreign Key Orphan Integrity:', orphanChecks.rows[0]);

  console.log('\n=== RECONCILIATION AUDIT COMPLETED SUCCESSFULLY ===');
  await client.end();
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
