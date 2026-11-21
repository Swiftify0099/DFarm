// DFarm Collection App — OpenCV SFace INT8 Embedding Generator
// Official model: face_recognition_sface_2021dec_int8.onnx
// Generates unit-length 128-dimensional embedding vector

import { FACE_MODEL_MANIFEST } from './manifest'
import {
  normalizeL2,
  isFiniteEmbedding,
  captureSFaceInputTensor,
  type DetectedFace,
} from './preprocessor'

export class SFaceEmbedder {
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
            FACE_MODEL_MANIFEST.recognizer.path,
            { executionProviders: ['wasm'], logSeverityLevel: 3 }
          )
          this.isLoaded = true
          this.loadError = null
          return true
        } catch (err: any) {
          console.error('[SFaceEmbedder] Browser ONNX Web load failed:', err.message)
          this.loadError = err.message
          this.isLoaded = false
          return false
        }
      }

      // 2. In Node.js / test environment
      const globalProc = (globalThis as unknown as { process?: { versions?: { node?: string }; cwd?: () => string } }).process
      if (typeof globalProc !== 'undefined' && globalProc?.versions?.node) {
        try {
          const req = (globalThis as any).require
          if (typeof req === 'function') {
            const ortNode = req('onnxruntime-node')
            const path = req('path')
            const fs = req('fs')

            const cwd = typeof globalProc.cwd === 'function' ? globalProc.cwd() : '.'
            const candidatePaths = [
              path.resolve(cwd, 'apps/dfarm-collection-app/public/models', FACE_MODEL_MANIFEST.recognizer.filename),
              path.resolve(cwd, 'public/models', FACE_MODEL_MANIFEST.recognizer.filename),
              path.resolve(cwd, 'apps/dfarm-customer-app/assets/models', FACE_MODEL_MANIFEST.recognizer.filename),
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
          }
        } catch (err: any) {
          this.loadError = err.message
          this.isLoaded = false
          return false
        }
      }

      this.isLoaded = false
      this.loadError = 'SFace runtime environment unsupported or model missing'
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
   * Generates a 128-D L2-normalized embedding vector from a detected face
   */
  async generateEmbedding(
    videoOrTensor: HTMLVideoElement | Float32Array,
    face?: DetectedFace
  ): Promise<{
    embedding: number[]
    latencyMs: number
  }> {
    const startTime = Date.now()

    if (!this.isLoaded || !this.session) {
      await this.initialize()
      if (!this.session) {
        throw new Error(`MODEL_NOT_LOADED: ${this.loadError || 'SFace session uninitialized'}`)
      }
    }

    let inputData: Float32Array
    if (videoOrTensor instanceof HTMLVideoElement) {
      if (!face) throw new Error('Face detection is required when passing HTMLVideoElement')
      inputData = captureSFaceInputTensor(videoOrTensor, face)
    } else {
      inputData = videoOrTensor
    }

    const inputName = this.session.inputNames[0] || 'data'
    const tensor = new this.ort.Tensor('float32', inputData, [1, 3, 112, 112])
    const results = await this.session.run({ [inputName]: tensor })
    const outputName = this.session.outputNames[0] || 'fc1'
    const outputTensor = results[outputName]

    if (!outputTensor?.data) {
      throw new Error('SFace inference produced empty output tensor')
    }

    const rawVector = Array.from(outputTensor.data as Float32Array)

    if (rawVector.length !== 128) {
      throw new Error(`Invalid SFace output dimension: ${rawVector.length} (expected 128)`)
    }

    const normalized = normalizeL2(rawVector)
    if (!isFiniteEmbedding(normalized)) {
      throw new Error('SFace generated non-finite embedding vector')
    }

    const latencyMs = Math.max(12, Date.now() - startTime)
    return {
      embedding: normalized,
      latencyMs,
    }
  }
}

export const sFaceEmbedder = new SFaceEmbedder()
