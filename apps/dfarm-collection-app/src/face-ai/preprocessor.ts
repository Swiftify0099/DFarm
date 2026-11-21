// DFarm Collection App — Face Preprocessor & Biometric Math
// Strictly adheres to OpenCV YuNet (640x640 BGR) and SFace (112x112 BGR) specs

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface FacialLandmarks {
  rightEye: { x: number; y: number }
  leftEye: { x: number; y: number }
  noseTip: { x: number; y: number }
  rightMouthCorner: { x: number; y: number }
  leftMouthCorner: { x: number; y: number }
}

export interface DetectedFace {
  boundingBox: BoundingBox
  landmarks: FacialLandmarks
  confidence: number
}

/**
 * Normalizes a vector to unit length (L2 norm = 1.0)
 */
export function normalizeL2(vector: number[]): number[] {
  let sumSq = 0
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i]
  }
  const norm = Math.sqrt(sumSq)
  if (norm === 0 || !Number.isFinite(norm)) {
    return new Array(vector.length).fill(0)
  }
  return vector.map((v) => v / norm)
}

export function isFiniteEmbedding(vector: number[]): boolean {
  if (!Array.isArray(vector) || vector.length !== 128) return false
  return vector.every((val) => typeof val === 'number' && Number.isFinite(val))
}

/**
 * Averages multiple quality-checked 128-D embedding vectors and applies L2 unit normalization
 */
export function averageAndNormalizeEmbeddings(vectors: number[][]): number[] {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    return new Array(128).fill(0)
  }
  const dim = vectors[0].length
  const accumulator = new Array(dim).fill(0)

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      accumulator[i] += vec[i] || 0
    }
  }

  const averaged = accumulator.map((val) => val / vectors.length)
  return normalizeL2(averaged)
}

/**
 * Computes Cosine Similarity between two embedding vectors
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0 || !Number.isFinite(denominator)) return 0

  return dotProduct / denominator
}

export const cosineSimilarity = computeCosineSimilarity

/**
 * Captures a video frame onto an in-memory canvas and converts to Float32Array
 * in [1, 3, 640, 640] BGR channel order for OpenCV YuNet
 */
export function captureYuNetInputTensor(video: HTMLVideoElement): {
  tensorData: Float32Array
  width: number
  height: number
} {
  const targetW = 640
  const targetH = 640

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context for camera frame')
  }

  // Draw video scaled to 640x640
  ctx.drawImage(video, 0, 0, targetW, targetH)
  const imgData = ctx.getImageData(0, 0, targetW, targetH).data

  // Planar BGR format: [1, 3, 640, 640] -> B plane, G plane, R plane
  const planeSize = targetW * targetH
  const tensorData = new Float32Array(3 * planeSize)

  const bOffset = 0
  const gOffset = planeSize
  const rOffset = 2 * planeSize

  for (let i = 0; i < planeSize; i++) {
    const r = imgData[i * 4]
    const g = imgData[i * 4 + 1]
    const b = imgData[i * 4 + 2]

    // OpenCV YuNet expects raw BGR values in [0, 255] as float32
    tensorData[bOffset + i] = b
    tensorData[gOffset + i] = g
    tensorData[rOffset + i] = r
  }

  return { tensorData, width: targetW, height: targetH }
}

/**
 * Crops and aligns detected face into [1, 3, 112, 112] BGR tensor for SFace
 */
export function captureSFaceInputTensor(
  video: HTMLVideoElement,
  face: DetectedFace
): Float32Array {
  const targetSize = 112
  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (!ctx) {
    throw new Error('Failed to acquire canvas context for SFace crop')
  }

  const { boundingBox } = face
  // Add 15% margin around bounding box for context
  const marginX = boundingBox.width * 0.15
  const marginY = boundingBox.height * 0.15

  const sx = Math.max(0, boundingBox.x - marginX)
  const sy = Math.max(0, boundingBox.y - marginY)
  const sw = Math.min(video.videoWidth || 640, boundingBox.width + 2 * marginX)
  const sh = Math.min(video.videoHeight || 640, boundingBox.height + 2 * marginY)

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetSize, targetSize)
  const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data

  // Planar BGR format: [1, 3, 112, 112]
  const planeSize = targetSize * targetSize
  const tensorData = new Float32Array(3 * planeSize)

  const bOffset = 0
  const gOffset = planeSize
  const rOffset = 2 * planeSize

  for (let i = 0; i < planeSize; i++) {
    const r = imgData[i * 4]
    const g = imgData[i * 4 + 1]
    const b = imgData[i * 4 + 2]

    tensorData[bOffset + i] = b
    tensorData[gOffset + i] = g
    tensorData[rOffset + i] = r
  }

  return tensorData
}
