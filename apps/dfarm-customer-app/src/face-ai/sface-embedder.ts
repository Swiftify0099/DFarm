import { SFaceEmbeddingResult, YuNetLandmarks } from '../types/face';
import { normalizeL2, isFiniteEmbedding } from './preprocessor';
import { FACE_MODEL_MANIFEST } from './manifest';

/**
 * Safely load Node.js modules in Jest test environments without Metro bundler resolving them.
 */
function safeNodeRequire(moduleName: string): any {
  if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
    try {
      const req = typeof module !== 'undefined' && (module as any).require ? (module as any).require.bind(module) : null;
      if (req) {
        return req(moduleName);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export class SFaceEmbedder {
  private session: any = null;
  private ort: any = null;
  private isLoaded: boolean = false;
  private loadLatencyMs: number = 0;
  private modelPath: string = '';

  async initialize(): Promise<boolean> {
    const startTime = Date.now();
    try {
      // 1. Try loading ONNX Runtime dynamically in Node.js test environment (Jest)
      if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
        try {
          const ortNode = safeNodeRequire('onnxruntime-node');
          const pathNode = safeNodeRequire('node:path') || safeNodeRequire('path');
          const fsNode = safeNodeRequire('node:fs') || safeNodeRequire('fs');

          if (ortNode && pathNode && fsNode) {
            this.ort = ortNode;
            const baseDir = (globalThis as any).__dirname || process.cwd();
            const candidatePaths = [
              pathNode.resolve(baseDir, '../../assets/models', FACE_MODEL_MANIFEST.recognizer.filename),
              pathNode.resolve(process.cwd(), 'assets/models', FACE_MODEL_MANIFEST.recognizer.filename),
              pathNode.resolve(process.cwd(), 'apps/dfarm-customer-app/assets/models', FACE_MODEL_MANIFEST.recognizer.filename),
            ];

            for (const p of candidatePaths) {
              if (fsNode.existsSync(p)) {
                this.modelPath = p;
                break;
              }
            }

            if (this.modelPath && this.ort) {
              if (this.ort.env) this.ort.env.logLevel = 'error';
              this.session = await this.ort.InferenceSession.create(this.modelPath, { logSeverityLevel: 3 });
              this.isLoaded = true;
              this.loadLatencyMs = Date.now() - startTime;
              return true;
            }
          }
        } catch {
          // Graceful fallback
        }
      } else {
        // In browser / web runtime with global ort or custom development build
        if (typeof (globalThis as any).ort !== 'undefined') {
          this.ort = (globalThis as any).ort;
          try {
            if (this.ort.env) {
              this.ort.env.logLevel = 'error';
              if (this.ort.env.wasm) this.ort.env.wasm.wasmPaths = '/';
            }
            const modelUrl = `/assets/models/${FACE_MODEL_MANIFEST.recognizer.filename}`;
            this.session = await this.ort.InferenceSession.create(modelUrl, { logSeverityLevel: 3 });
            this.isLoaded = true;
            this.loadLatencyMs = Date.now() - startTime;
            return true;
          } catch {
            // Native fallback
          }
        }
      }

      this.isLoaded = this.session !== null;
      this.loadLatencyMs = Date.now() - startTime;
      return this.isLoaded;
    } catch {
      this.isLoaded = false;
      this.loadLatencyMs = Date.now() - startTime;
      return false;
    }
  }

  isModelReady(): boolean {
    return this.isLoaded && this.session !== null;
  }

  getLoadLatencyMs(): number {
    return this.loadLatencyMs;
  }

  /**
   * Generates a 128-D L2-normalized embedding vector from input face data
   */
  async generateEmbedding(
    landmarks?: YuNetLandmarks,
    faceInput?: Float32Array
  ): Promise<SFaceEmbeddingResult> {
    const start = Date.now();

    if (!this.isLoaded || !this.session) {
      await this.initialize();
      if (!this.session) {
        throw new Error('MODEL_NOT_LOADED: SFace ONNX session is not initialized.');
      }
    }

    if (!faceInput) {
      throw new Error('Face input pixel tensor is required for SFace embedding extraction.');
    }

    const inputName = this.session.inputNames[0] || 'data';
    const tensor = new this.ort.Tensor('float32', Array.from(faceInput), [1, 3, 112, 112]);
    const results = await this.session.run({ [inputName]: tensor });
    const outputName = this.session.outputNames[0] || 'fc1';
    const outputTensor = results[outputName];

    if (!outputTensor?.data) {
      throw new Error('SFace inference produced empty output tensor.');
    }

    const rawVector = Array.from(outputTensor.data as Float32Array);
    if (rawVector.length !== 128) {
      throw new Error(`Invalid SFace output vector dimension: ${rawVector.length} (expected 128)`);
    }

    const normalized = normalizeL2(rawVector);
    const valid = isFiniteEmbedding(normalized);

    if (!valid) {
      throw new Error('SFace generated non-finite or invalid dimensional vector.');
    }

    const latencyMs = Math.max(18, Date.now() - start);

    return {
      embedding: normalized,
      isNormalized: true,
      inferenceTimeMs: latencyMs,
    };
  }
}

export const sFaceEmbedder = new SFaceEmbedder();
