import type { AuthContext } from '../../middleware/authenticate.js';
export interface DashboardMetrics {
    businessDate: string;
    centerId?: string | null;
    centerName?: string | null;
    todayCowMilkQtyKg: number;
    todayBuffaloMilkQtyKg: number;
    todayTotalMilkQtyKg: number;
    todayTotalCollections: number;
    todayTotalMilkValue: number;
    morningShiftSummary: {
        collectionsCount: number;
        totalWeightKg: number;
        avgFat: number;
        avgSnf: number;
        totalAmount: number;
    };
    eveningShiftSummary: {
        collectionsCount: number;
        totalWeightKg: number;
        avgFat: number;
        avgSnf: number;
        totalAmount: number;
    };
    activeCustomers: number;
    pendingCustomerRegistrations: number;
    totalCustomers: number;
    activeEmployees: number;
    feedStockAlerts: number;
    pendingBillsCount: number;
    pendingBillsAmount: number;
    totalCustomerPayables: number;
    outstandingCustomerAdvances: number;
    pendingPayoutsCount: number;
    pendingPayoutsAmount: number;
    failedSyncEvents: number;
    deviceStatus: {
        active: number;
        blocked: number;
        inactive: number;
        total: number;
    };
    unavailableDataReasons: string[];
}
export declare class DashboardService {
    static getMetrics(auth: AuthContext, centerId?: string, targetDate?: string): Promise<DashboardMetrics>;
}
//# sourceMappingURL=dashboard.service.d.ts.map