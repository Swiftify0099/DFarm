import type { AuthContext } from '../../middleware/authenticate.js';
export declare class ReportsService {
    /**
     * Daily Collection Report: Shift & Category breakdown for a specific date
     */
    static getDailyCollectionReport(auth: AuthContext, date: string, centerId?: string): Promise<any[]>;
    /**
     * Monthly Collection Report: Day-by-day trends for an entire month
     */
    static getMonthlyCollectionReport(auth: AuthContext, month: number, year: number, centerId?: string): Promise<{
        businessDate: any;
        collectionsCount: number;
        cowWeightKg: number;
        buffaloWeightKg: number;
        totalWeightKg: number;
        avgFat: number;
        avgSnf: number;
        totalAmount: number;
    }[]>;
    /**
     * Farmer-wise Report: Aggregate collections & balances per farmer
     */
    static getFarmerWiseReport(auth: AuthContext, startDate: string, endDate: string, centerId?: string): Promise<{
        customerId: any;
        farmerCode: any;
        customerName: any;
        mobileNumber: any;
        centerName: any;
        totalCollections: number;
        totalQuantityKg: number;
        avgFat: number;
        avgSnf: number;
        totalMilkValue: number;
        currentLedgerBalance: number;
    }[]>;
    /**
     * Cow vs Buffalo Comparative Analysis
     */
    static getCowBuffaloComparison(auth: AuthContext, startDate: string, endDate: string, centerId?: string): Promise<{
        milkCategory: any;
        totalCollections: number;
        totalWeightKg: number;
        avgFat: number;
        avgSnf: number;
        avgRate: number;
        totalAmount: number;
    }[]>;
    /**
     * Fat / SNF Distribution Quality Bands
     */
    static getFatSnfDistribution(auth: AuthContext, startDate: string, endDate: string, centerId?: string): Promise<{
        fatBand: any;
        sampleCount: number;
        totalWeightKg: number;
        avgFat: number;
        avgSnf: number;
    }[]>;
    /**
     * Billing Summary Report
     */
    static getBillingReport(auth: AuthContext, periodId?: string, centerId?: string): Promise<{
        status: any;
        totalBills: number;
        totalGross: number;
        totalDeductions: number;
        totalNetPayable: number;
        totalLiters: number;
    }[]>;
    /**
     * Payouts Summary Report
     */
    static getPayoutsReport(auth: AuthContext, startDate?: string, endDate?: string, centerId?: string): Promise<{
        paymentMethod: any;
        status: any;
        count: number;
        totalAmount: number;
    }[]>;
}
//# sourceMappingURL=reports.service.d.ts.map