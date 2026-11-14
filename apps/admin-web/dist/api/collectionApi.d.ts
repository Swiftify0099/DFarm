export interface ShiftSummary {
    centerId: string;
    shift: 'MORNING' | 'EVENING';
    businessDate: string;
    totalCollections: number;
    totalWeightKg: number;
    averageFat: number;
    averageSnf: number;
    totalAmount: number;
}
export interface MilkCollectionRecord {
    id: string;
    customer_id: string;
    farmer_code: string;
    customer_name: string;
    selected_milk_category: 'COW' | 'BUFFALO';
    shift_type: 'MORNING' | 'EVENING';
    business_date: string;
    session_state: string;
    net_weight: number;
    fat_percentage: number;
    snf_percentage: number;
    applied_rate_per_unit: number;
    total_amount: number;
    started_at: string;
    completed_at?: string;
    measurement_source?: string;
}
export interface SupervisorAdjustmentPayload {
    adjustmentType: 'RATE_RECALCULATION' | 'WEIGHT_CORRECTION' | 'FAT_SNF_OVERRIDE' | 'COMPLETE_REVERSAL';
    reason: string;
    adjustedNetWeight?: number;
    adjustedFatPercentage?: number;
    adjustedSnfPercentage?: number;
}
export declare const collectionApi: {
    getShiftSummary: (params?: {
        centerId?: string;
        shift?: string;
        date?: string;
    }) => Promise<ShiftSummary>;
    getHistory: (params?: {
        centerId?: string;
        date?: string;
        shift?: string;
    }) => Promise<MilkCollectionRecord[]>;
    adjustCollection: (sessionId: string, payload: SupervisorAdjustmentPayload) => Promise<any>;
    getReceiptSlip: (sessionId: string) => Promise<{
        receiptText: string;
    }>;
};
//# sourceMappingURL=collectionApi.d.ts.map