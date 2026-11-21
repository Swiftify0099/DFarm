// Bridge Jest VM TypedArray with Node native addon TypedArray
for (const ctor of [Float32Array, Uint8Array, Int8Array, Int32Array]) {
  try {
    Object.defineProperty(ctor, Symbol.hasInstance, {
      value: (inst: any) => inst != null && (inst.constructor?.name === ctor.name),
      configurable: true,
    });
  } catch {
    // Ignore
  }
}
try {
  require('onnxruntime-node');
  for (const key of Object.keys(require.cache)) {
    if (key.includes('tensor-impl-type-mapping')) {
      const mod = require.cache[key]?.exports;
      if (mod?.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP) {
        for (const [type, ctor] of mod.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.entries()) {
          try {
            Object.defineProperty(ctor, Symbol.hasInstance, {
              value: (inst: any) => inst != null && (inst.constructor?.name === ctor.name),
              configurable: true,
            });
          } catch {
            // Ignore
          }
        }
      }
    }
  }
} catch {
  // Ignore
}

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

    const emptyResult = await yuNetDetector.detectFaces();
    expect(emptyResult.faces).toEqual([]);

    const path = require('path');
    const fs = require('fs');
    const Jimp = require('jimp-compact');
    const imgPath = path.resolve(__dirname, '../../../../astro_test.jpg');
    if (fs.existsSync(imgPath)) {
      const img = await Jimp.read(imgPath);
      img.resize(640, 640);
      const data = new Float32Array(3 * 640 * 640);
      for (let y = 0; y < 640; y++) {
        for (let x = 0; x < 640; x++) {
          const idx = (y * 640 + x) * 4;
          data[0 * 640 * 640 + y * 640 + x] = img.bitmap.data[idx + 2];
          data[1 * 640 * 640 + y * 640 + x] = img.bitmap.data[idx + 1];
          data[2 * 640 * 640 + y * 640 + x] = img.bitmap.data[idx];
        }
      }
      const result = await yuNetDetector.detectFaces({ width: 640, height: 640, data });
      expect(result.faces.length).toBeGreaterThan(0);
      expect(result.faces[0].confidence).toBeGreaterThan(0.6);
      expect(result.faces[0].landmarks.noseTip).toBeDefined();
    }
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

    // Rejects missing face input tensor (no fake fixture in production)
    await expect(sFaceEmbedder.generateEmbedding(dummyLandmarks)).rejects.toThrow();

    const dummyFaceCrop = new Float32Array(3 * 112 * 112);
    for (let i = 0; i < dummyFaceCrop.length; i++) {
      dummyFaceCrop[i] = (i % 255);
    }
    const embeddingResult = await sFaceEmbedder.generateEmbedding(dummyLandmarks, dummyFaceCrop);
    expect(embeddingResult.embedding.length).toBe(128);
    expect(embeddingResult.isNormalized).toBe(true);
    const norm = Math.sqrt(embeddingResult.embedding.reduce((sum, v) => sum + v * v, 0));
    expect(Math.abs(norm - 1.0)).toBeLessThan(1e-4);
  });
});
