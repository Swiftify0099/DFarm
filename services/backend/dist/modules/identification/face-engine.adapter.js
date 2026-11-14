// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// FACE RECOGNITION ENGINE ADAPTER (P07 BOUNDARY & INSPECTION CONTRACT)
// ==============================================================================
export class P07FaceEngineAdapter {
    static isEngineInitialized = false;
    static registeredEngine = null;
    /**
     * Inspect whether Phase 07 Face Recognition Engine has produced a working runtime.
     */
    static inspectEngine() {
        if (!this.isEngineInitialized || !this.registeredEngine) {
            return {
                isAvailable: false,
                engineVersion: null,
                modelVersion: null,
                blockerReason: 'P07_FACE_ENGINE_UNAVAILABLE: Phase 07 Face Recognition Engine has not produced a working on-device/backend engine runtime. Per project rules, successful face matches cannot be simulated.',
            };
        }
        return {
            isAvailable: true,
            engineVersion: this.registeredEngine.version,
            modelVersion: this.registeredEngine.modelVersion,
        };
    }
    /**
     * Register a verified P07 engine runtime (e.g. for testing calibrated cosine similarity).
     */
    static registerEngine(engine) {
        this.registeredEngine = engine;
        this.isEngineInitialized = true;
    }
    /**
     * Reset / clear engine to simulate missing P07 engine.
     */
    static resetEngine() {
        this.registeredEngine = null;
        this.isEngineInitialized = false;
    }
    /**
     * Match a live face probe against enrolled templates.
     * Throws if engine is not available. Never fabricates fake match results.
     */
    static async matchProbe(probe, templates) {
        const inspection = this.inspectEngine();
        if (!inspection.isAvailable) {
            throw new Error(inspection.blockerReason);
        }
        if (!probe.embedding || probe.embedding.length === 0) {
            return null;
        }
        // Call registered engine matching algorithm
        return this.registeredEngine.match(probe, templates);
    }
}
//# sourceMappingURL=face-engine.adapter.js.map