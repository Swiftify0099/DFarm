import { pool } from '../../config/db.js';
import type { AuthContext } from '../../middleware/authenticate.js';

export class ReportsService {
  /**
   * Daily Collection Report: Shift & Category breakdown for a specific date
   */
  public static async getDailyCollectionReport(auth: AuthContext, date: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT mc.business_date, mc.shift_type, mc.milk_category,
             COUNT(mc.id) as collections_count,
             COALESCE(SUM(mc.net_weight), 0) as total_weight_kg,
             COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
             COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
             COALESCE(AVG(mc.applied_rate_per_unit), 0) as avg_rate,
             COALESCE(SUM(mc.total_amount), 0) as total_amount,
             dc.name as center_name, dc.code as center_code
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date = $2
    `;
    const params: any[] = [orgId, date];
    if (centerId) {
      params.push(centerId);
      q += ` AND mc.center_id = $${params.length}`;
    }
    q += ' GROUP BY mc.business_date, mc.shift_type, mc.milk_category, dc.name, dc.code ORDER BY mc.shift_type, mc.milk_category;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      ...r,
      collectionsCount: parseInt(r.collections_count, 10),
      totalWeightKg: Math.round(parseFloat(r.total_weight_kg) * 100) / 100,
      avgFat: Math.round(parseFloat(r.avg_fat) * 100) / 100,
      avgSnf: Math.round(parseFloat(r.avg_snf) * 100) / 100,
      avgRate: Math.round(parseFloat(r.avg_rate) * 100) / 100,
      totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
    }));
  }

  /**
   * Monthly Collection Report: Day-by-day trends for an entire month
   */
  public static async getMonthlyCollectionReport(auth: AuthContext, month: number, year: number, centerId?: string) {
    const orgId = auth.organizationId;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let q = `
      SELECT mc.business_date,
             COUNT(mc.id) as collections_count,
             COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0) as cow_weight,
             COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0) as buffalo_weight,
             COALESCE(SUM(mc.net_weight), 0) as total_weight,
             COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
             COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
             COALESCE(SUM(mc.total_amount), 0) as total_amount
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date >= $2 AND mc.business_date <= $3
    `;
    const params: any[] = [orgId, startDate, endDate];
    if (centerId) {
      params.push(centerId);
      q += ` AND mc.center_id = $${params.length}`;
    }
    q += ' GROUP BY mc.business_date ORDER BY mc.business_date ASC;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      businessDate: r.business_date,
      collectionsCount: parseInt(r.collections_count, 10),
      cowWeightKg: Math.round(parseFloat(r.cow_weight) * 100) / 100,
      buffaloWeightKg: Math.round(parseFloat(r.buffalo_weight) * 100) / 100,
      totalWeightKg: Math.round(parseFloat(r.total_weight) * 100) / 100,
      avgFat: Math.round(parseFloat(r.avg_fat) * 100) / 100,
      avgSnf: Math.round(parseFloat(r.avg_snf) * 100) / 100,
      totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
    }));
  }

  /**
   * Farmer-wise Report: Aggregate collections & balances per farmer
   */
  public static async getFarmerWiseReport(auth: AuthContext, startDate: string, endDate: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT c.id as customer_id, c.farmer_code, c.full_name as customer_name, c.mobile_number,
             dc.name as center_name,
             COUNT(mc.id) as total_collections,
             COALESCE(SUM(mc.net_weight), 0) as total_quantity_kg,
             COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
             COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
             COALESCE(SUM(mc.total_amount), 0) as total_milk_value,
             COALESCE(cla.current_balance, 0) as current_ledger_balance
      FROM customers c
      JOIN dairy_centers dc ON dc.id = c.primary_center_id
      LEFT JOIN milk_collections mc ON mc.customer_id = c.id AND mc.business_date >= $2 AND mc.business_date <= $3
      LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id AND cla.account_type = 'CUSTOMER_PAYABLE'
      WHERE c.organization_id = $1 AND c.is_deleted = false
    `;
    const params: any[] = [orgId, startDate, endDate];
    if (centerId) {
      params.push(centerId);
      q += ` AND c.primary_center_id = $${params.length}`;
    }
    q += ' GROUP BY c.id, c.farmer_code, c.full_name, c.mobile_number, dc.name, cla.current_balance ORDER BY total_quantity_kg DESC;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      customerId: r.customer_id,
      farmerCode: r.farmer_code,
      customerName: r.customer_name,
      mobileNumber: r.mobile_number,
      centerName: r.center_name,
      totalCollections: parseInt(r.total_collections, 10),
      totalQuantityKg: Math.round(parseFloat(r.total_quantity_kg) * 100) / 100,
      avgFat: Math.round(parseFloat(r.avg_fat) * 100) / 100,
      avgSnf: Math.round(parseFloat(r.avg_snf) * 100) / 100,
      totalMilkValue: Math.round(parseFloat(r.total_milk_value) * 100) / 100,
      currentLedgerBalance: Math.round(parseFloat(r.current_ledger_balance) * 100) / 100,
    }));
  }

  /**
   * Cow vs Buffalo Comparative Analysis
   */
  public static async getCowBuffaloComparison(auth: AuthContext, startDate: string, endDate: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT mc.milk_category,
             COUNT(mc.id) as total_collections,
             COALESCE(SUM(mc.net_weight), 0) as total_weight_kg,
             COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
             COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
             COALESCE(AVG(mc.applied_rate_per_unit), 0) as avg_rate,
             COALESCE(SUM(mc.total_amount), 0) as total_amount
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date >= $2 AND mc.business_date <= $3
    `;
    const params: any[] = [orgId, startDate, endDate];
    if (centerId) {
      params.push(centerId);
      q += ` AND mc.center_id = $${params.length}`;
    }
    q += ' GROUP BY mc.milk_category;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      milkCategory: r.milk_category,
      totalCollections: parseInt(r.total_collections, 10),
      totalWeightKg: Math.round(parseFloat(r.total_weight_kg) * 100) / 100,
      avgFat: Math.round(parseFloat(r.avg_fat) * 100) / 100,
      avgSnf: Math.round(parseFloat(r.avg_snf) * 100) / 100,
      avgRate: Math.round(parseFloat(r.avg_rate) * 100) / 100,
      totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
    }));
  }

  /**
   * Fat / SNF Distribution Quality Bands
   */
  public static async getFatSnfDistribution(auth: AuthContext, startDate: string, endDate: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT 
        CASE 
          WHEN fat_percentage < 3.5 THEN 'Low (< 3.5%)'
          WHEN fat_percentage BETWEEN 3.5 AND 4.5 THEN 'Standard (3.5% - 4.5%)'
          WHEN fat_percentage BETWEEN 4.6 AND 6.5 THEN 'High (4.6% - 6.5%)'
          ELSE 'Very High (> 6.5%)'
        END as fat_band,
        COUNT(mc.id) as sample_count,
        COALESCE(SUM(mc.net_weight), 0) as total_weight_kg,
        COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
        COALESCE(AVG(mc.snf_percentage), 0) as avg_snf
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date >= $2 AND mc.business_date <= $3
    `;
    const params: any[] = [orgId, startDate, endDate];
    if (centerId) {
      params.push(centerId);
      q += ` AND mc.center_id = $${params.length}`;
    }
    q += ' GROUP BY fat_band ORDER BY avg_fat ASC;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      fatBand: r.fat_band,
      sampleCount: parseInt(r.sample_count, 10),
      totalWeightKg: Math.round(parseFloat(r.total_weight_kg) * 100) / 100,
      avgFat: Math.round(parseFloat(r.avg_fat) * 100) / 100,
      avgSnf: Math.round(parseFloat(r.avg_snf) * 100) / 100,
    }));
  }

  /**
   * Billing Summary Report
   */
  public static async getBillingReport(auth: AuthContext, periodId?: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT mb.status, COUNT(mb.id) as total_bills,
             COALESCE(SUM(mb.gross_amount), 0) as total_gross,
             COALESCE(SUM(mb.total_deductions), 0) as total_deductions,
             COALESCE(SUM(mb.net_payable_amount), 0) as total_net_payable,
             COALESCE(SUM(mb.total_quantity_liters), 0) as total_liters
      FROM monthly_bills mb
      WHERE mb.organization_id = $1
    `;
    const params: any[] = [orgId];
    if (periodId) {
      params.push(periodId);
      q += ` AND mb.billing_period_id = $${params.length}`;
    }
    if (centerId) {
      params.push(centerId);
      q += ` AND mb.center_id = $${params.length}`;
    }
    q += ' GROUP BY mb.status;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      status: r.status,
      totalBills: parseInt(r.total_bills, 10),
      totalGross: Math.round(parseFloat(r.total_gross) * 100) / 100,
      totalDeductions: Math.round(parseFloat(r.total_deductions) * 100) / 100,
      totalNetPayable: Math.round(parseFloat(r.total_net_payable) * 100) / 100,
      totalLiters: Math.round(parseFloat(r.total_liters) * 100) / 100,
    }));
  }

  /**
   * Payouts Summary Report
   */
  public static async getPayoutsReport(auth: AuthContext, startDate?: string, endDate?: string, centerId?: string) {
    const orgId = auth.organizationId;
    let q = `
      SELECT cp.payment_method, cp.status,
             COUNT(cp.id) as count,
             COALESCE(SUM(cp.amount), 0) as total_amount
      FROM customer_payouts cp
      WHERE cp.organization_id = $1
    `;
    const params: any[] = [orgId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
      q += ` AND cp.created_at >= $${params.length - 1} AND cp.created_at <= $${params.length}`;
    }
    if (centerId) {
      params.push(centerId);
      q += ` AND cp.center_id = $${params.length}`;
    }
    q += ' GROUP BY cp.payment_method, cp.status ORDER BY cp.status;';
    const res = await pool.query(q, params);
    return res.rows.map(r => ({
      paymentMethod: r.payment_method,
      status: r.status,
      count: parseInt(r.count, 10),
      totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
    }));
  }
}
