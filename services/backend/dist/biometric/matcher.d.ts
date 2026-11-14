export interface BiometricMatchResult {
    score: number;
    isMatch: boolean;
    threshold: number;
}
export declare class BiometricMatcher {
    static readonly DEFAULT_THRESHOLD: number;
    /**
     * Compute cosine similarity between two 512D embedding vectors.
     */
    static computeCosineSimilarity(vectorA: number[] | Float32Array, vectorB: number[] | Float32Array): number;
    /**
     * Compare probe against template and evaluate against calibrated threshold.
     */
    static match(probe: number[] | Float32Array, template: number[] | Float32Array, threshold?: number): BiometricMatchResult;
}
//# sourceMappingURL=matcher.d.ts.map