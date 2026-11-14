export interface FaceMatchProbe {
    embedding?: number[] | null;
    qualityScore?: number;
    livenessPassed?: boolean;
}
export interface FaceMatchCandidate {
    customerId: string;
    modelVersionId: string;
    matchScore: number;
    confidence: 'HIGH' | 'LOW' | 'NONE';
}
export interface FaceEngineInspectionResult {
    isAvailable: boolean;
    engineVersion: string | null;
    modelVersion: string | null;
    blockerReason?: string;
}
export declare class P07FaceEngineAdapter {
    private static isEngineInitialized;
    private static registeredEngine;
    /**
     * Inspect whether Phase 07 Face Recognition Engine has produced a working runtime.
     */
    static inspectEngine(): FaceEngineInspectionResult;
    /**
     * Register a verified P07 engine runtime (e.g. for testing calibrated cosine similarity).
     */
    static registerEngine(engine: any): void;
    /**
     * Reset / clear engine to simulate missing P07 engine.
     */
    static resetEngine(): void;
    /**
     * Match a live face probe against enrolled templates.
     * Throws if engine is not available. Never fabricates fake match results.
     */
    static matchProbe(probe: FaceMatchProbe, templates: Array<{
        customerId: string;
        modelVersionId: string;
        embedding: number[];
    }>): Promise<FaceMatchCandidate | null>;
}
//# sourceMappingURL=face-engine.adapter.d.ts.map