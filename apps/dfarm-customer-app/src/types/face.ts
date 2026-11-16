export interface FacialPoint {
  x: number;
  y: number;
}

export interface YuNetLandmarks {
  rightEye: FacialPoint;
  leftEye: FacialPoint;
  noseTip: FacialPoint;
  rightMouthCorner: FacialPoint;
  leftMouthCorner: FacialPoint;
}

export interface YuNetFaceDetection {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks: YuNetLandmarks;
  confidence: number;
}

export interface SFaceEmbeddingResult {
  embedding: number[]; // 128 float values
  isNormalized: boolean;
  inferenceTimeMs: number;
}

export interface FaceDiagnosticsReport {
  cameraPermissionGranted: boolean;
  cameraFps: number;
  yuNetLoaded: boolean;
  yuNetLatencyMs: number;
  sFaceLoaded: boolean;
  sFaceLatencyMs: number;
  facesDetectedCount: number;
  primaryFaceAligned: boolean;
  embeddingGenerated: boolean;
  embeddingValid128D: boolean;
  status: 'OPTIMAL' | 'POOR_LIGHTING' | 'NO_FACE' | 'MULTIPLE_FACES' | 'MISALIGNED' | 'ERROR';
  statusMessage: string;
}

export interface FaceEnrollmentPayload {
  customerId: string;
  version: string;
  modelVersion: 'sface_int8_2021dec';
  embedding: number[];
  confidence: number;
  timestamp: string;
}
