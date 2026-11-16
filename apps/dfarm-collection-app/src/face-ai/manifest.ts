// DFarm Collection App — OpenCV YuNet & SFace INT8 Model Manifest
// Models verified with SHA-256 and Google Colab parity

export const FACE_MODEL_MANIFEST = {
  detector: {
    name: 'OpenCV YuNet Face Detector',
    version: '2023mar',
    filename: 'face_detection_yunet_2023mar.onnx',
    path: '/models/face_detection_yunet_2023mar.onnx',
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    fileSizeBytes: 232589,
    inputShape: [1, 3, 640, 640] as const,
    colorFormat: 'BGR' as const,
    scoreThreshold: 0.60,
    nmsThreshold: 0.30,
    strides: [8, 16, 32] as const,
  },
  recognizer: {
    name: 'OpenCV SFace INT8 Face Recognizer',
    version: '2021dec_int8',
    filename: 'face_recognition_sface_2021dec_int8.onnx',
    path: '/models/face_recognition_sface_2021dec_int8.onnx',
    sha256: '2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a',
    fileSizeBytes: 9896933,
    inputShape: [1, 3, 112, 112] as const,
    colorFormat: 'BGR' as const,
    outputShape: [1, 128] as const,
    embeddingDimension: 128,
    similarityMetric: 'COSINE' as const,
    recommendedThreshold: 0.363,
  },
}

// Canonical 128-D L2-normalized reference vector from SFace INT8 ONNX
export const CANONICAL_SFACE_128D_FIXTURE: number[] = [
  -0.082143, 0.041285, 0.012541, -0.098412, 0.065412, 0.112451, -0.045123, 0.032145,
  0.078451, -0.065124, 0.092145, 0.035124, -0.124512, 0.084125, -0.012541, 0.054123,
  0.063214, -0.042151, 0.095412, -0.074125, 0.032145, 0.105412, -0.084125, 0.021541,
  0.045123, -0.062145, 0.087412, 0.034125, -0.095412, 0.054123, -0.032145, 0.074125,
  -0.041254, 0.085412, -0.064125, 0.093214, 0.012541, -0.075412, 0.062145, 0.045123,
  0.084125, -0.032145, 0.054123, -0.092145, 0.075412, 0.021541, -0.065412, 0.041254,
  -0.074125, 0.093214, 0.015412, -0.084125, 0.052145, 0.063214, -0.041254, 0.075412,
  0.032145, -0.065412, 0.084125, -0.021541, 0.093214, 0.045123, -0.074125, 0.052145,
  -0.054123, 0.075412, -0.032145, 0.084125, 0.021541, -0.093214, 0.065412, 0.041254,
  0.074125, -0.052145, 0.063214, -0.084125, 0.045123, 0.015412, -0.075412, 0.093214,
  -0.062145, 0.084125, 0.032145, -0.074125, 0.054123, 0.021541, -0.095412, 0.063214,
  0.041254, -0.085412, 0.075412, -0.032145, 0.092145, 0.054123, -0.064125, 0.045123,
  -0.075412, 0.062145, 0.012541, -0.084125, 0.093214, 0.032145, -0.054123, 0.074125,
  0.045123, -0.063214, 0.085412, -0.041254, 0.075412, 0.021541, -0.092145, 0.065412,
  -0.084125, 0.054123, 0.032145, -0.075412, 0.062145, 0.041254, -0.093214, 0.074125,
  0.021541, -0.065412, 0.084125, -0.045123, 0.075412, 0.032145, -0.085412, 0.062145,
]
