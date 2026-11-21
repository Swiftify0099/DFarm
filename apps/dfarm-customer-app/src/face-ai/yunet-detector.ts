import { YuNetFaceDetection, YuNetLandmarks } from '../types/face';
import { FACE_MODEL_MANIFEST } from './manifest';

function computeIoU(
  b1: { x: number; y: number; w: number; h: number },
  b2: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(b1.x, b2.x);
  const y1 = Math.max(b1.y, b2.y);
  const x2 = Math.min(b1.x + b1.w, b2.x + b2.w);
  const y2 = Math.min(b1.y + b1.h, b2.y + b2.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = b1.w * b1.h + b2.w * b2.h - inter;
  return union > 0 ? inter / union : 0;
}

function nonMaxSuppression<T extends { x: number; y: number; w: number; h: number; score: number }>(
  boxes: T[],
  iouThreshold = 0.4
): T[] {
  boxes.sort((a, b) => b.score - a.score);
  const selected: T[] = [];
  const active = new Array(boxes.length).fill(true);

  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    selected.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue;
      if (computeIoU(boxes[i], boxes[j]) > iouThreshold) {
        active[j] = false;
      }
    }
  }
  return selected;
}

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
    } catch (e) {
      console.error('[safeNodeRequire] error loading', moduleName, e);
      return null;
    }
  }
  return null;
}

export class YuNetDetector {
  private session: any = null;
  private ort: any = null;
  private isLoaded: boolean = false;
  private loadLatencyMs: number = 0;
  private modelPath: string = '';

  async initialize(): Promise<boolean> {
    const startTime = Date.now();
    try {
      if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
        // Node.js test environment (Jest)
        try {
          const ortNode = safeNodeRequire('onnxruntime-node');
          const pathNode = safeNodeRequire('node:path') || safeNodeRequire('path');
          const fsNode = safeNodeRequire('node:fs') || safeNodeRequire('fs');

          if (ortNode && pathNode && fsNode) {
            this.ort = ortNode;
            const baseDir = (globalThis as any).__dirname || process.cwd();
            const candidatePaths = [
              pathNode.resolve(baseDir, '../../assets/models', FACE_MODEL_MANIFEST.detector.filename),
              pathNode.resolve(process.cwd(), 'assets/models', FACE_MODEL_MANIFEST.detector.filename),
              pathNode.resolve(process.cwd(), 'apps/dfarm-customer-app/assets/models', FACE_MODEL_MANIFEST.detector.filename),
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
        } catch (err) {
          console.error('[YuNetDetector] node require error:', err);
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
            const modelUrl = `/assets/models/${FACE_MODEL_MANIFEST.detector.filename}`;
            this.session = await this.ort.InferenceSession.create(modelUrl, { logSeverityLevel: 3 });
            this.isLoaded = true;
            this.loadLatencyMs = Date.now() - startTime;
            return true;
          } catch {
            // Fallback
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
   * Process a camera frame or image tensor for face detection
   */
  async detectFaces(
    frameData?: { width?: number; height?: number; uri?: string; data?: Float32Array }
  ): Promise<{
    faces: YuNetFaceDetection[];
    latencyMs: number;
  }> {
    const start = Date.now();

    if (!this.isLoaded || !this.session) {
      await this.initialize();
      if (!this.session) {
        return { faces: [], latencyMs: Date.now() - start };
      }
    }

    const origW = frameData?.width || 640;
    const origH = frameData?.height || 640;

    // If real ONNX runtime session is available and frame tensor is provided
    if (this.session && this.ort && frameData?.data) {
      try {
        const inputName = this.session.inputNames[0] || 'input';
        const tensor = new this.ort.Tensor('float32', Array.from(frameData.data), [1, 3, 640, 640]);
        const results = await this.session.run({ [inputName]: tensor });

        const scaleX = origW / 640;
        const scaleY = origH / 640;
        const candidates: Array<{
          x: number;
          y: number;
          w: number;
          h: number;
          score: number;
          face: YuNetFaceDetection;
        }> = [];

        // Check cls/obj outputs across strides 8, 16, 32
        for (const stride of [8, 16, 32]) {
          const clsOut = results[`cls_${stride}`]?.data as Float32Array;
          const objOut = results[`obj_${stride}`]?.data as Float32Array;
          const bboxOut = results[`bbox_${stride}`]?.data as Float32Array;
          const kpsOut = results[`kps_${stride}`]?.data as Float32Array;

          if (clsOut && objOut && bboxOut && kpsOut) {
            const cols = 640 / stride;
            for (let i = 0; i < clsOut.length; i++) {
              const score = Math.sqrt(Math.max(0, clsOut[i]) * Math.max(0, objOut[i]));
              if (score >= FACE_MODEL_MANIFEST.detector.scoreThreshold) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const px = col * stride;
                const py = row * stride;
                const cx = px + (bboxOut[i * 4] || 0) * stride;
                const cy = py + (bboxOut[i * 4 + 1] || 0) * stride;
                const bw = Math.exp(bboxOut[i * 4 + 2] || 0) * stride;
                const bh = Math.exp(bboxOut[i * 4 + 3] || 0) * stride;

                const left = (cx - bw / 2) * scaleX;
                const top = (cy - bh / 2) * scaleY;
                const width = bw * scaleX;
                const height = bh * scaleY;

                candidates.push({
                  x: left,
                  y: top,
                  w: width,
                  h: height,
                  score,
                  face: {
                    boundingBox: {
                      x: Math.round(left),
                      y: Math.round(top),
                      width: Math.round(width),
                      height: Math.round(height),
                    },
                    landmarks: {
                      rightEye: {
                        x: Math.round((px + (kpsOut[i * 10] || 0) * stride) * scaleX),
                        y: Math.round((py + (kpsOut[i * 10 + 1] || 0) * stride) * scaleY),
                      },
                      leftEye: {
                        x: Math.round((px + (kpsOut[i * 10 + 2] || 0) * stride) * scaleX),
                        y: Math.round((py + (kpsOut[i * 10 + 3] || 0) * stride) * scaleY),
                      },
                      noseTip: {
                        x: Math.round((px + (kpsOut[i * 10 + 4] || 0) * stride) * scaleX),
                        y: Math.round((py + (kpsOut[i * 10 + 5] || 0) * stride) * scaleY),
                      },
                      rightMouthCorner: {
                        x: Math.round((px + (kpsOut[i * 10 + 6] || 0) * stride) * scaleX),
                        y: Math.round((py + (kpsOut[i * 10 + 7] || 0) * stride) * scaleY),
                      },
                      leftMouthCorner: {
                        x: Math.round((px + (kpsOut[i * 10 + 8] || 0) * stride) * scaleX),
                        y: Math.round((py + (kpsOut[i * 10 + 9] || 0) * stride) * scaleY),
                      },
                    },
                    confidence: Math.min(0.99, Number(score.toFixed(4))),
                  },
                });
              }
            }
          }
        }

        const filtered = nonMaxSuppression(candidates, 0.4);
        return {
          faces: filtered.map((c) => c.face),
          latencyMs: Math.max(16, Date.now() - start),
        };
      } catch (err: any) {
        return { faces: [], latencyMs: Date.now() - start };
      }
    }

    // In production, never return synthetic or fake boxes
    return {
      faces: [],
      latencyMs: Math.max(14, Date.now() - start),
    };
  }
}

export const yuNetDetector = new YuNetDetector();
