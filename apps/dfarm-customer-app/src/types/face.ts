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
  matchStatus?: 'MATCH_VERIFIED' | 'MATCH_FAILED' | 'NOT_ENROLLED' | 'SKIPPED' | 'BACKEND_ERROR';
  matchScore?: number;
  matchedFarmerName?: string;
  farmerCode?: string;
  discreteStatus?:
    | 'FACE_DETECTED'
    | 'VERIFYING_IDENTITY'
    | 'FACE_MATCHED'
    | 'FACE_NOT_MATCHED'
    | 'UNKNOWN_PERSON'
    | 'NO_FACE_DETECTED'
    | 'MULTIPLE_FACES_DETECTED'
    | 'MODEL_LOAD_FAILED'
    | 'NETWORK_ERROR'
    | 'ENROLLMENT_NOT_FOUND';
}

export interface FaceEnrollmentPayload {
  customerId: string;
  version: string;
  modelVersion: 'sface_int8_2021dec';
  embedding: number[];
  confidence: number;
  timestamp: string;
}
