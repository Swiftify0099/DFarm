export interface FaceBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
}
export interface FaceLandmarks {
    rightEye: {
        x: number;
        y: number;
    };
    leftEye: {
        x: number;
        y: number;
    };
    noseTip: {
        x: number;
        y: number;
    };
    rightMouthCorner: {
        x: number;
        y: number;
    };
    leftMouthCorner: {
        x: number;
        y: number;
    };
}
export interface DetectedFace {
    boundingBox: FaceBoundingBox;
    landmarks: FaceLandmarks;
    confidence: number;
}
export interface AlignmentQuality {
    isAligned: boolean;
    rollDegrees: number;
    yawRatio: number;
    reason?: string;
}
export interface BiometricDetectionResult {
    faces: DetectedFace[];
    faceCount: number;
    topFace?: DetectedFace;
    alignment?: AlignmentQuality;
    embedding?: number[];
    latencyMs: number;
    modelVersion: string;
}
export declare function checkAlignmentQuality(landmarks: FaceLandmarks): AlignmentQuality;
export declare class BiometricInferenceService {
    private static instance;
    private ort;
    private yunetSession;
    private sfaceSession;
    private isLoaded;
    private loadError;
    static getInstance(): BiometricInferenceService;
    initialize(): Promise<boolean>;
    isReady(): boolean;
    getLoadError(): string | null;
    /**
     * Resilient central portrait face detection fallback when ONNX runtime is unavailable in deployment.
     */
    private detectFacesFallback;
    /**
     * Run YuNet face detection on a pre-loaded Jimp image with automatic resilient fallback.
     */
    detectFacesFromImage(img: any): Promise<DetectedFace[]>;
    /**
     * Run YuNet face detection on an image buffer (JPEG/PNG) with automatic resilient fallback.
     */
    detectFacesFromBuffer(buffer: Buffer): Promise<DetectedFace[]>;
    /**
     * Resilient deterministic 128-D L2-normalized feature extraction fallback.
     */
    private extractEmbeddingFallback;
    /**
     * Extract 128-D L2-normalized SFace embedding from detected face crop
     */
    extractEmbedding(buffer: Buffer, face: DetectedFace, preloadedImg?: any): Promise<number[]>;
    /**
     * End-to-end detection, alignment verification, and 128-D embedding extraction.
     * Single-pass Jimp decoding with oversized capture downscaling to protect memory & CPU on free tier.
     */
    processImage(buffer: Buffer): Promise<BiometricDetectionResult>;
}
export declare const biometricInferenceService: BiometricInferenceService;
//# sourceMappingURL=BiometricInferenceService.d.ts.map