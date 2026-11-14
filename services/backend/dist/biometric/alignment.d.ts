export interface Point2D {
    x: number;
    y: number;
}
export interface FaceLandmarks5 {
    leftEye: Point2D;
    rightEye: Point2D;
    noseTip: Point2D;
    leftMouthCorner: Point2D;
    rightMouthCorner: Point2D;
}
export interface SimilarityTransform {
    scale: number;
    rotationRadians: number;
    translationX: number;
    translationY: number;
    matrix: [[number, number, number], [number, number, number]];
}
export declare class FaceAlignmentEngine {
    static readonly TARGET_WIDTH = 112;
    static readonly TARGET_HEIGHT = 112;
    static readonly CANONICAL_LANDMARKS_112: FaceLandmarks5;
    static landmarksToArray(landmarks: FaceLandmarks5): [number, number][];
    static computeSimilarityTransform(detected: FaceLandmarks5): SimilarityTransform;
    static normalizePixels(pixels: Uint8Array | number[]): Float32Array;
}
//# sourceMappingURL=alignment.d.ts.map