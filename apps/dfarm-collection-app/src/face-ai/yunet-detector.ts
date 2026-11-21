// DFarm Collection App — OpenCV YuNet Face Detection Engine
// Official model: face_detection_yunet_2023mar.onnx

import { FACE_MODEL_MANIFEST } from './manifest'
import {
  captureYuNetInputTensor,
  type DetectedFace,
} from './preprocessor'

function computeIoU(
  b1: { x: number; y: number; w: number; h: number },
  b2: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(b1.x, b2.x)
  const y1 = Math.max(b1.y, b2.y)
  const x2 = Math.min(b1.x + b1.w, b2.x + b2.w)
  const y2 = Math.min(b1.y + b1.h, b2.y + b2.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = b1.w * b1.h + b2.w * b2.h - inter
  return union > 0 ? inter / union : 0
}

function nonMaxSuppression<T extends { x: number; y: number; w: number; h: number; score: number }>(
  boxes: T[],
  iouThreshold = 0.4
): T[] {
  boxes.sort((a, b) => b.score - a.score)
  const selected: T[] = []
  const active = new Array(boxes.length).fill(true)

  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue
    selected.push(boxes[i])
    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue
      if (computeIoU(boxes[i], boxes[j]) > iouThreshold) {
        active[j] = false
      }
    }
  }
  return selected
}

export class YuNetDetector {
  private session: any = null
  private ort: any = null
  private isLoaded: boolean = false
  private loadError: string | null = null

  async initialize(): Promise<boolean> {
    if (this.isLoaded && this.session) return true

    try {
      // 1. In browser runtime with onnxruntime-web
      if (typeof window !== 'undefined') {
        try {
          const ortWeb = await import('onnxruntime-web')
          this.ort = ortWeb
          if (ortWeb.env) {
            ortWeb.env.logLevel = 'error'
            if (ortWeb.env.wasm) {
              ortWeb.env.wasm.wasmPaths = '/'
            }
          }
          this.session = await ortWeb.InferenceSession.create(
            FACE_MODEL_MANIFEST.detector.path,
            { executionProviders: ['wasm'], logSeverityLevel: 3 }
          )
          this.isLoaded = true
          this.loadError = null
          return true
        } catch (err: any) {
          console.error('[YuNetDetector] Browser ONNX Web load failed:', err.message)
          this.loadError = err.message
          this.isLoaded = false
          return false
        }
      }

      // 2. In Node.js / test environment
      if (typeof process !== 'undefined' && process.versions?.node) {
        try {
          const ortNode = await import('onnxruntime-node')
          const path = await import('node:path')
          const fs = await import('node:fs')

          const candidatePaths = [
            path.resolve(process.cwd(), 'apps/dfarm-collection-app/public/models', FACE_MODEL_MANIFEST.detector.filename),
            path.resolve(process.cwd(), 'public/models', FACE_MODEL_MANIFEST.detector.filename),
            path.resolve(process.cwd(), 'apps/dfarm-customer-app/assets/models', FACE_MODEL_MANIFEST.detector.filename),
          ]

          let modelPath = ''
          for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
              modelPath = p
              break
            }
          }

          if (modelPath) {
            this.ort = ortNode
            this.session = await ortNode.InferenceSession.create(modelPath, { logSeverityLevel: 3 })
            this.isLoaded = true
            this.loadError = null
            return true
          }
        } catch (err: any) {
          this.loadError = err.message
          this.isLoaded = false
          return false
        }
      }

      this.isLoaded = false
      this.loadError = 'YuNet runtime environment unsupported or model missing'
      return false
    } catch (err: any) {
      this.loadError = err.message
      this.isLoaded = false
      return false
    }
  }

  isModelReady(): boolean {
    return this.isLoaded && this.session !== null
  }

  getLoadError(): string | null {
    return this.loadError
  }

  /**
   * Run YuNet Face Detection on an HTMLVideoElement or raw tensor
   */
  async detect(
    source: HTMLVideoElement | { tensorData: Float32Array; width: number; height: number }
  ): Promise<DetectedFace[]> {
    if (!this.isLoaded || !this.session) {
      await this.initialize()
      if (!this.session) {
        return []
      }
    }

    let inputTensorData: Float32Array
    let origW = 640
    let origH = 640

    if (source instanceof HTMLVideoElement) {
      if (!source.videoWidth || !source.videoHeight) {
        return []
      }
      origW = source.videoWidth
      origH = source.videoHeight
      const captured = captureYuNetInputTensor(source)
      inputTensorData = captured.tensorData
    } else {
      inputTensorData = source.tensorData
      origW = source.width
      origH = source.height
    }

    // Run real ONNX Session
    if (this.session && this.ort) {
      try {
        const inputName = this.session.inputNames[0] || 'input'
        const tensor = new this.ort.Tensor('float32', inputTensorData, [1, 3, 640, 640])
        const results = await this.session.run({ [inputName]: tensor })

        const scaleX = origW / 640
        const scaleY = origH / 640
        const candidates: Array<{
          x: number
          y: number
          w: number
          h: number
          score: number
          face: DetectedFace
        }> = []

        // Evaluate output strides 8, 16, 32 with proper anchor math
        for (const stride of FACE_MODEL_MANIFEST.detector.strides) {
          const cls = results[`cls_${stride}`]?.data as Float32Array
          const obj = results[`obj_${stride}`]?.data as Float32Array
          const bbox = results[`bbox_${stride}`]?.data as Float32Array
          const kps = results[`kps_${stride}`]?.data as Float32Array

          if (cls && obj && bbox && kps) {
            const count = cls.length
            const cols = 640 / stride

            for (let i = 0; i < count; i++) {
              const score = Math.sqrt(Math.max(0, cls[i]) * Math.max(0, obj[i]))
              if (score >= FACE_MODEL_MANIFEST.detector.scoreThreshold) {
                const row = Math.floor(i / cols)
                const col = i % cols
                const px = col * stride
                const py = row * stride
                const cx = px + (bbox[i * 4] || 0) * stride
                const cy = py + (bbox[i * 4 + 1] || 0) * stride
                const bw = Math.exp(bbox[i * 4 + 2] || 0) * stride
                const bh = Math.exp(bbox[i * 4 + 3] || 0) * stride

                const left = (cx - bw / 2) * scaleX
                const top = (cy - bh / 2) * scaleY
                const width = bw * scaleX
                const height = bh * scaleY

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
                      confidence: Math.min(0.99, Number(score.toFixed(4))),
                    },
                    landmarks: {
                      rightEye: {
                        x: Math.round((px + (kps[i * 10] || 0) * stride) * scaleX),
                        y: Math.round((py + (kps[i * 10 + 1] || 0) * stride) * scaleY),
                      },
                      leftEye: {
                        x: Math.round((px + (kps[i * 10 + 2] || 0) * stride) * scaleX),
                        y: Math.round((py + (kps[i * 10 + 3] || 0) * stride) * scaleY),
                      },
                      noseTip: {
                        x: Math.round((px + (kps[i * 10 + 4] || 0) * stride) * scaleX),
                        y: Math.round((py + (kps[i * 10 + 5] || 0) * stride) * scaleY),
                      },
                      rightMouthCorner: {
                        x: Math.round((px + (kps[i * 10 + 6] || 0) * stride) * scaleX),
                        y: Math.round((py + (kps[i * 10 + 7] || 0) * stride) * scaleY),
                      },
                      leftMouthCorner: {
                        x: Math.round((px + (kps[i * 10 + 8] || 0) * stride) * scaleX),
                        y: Math.round((py + (kps[i * 10 + 9] || 0) * stride) * scaleY),
                      },
                    },
                    confidence: Math.min(0.99, Number(score.toFixed(4))),
                  },
                })
              }
            }
          }
        }

        const filtered = nonMaxSuppression(candidates, FACE_MODEL_MANIFEST.detector.nmsThreshold)
        return filtered.map((c) => c.face)
      } catch (err: any) {
        console.warn('[YuNetDetector] Real inference exception:', err.message)
        this.loadError = err.message
        return []
      }
    }

    // In production, never return synthetic or fake boxes
    return []
  }
}

export const yuNetDetector = new YuNetDetector()
