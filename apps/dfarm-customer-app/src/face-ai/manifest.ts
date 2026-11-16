/**
 * DFarm Fixed Face AI Model Manifest
 * OpenCV YuNet Face Detection + OpenCV SFace INT8 Face Recognition
 * Strict adherence to tested Colab pipeline
 */

export const FACE_MODEL_MANIFEST = {
  detector: {
    name: 'OpenCV YuNet Face Detector',
    filename: 'face_detection_yunet_2023mar.onnx',
    version: '2023mar',
    source: 'OpenCV Zoo (Apache 2.0)',
    quantization: 'FP32',
    inputShape: [1, 3, 640, 640], // [batch, channels, height, width]
    colorSpace: 'BGR',
    scoreThreshold: 0.6,
    nmsThreshold: 0.3,
    topK: 5000,
    outputFormat: '15-element tensor per face: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rc, y_rc, x_lc, y_lc, score]',
  },
  recognizer: {
    name: 'OpenCV SFace Face Recognizer',
    filename: 'face_recognition_sface_2021dec_int8.onnx',
    version: '2021dec_int8',
    source: 'OpenCV Zoo (Apache 2.0)',
    quantization: 'INT8',
    inputShape: [1, 3, 112, 112], // [batch, channels, height, width]
    colorSpace: 'BGR',
    normalization: {
      scale: 1.0,
      mean: [0.0, 0.0, 0.0],
    },
    outputDimension: 128,
    postProcessing: 'L2 Normalization (norm = 1.0)',
    distanceMetric: 'Cosine Similarity (Threshold: 0.363)',
  },
  // Canonical SFace 112x112 5-point facial landmarks template
  canonicalLandmarks112: {
    rightEye: { x: 38.2946, y: 51.6963 },
    leftEye: { x: 73.5318, y: 51.5014 },
    noseTip: { x: 56.0252, y: 71.7366 },
    rightMouthCorner: { x: 41.5493, y: 92.3655 },
    leftMouthCorner: { x: 70.7299, y: 92.2041 },
  },
} as const;
