export declare const reportsApi: {
    getDailyCollection: (params?: {
        date?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getMonthlyCollection: (params?: {
        month?: number;
        year?: number;
        centerId?: string;
    }) => Promise<any[]>;
    getFarmerWise: (params?: {
        startDate?: string;
        endDate?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getCowBuffalo: (params?: {
        startDate?: string;
        endDate?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getFatSnf: (params?: {
        startDate?: string;
        endDate?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getBillingSummary: (params?: {
        periodId?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getPayoutsSummary: (params?: {
        startDate?: string;
        endDate?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getLedgerRegister: (params?: {
        startDate?: string;
        endDate?: string;
        centerId?: string;
    }) => Promise<any[]>;
    getBalancesReport: (params?: {
        centerId?: string;
    }) => Promise<any[]>;
    getCenterLiabilities: (params?: {
        centerId?: string;
    }) => Promise<any[]>;
    getOutstandingAdvances: (params?: {
        centerId?: string;
    }) => Promise<any[]>;
    getFeedStockReport: (params?: {
        centerId?: string;
        type?: string;
    }) => Promise<any>;
};
//# sourceMappingURL=reportsApi.d.ts.map