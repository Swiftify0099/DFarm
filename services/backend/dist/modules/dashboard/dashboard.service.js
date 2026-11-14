import { pool } from '../../config/db.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(val) {
    return typeof val === 'string' && UUID_REGEX.test(val.trim());
}
export class DashboardService {
    static async getMetrics(auth, centerId, targetDate) {
        const orgId = auth.organizationId;
        const date = targetDate || new Date().toISOString().split('T')[0];
        const filterCenter = isValidUuid(centerId)
            ? centerId.trim()
            : (isValidUuid(auth.primaryCenterId) ? auth.primaryCenterId : undefined);
        const unavailableDataReasons = [];
        // 1. Center Name lookup
        let centerName = null;
        if (filterCenter) {
            const cRes = await pool.query('SELECT name FROM dairy_centers WHERE id = $1 AND organization_id = $2;', [filterCenter, orgId]);
            if (cRes.rows.length > 0) {
                centerName = cRes.rows[0].name;
            }
        }
        // 2. Milk Collections Today
        let milkQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0) as cow_qty,
        COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0) as buffalo_qty,
        COALESCE(SUM(mc.net_weight), 0) as total_qty,
        COUNT(mc.id) as total_collections,
        COALESCE(SUM(mc.total_amount), 0) as total_value
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date = $2
    `;
        const milkParams = [orgId, date];
        if (filterCenter) {
            milkParams.push(filterCenter);
            milkQuery += ` AND mc.center_id = $${milkParams.length}`;
        }
        const milkRes = await pool.query(milkQuery, milkParams);
        const milkRow = milkRes.rows[0] || {};
        // 3. Morning & Evening Shifts
        let shiftQuery = `
      SELECT 
        mc.shift_type,
        COUNT(mc.id) as count,
        COALESCE(SUM(mc.net_weight), 0) as total_weight,
        COALESCE(AVG(mc.fat_percentage), 0) as avg_fat,
        COALESCE(AVG(mc.snf_percentage), 0) as avg_snf,
        COALESCE(SUM(mc.total_amount), 0) as total_amount
      FROM milk_collections mc
      JOIN dairy_centers dc ON dc.id = mc.center_id
      WHERE dc.organization_id = $1 AND mc.business_date = $2
    `;
        const shiftParams = [orgId, date];
        if (filterCenter) {
            shiftParams.push(filterCenter);
            shiftQuery += ` AND mc.center_id = $${shiftParams.length}`;
        }
        shiftQuery += ' GROUP BY mc.shift_type;';
        const shiftRes = await pool.query(shiftQuery, shiftParams);
        const morningData = shiftRes.rows.find(r => r.shift_type === 'MORNING') || {
            count: 0, total_weight: 0, avg_fat: 0, avg_snf: 0, total_amount: 0
        };
        const eveningData = shiftRes.rows.find(r => r.shift_type === 'EVENING') || {
            count: 0, total_weight: 0, avg_fat: 0, avg_snf: 0, total_amount: 0
        };
        // 4. Customers Count (Active vs Pending Registration)
        let custQuery = `
      SELECT status, COUNT(id) as count
      FROM customers
      WHERE organization_id = $1 AND is_deleted = false
    `;
        const custParams = [orgId];
        if (filterCenter) {
            custParams.push(filterCenter);
            custQuery += ` AND primary_center_id = $${custParams.length}`;
        }
        custQuery += ' GROUP BY status;';
        const custRes = await pool.query(custQuery, custParams);
        let activeCust = 0;
        let pendingCust = 0;
        let totalCust = 0;
        for (const row of custRes.rows) {
            const c = parseInt(row.count, 10);
            totalCust += c;
            if (row.status === 'ACTIVE')
                activeCust += c;
            if (row.status === 'PENDING_VERIFICATION' || row.status === 'DRAFT')
                pendingCust += c;
        }
        // 5. Active Employees
        const empRes = await pool.query(`SELECT COUNT(id) as count FROM users WHERE organization_id = $1 AND status = 'ACTIVE' AND role != 'FARMER_CUSTOMER';`, [orgId]);
        const activeEmployees = parseInt(empRes.rows[0]?.count || '0', 10);
        // 6. Feed Stock Alerts (low stock items)
        let feedAlerts = 0;
        try {
            let feedQuery = `
        SELECT COUNT(cpi.id) as count
        FROM center_product_inventory cpi
        JOIN feed_products fp ON fp.id = cpi.product_id
        WHERE fp.organization_id = $1 AND cpi.current_quantity <= fp.reorder_level
      `;
            const feedParams = [orgId];
            if (filterCenter) {
                feedParams.push(filterCenter);
                feedQuery += ` AND cpi.center_id = $${feedParams.length}`;
            }
            const feedRes = await pool.query(feedQuery, feedParams);
            feedAlerts = parseInt(feedRes.rows[0]?.count || '0', 10);
        }
        catch {
            unavailableDataReasons.push('Feed inventory stock data not configured or accessible for center');
        }
        // 7. Pending Monthly Bills
        let pendingBillsCount = 0;
        let pendingBillsAmount = 0;
        try {
            let billQuery = `
        SELECT COUNT(id) as count, COALESCE(SUM(net_payable_amount), 0) as amount
        FROM monthly_bills
        WHERE organization_id = $1 AND status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL')
      `;
            const billParams = [orgId];
            if (filterCenter) {
                billParams.push(filterCenter);
                billQuery += ` AND center_id = $${billParams.length}`;
            }
            const billRes = await pool.query(billQuery, billParams);
            pendingBillsCount = parseInt(billRes.rows[0]?.count || '0', 10);
            pendingBillsAmount = parseFloat(billRes.rows[0]?.amount || '0');
        }
        catch {
            unavailableDataReasons.push('Pending monthly bills calculation unavailable');
        }
        // 8. Customer Payables Total (positive balances dairy owes to farmers)
        let totalCustomerPayables = 0;
        try {
            let payableQuery = `
        SELECT COALESCE(SUM(cla.current_balance), 0) as total
        FROM customer_ledger_accounts cla
        JOIN customers c ON c.id = cla.customer_id
        WHERE c.organization_id = $1 AND cla.account_type = 'CUSTOMER_PAYABLE' AND cla.current_balance > 0
      `;
            const payableParams = [orgId];
            if (filterCenter) {
                payableParams.push(filterCenter);
                payableQuery += ` AND c.primary_center_id = $${payableParams.length}`;
            }
            const payableRes = await pool.query(payableQuery, payableParams);
            totalCustomerPayables = parseFloat(payableRes.rows[0]?.total || '0');
        }
        catch {
            unavailableDataReasons.push('Customer subledger payables aggregation unavailable');
        }
        // 9. Outstanding Customer Advances
        let outstandingCustomerAdvances = 0;
        try {
            let advQuery = `
        SELECT COALESCE(SUM(balance_amount), 0) as total
        FROM customer_advances
        WHERE organization_id = $1 AND status IN ('DISBURSED', 'RECOVERING')
      `;
            const advParams = [orgId];
            if (filterCenter) {
                advParams.push(filterCenter);
                advQuery += ` AND center_id = $${advParams.length}`;
            }
            const advRes = await pool.query(advQuery, advParams);
            outstandingCustomerAdvances = parseFloat(advRes.rows[0]?.total || '0');
        }
        catch {
            unavailableDataReasons.push('Customer advances balance ledger unavailable');
        }
        // 10. Pending Payouts
        let pendingPayoutsCount = 0;
        let pendingPayoutsAmount = 0;
        try {
            let payoutQuery = `
        SELECT COUNT(id) as count, COALESCE(SUM(amount), 0) as amount
        FROM customer_payouts
        WHERE organization_id = $1 AND status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED')
      `;
            const payoutParams = [orgId];
            if (filterCenter) {
                payoutParams.push(filterCenter);
                payoutQuery += ` AND center_id = $${payoutParams.length}`;
            }
            const payoutRes = await pool.query(payoutQuery, payoutParams);
            pendingPayoutsCount = parseInt(payoutRes.rows[0]?.count || '0', 10);
            pendingPayoutsAmount = parseFloat(payoutRes.rows[0]?.amount || '0');
        }
        catch {
            unavailableDataReasons.push('Pending farmer payouts data unavailable');
        }
        // 11. Failed Synchronization Events & Conflicts
        let failedSyncEvents = 0;
        try {
            const confRes = await pool.query(`SELECT COUNT(scr.id) as count
         FROM sync_conflict_records scr
         JOIN devices d ON d.id = scr.device_id
         WHERE d.organization_id = $1 AND scr.resolved_by IS NULL;`, [orgId]);
            failedSyncEvents = parseInt(confRes.rows[0]?.count || '0', 10);
        }
        catch {
            failedSyncEvents = 0;
        }
        // 12. Device Status Breakdown
        let devStatus = { active: 0, blocked: 0, inactive: 0, total: 0 };
        try {
            let devQuery = `
        SELECT status, COUNT(id) as count
        FROM devices
        WHERE organization_id = $1
      `;
            const devParams = [orgId];
            if (filterCenter) {
                devParams.push(filterCenter);
                devQuery += ` AND center_id = $${devParams.length}`;
            }
            devQuery += ' GROUP BY status;';
            const devRes = await pool.query(devQuery, devParams);
            for (const row of devRes.rows) {
                const c = parseInt(row.count, 10);
                devStatus.total += c;
                if (row.status === 'ACTIVE')
                    devStatus.active += c;
                else if (row.status === 'BLOCKED')
                    devStatus.blocked += c;
                else
                    devStatus.inactive += c;
            }
        }
        catch {
            unavailableDataReasons.push('Device status records unavailable');
        }
        return {
            businessDate: date,
            centerId: filterCenter || null,
            centerName,
            todayCowMilkQtyKg: Math.round(parseFloat(milkRow.cow_qty || '0') * 100) / 100,
            todayBuffaloMilkQtyKg: Math.round(parseFloat(milkRow.buffalo_qty || '0') * 100) / 100,
            todayTotalMilkQtyKg: Math.round(parseFloat(milkRow.total_qty || '0') * 100) / 100,
            todayTotalCollections: parseInt(milkRow.total_collections || '0', 10),
            todayTotalMilkValue: Math.round(parseFloat(milkRow.total_value || '0') * 100) / 100,
            morningShiftSummary: {
                collectionsCount: parseInt(morningData.count || '0', 10),
                totalWeightKg: Math.round(parseFloat(morningData.total_weight || '0') * 100) / 100,
                avgFat: Math.round(parseFloat(morningData.avg_fat || '0') * 100) / 100,
                avgSnf: Math.round(parseFloat(morningData.avg_snf || '0') * 100) / 100,
                totalAmount: Math.round(parseFloat(morningData.total_amount || '0') * 100) / 100,
            },
            eveningShiftSummary: {
                collectionsCount: parseInt(eveningData.count || '0', 10),
                totalWeightKg: Math.round(parseFloat(eveningData.total_weight || '0') * 100) / 100,
                avgFat: Math.round(parseFloat(eveningData.avg_fat || '0') * 100) / 100,
                avgSnf: Math.round(parseFloat(eveningData.avg_snf || '0') * 100) / 100,
                totalAmount: Math.round(parseFloat(eveningData.total_amount || '0') * 100) / 100,
            },
            activeCustomers: activeCust,
            pendingCustomerRegistrations: pendingCust,
            totalCustomers: totalCust,
            activeEmployees,
            feedStockAlerts: feedAlerts,
            pendingBillsCount,
            pendingBillsAmount: Math.round(pendingBillsAmount * 100) / 100,
            totalCustomerPayables: Math.round(totalCustomerPayables * 100) / 100,
            outstandingCustomerAdvances: Math.round(outstandingCustomerAdvances * 100) / 100,
            pendingPayoutsCount,
            pendingPayoutsAmount: Math.round(pendingPayoutsAmount * 100) / 100,
            failedSyncEvents,
            deviceStatus: devStatus,
            unavailableDataReasons,
        };
    }
}
//# sourceMappingURL=dashboard.service.js.map