import { FACE_MODEL_MANIFEST } from '../../src/face-ai/manifest';
import { yuNetDetector } from '../../src/face-ai/yunet-detector';
import { sFaceEmbedder } from '../../src/face-ai/sface-embedder';

describe('YuNet & SFace INT8 Model Manifest & Engine', () => {
  test('confirms exact YuNet model parameters', () => {
    expect(FACE_MODEL_MANIFEST.detector.name).toBe('OpenCV YuNet Face Detector');
    expect(FACE_MODEL_MANIFEST.detector.filename).toBe('face_detection_yunet_2023mar.onnx');
    expect(FACE_MODEL_MANIFEST.detector.quantization).toBe('FP32');
    expect(FACE_MODEL_MANIFEST.detector.scoreThreshold).toBe(0.6);
  });

  test('confirms exact SFace INT8 model parameters', () => {
    expect(FACE_MODEL_MANIFEST.recognizer.name).toBe('OpenCV SFace Face Recognizer');
    expect(FACE_MODEL_MANIFEST.recognizer.filename).toBe('face_recognition_sface_2021dec_int8.onnx');
    expect(FACE_MODEL_MANIFEST.recognizer.quantization).toBe('INT8');
    expect(FACE_MODEL_MANIFEST.recognizer.outputDimension).toBe(128);
  });

  test('initializes and executes YuNet face detector', async () => {
    const ready = await yuNetDetector.initialize();
    expect(ready).toBe(true);

    const result = await yuNetDetector.detectFaces();
    expect(result.faces.length).toBeGreaterThan(0);
    expect(result.faces[0].confidence).toBeGreaterThan(0.6);
    expect(result.faces[0].landmarks.noseTip).toBeDefined();
  });

  test('initializes and generates 128-D embedding with SFace embedder', async () => {
    const ready = await sFaceEmbedder.initialize();
    expect(ready).toBe(true);

    const dummyLandmarks = {
      rightEye: { x: 100, y: 120 },
      leftEye: { x: 220, y: 120 },
      noseTip: { x: 160, y: 170 },
      rightMouthCorner: { x: 110, y: 220 },
      leftMouthCorner: { x: 210, y: 220 },
    };

    const embeddingResult = await sFaceEmbedder.generateEmbedding(dummyLandmarks);
    expect(embeddingResult.embedding.length).toBe(128);
    expect(embeddingResult.isNormalized).toBe(true);
  });
});
