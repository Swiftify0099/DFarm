import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import Jimp from 'jimp-compact';

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface FaceLandmarks {
  rightEye: { x: number; y: number };
  leftEye: { x: number; y: number };
  noseTip: { x: number; y: number };
  rightMouthCorner: { x: number; y: number };
  leftMouthCorner: { x: number; y: number };
}

export interface DetectedFace {
  boundingBox: FaceBoundingBox;
  landmarks: FaceLandmarks;
  confidence: number;
}

export interface AlignmentQuality {
  isAligned: boolean;
  rollDegrees: number;
  yawRatio: number;
  reason?: string;
}

export interface BiometricDetectionResult {
  faces: DetectedFace[];
  faceCount: number;
  topFace?: DetectedFace;
  alignment?: AlignmentQuality;
  embedding?: number[];
  latencyMs: number;
  modelVersion: string;
}

function computeIoU(b1: { x: number; y: number; w: number; h: number }, b2: { x: number; y: number; w: number; h: number }): number {
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
    selected.push(boxes[i]!);
    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue;
      if (computeIoU(boxes[i]!, boxes[j]!) > iouThreshold) {
        active[j] = false;
      }
    }
  }
  return selected;
}

export function checkAlignmentQuality(landmarks: FaceLandmarks): AlignmentQuality {
  const { rightEye, leftEye, noseTip, rightMouthCorner, leftMouthCorner } = landmarks;
  const dy = leftEye.y - rightEye.y;
  const dx = leftEye.x - rightEye.x;
  const eyeDist = Math.hypot(dx, dy);

  if (eyeDist < 20) {
    return {
      isAligned: false,
      rollDegrees: 0,
      yawRatio: 0,
      reason: 'Face is too far from camera or resolution is too low.',
    };
  }

  const rollDegrees = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
  if (rollDegrees > 18) {
    return {
      isAligned: false,
      rollDegrees,
      yawRatio: 0,
      reason: `Head tilt detected (${rollDegrees.toFixed(1)}°). Please hold head upright.`,
    };
  }

  const eyeMidX = (rightEye.x + leftEye.x) / 2;
  const yawOffset = Math.abs(noseTip.x - eyeMidX);
  const yawRatio = yawOffset / eyeDist;

  if (yawRatio > 0.45) {
    return {
      isAligned: false,
      rollDegrees,
      yawRatio,
      reason: 'Head turned sideways. Please look directly at the camera.',
    };
  }

  const mouthMidY = (rightMouthCorner.y + leftMouthCorner.y) / 2;
  if (mouthMidY <= noseTip.y) {
    return {
      isAligned: false,
      rollDegrees,
      yawRatio,
      reason: 'Vertical face misalignment detected. Please position face straight.',
    };
  }

  return {
    isAligned: true,
    rollDegrees,
    yawRatio,
  };
}

export class BiometricInferenceService {
  private static instance: BiometricInferenceService | null = null;
  private ort: any = null;
  private yunetSession: any = null;
  private sfaceSession: any = null;
  private isLoaded = false;
  private loadError: string | null = null;

  static getInstance(): BiometricInferenceService {
    if (!BiometricInferenceService.instance) {
      BiometricInferenceService.instance = new BiometricInferenceService();
    }
    return BiometricInferenceService.instance;
  }

  async initialize(): Promise<boolean> {
    if (this.isLoaded && this.yunetSession && this.sfaceSession) return true;

    try {
      this.ort = await import('onnxruntime-node');
      if (this.ort.env) {
        this.ort.env.logLevel = 'error';
      }

      const cwd = process.cwd();
      const possibleDirs = [
        path.resolve(cwd, 'apps/dfarm-customer-app/assets/models'),
        path.resolve(cwd, 'assets/models'),
        path.resolve(cwd, '../dfarm-customer-app/assets/models'),
        path.resolve(cwd, 'apps/dfarm-collection-app/public/models'),
      ];

      let yunetPath = '';
      let sfacePath = '';

      for (const d of possibleDirs) {
        const y = path.join(d, 'face_detection_yunet_2023mar.onnx');
        const s = path.join(d, 'face_recognition_sface_2021dec_int8.onnx');
        if (fs.existsSync(y) && fs.existsSync(s)) {
          yunetPath = y;
          sfacePath = s;
          break;
        }
      }

      if (!yunetPath || !sfacePath) {
        throw new Error(`ONNX model binaries not found in expected asset locations.`);
      }

      this.yunetSession = await this.ort.InferenceSession.create(yunetPath, { logSeverityLevel: 3 });
      this.sfaceSession = await this.ort.InferenceSession.create(sfacePath, { logSeverityLevel: 3 });
      this.isLoaded = true;
      return true;
    } catch (err: any) {
      this.loadError = err.message || 'Failed to initialize ONNX Runtime inference sessions.';
      this.isLoaded = false;
      return false;
    }
  }

  isReady(): boolean {
    return this.isLoaded && this.yunetSession !== null && this.sfaceSession !== null;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * Run real YuNet face detection on an image buffer (JPEG/PNG)
   */
  async detectFacesFromBuffer(buffer: Buffer): Promise<DetectedFace[]> {
    if (!this.isReady()) {
      const ok = await this.initialize();
      if (!ok) {
        throw new Error(`MODEL_NOT_LOADED: ${this.loadError}`);
      }
    }

    const img = await Jimp.read(buffer);
    const origW = img.bitmap.width;
    const origH = img.bitmap.height;

    // Rescale to 640x640 planar BGR Float32
    const resized = img.clone().resize(640, 640);
    const w = 640;
    const h = 640;
    const tensorData = new Float32Array(3 * w * h);
    const rOffset = 2 * w * h;
    const gOffset = 1 * w * h;
    const bOffset = 0 * w * h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = resized.bitmap.data[idx]!;
        const g = resized.bitmap.data[idx + 1]!;
        const b = resized.bitmap.data[idx + 2]!;
        const pixelIdx = y * w + x;
        tensorData[bOffset + pixelIdx] = b;
        tensorData[gOffset + pixelIdx] = g;
        tensorData[rOffset + pixelIdx] = r;
      }
    }

    const tensor = new this.ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
    const results = await this.yunetSession.run({ [this.yunetSession.inputNames[0]]: tensor });

    const scaleX = origW / 640;
    const scaleY = origH / 640;
    const candidates: Array<{
      x: number;
      y: number;
      w: number;
      h: number;
      score: number;
      landmarks: FaceLandmarks;
    }> = [];

    for (const s of [8, 16, 32]) {
      const cls = results[`cls_${s}`]?.data as Float32Array;
      const obj = results[`obj_${s}`]?.data as Float32Array;
      const bbox = results[`bbox_${s}`]?.data as Float32Array;
      const kps = results[`kps_${s}`]?.data as Float32Array;

      if (!cls || !obj || !bbox || !kps) continue;
      const cols = 640 / s;

      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(Math.max(0, cls[i]!) * Math.max(0, obj[i]!));
        if (score >= 0.6) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const px = col * s;
          const py = row * s;
          const cx = px + bbox[i * 4]! * s;
          const cy = py + bbox[i * 4 + 1]! * s;
          const bw = Math.exp(bbox[i * 4 + 2]!) * s;
          const bh = Math.exp(bbox[i * 4 + 3]!) * s;

          const left = (cx - bw / 2) * scaleX;
          const top = (cy - bh / 2) * scaleY;
          const width = bw * scaleX;
          const height = bh * scaleY;

          const landmarks: FaceLandmarks = {
            rightEye: { x: (px + kps[i * 10]! * s) * scaleX, y: (py + kps[i * 10 + 1]! * s) * scaleY },
            leftEye: { x: (px + kps[i * 10 + 2]! * s) * scaleX, y: (py + kps[i * 10 + 3]! * s) * scaleY },
            noseTip: { x: (px + kps[i * 10 + 4]! * s) * scaleX, y: (py + kps[i * 10 + 5]! * s) * scaleY },
            rightMouthCorner: { x: (px + kps[i * 10 + 6]! * s) * scaleX, y: (py + kps[i * 10 + 7]! * s) * scaleY },
            leftMouthCorner: { x: (px + kps[i * 10 + 8]! * s) * scaleX, y: (py + kps[i * 10 + 9]! * s) * scaleY },
          };

          candidates.push({ x: left, y: top, w: width, h: height, score, landmarks });
        }
      }
    }

    const nmsResults = nonMaxSuppression(candidates, 0.4);
    return nmsResults.map((c) => ({
      boundingBox: {
        x: Math.round(c.x),
        y: Math.round(c.y),
        width: Math.round(c.w),
        height: Math.round(c.h),
        confidence: Number(c.score.toFixed(4)),
      },
      landmarks: {
        rightEye: { x: Math.round(c.landmarks.rightEye.x), y: Math.round(c.landmarks.rightEye.y) },
        leftEye: { x: Math.round(c.landmarks.leftEye.x), y: Math.round(c.landmarks.leftEye.y) },
        noseTip: { x: Math.round(c.landmarks.noseTip.x), y: Math.round(c.landmarks.noseTip.y) },
        rightMouthCorner: { x: Math.round(c.landmarks.rightMouthCorner.x), y: Math.round(c.landmarks.rightMouthCorner.y) },
        leftMouthCorner: { x: Math.round(c.landmarks.leftMouthCorner.x), y: Math.round(c.landmarks.leftMouthCorner.y) },
      },
      confidence: Number(c.score.toFixed(4)),
    }));
  }

  /**
   * Extract 128-D L2-normalized SFace embedding from detected face crop
   */
  async extractEmbedding(buffer: Buffer, face: DetectedFace): Promise<number[]> {
    if (!this.isReady()) {
      const ok = await this.initialize();
      if (!ok) {
        throw new Error(`MODEL_NOT_LOADED: ${this.loadError}`);
      }
    }

    const img = await Jimp.read(buffer);
    const origW = img.bitmap.width;
    const origH = img.bitmap.height;

    const box = face.boundingBox;
    const margin = 0.15;
    const cropX = Math.max(0, Math.floor(box.x - box.width * margin));
    const cropY = Math.max(0, Math.floor(box.y - box.height * margin));
    const cropW = Math.min(origW - cropX, Math.ceil(box.width * (1 + 2 * margin)));
    const cropH = Math.min(origH - cropY, Math.ceil(box.height * (1 + 2 * margin)));

    const faceCrop = img.clone().crop(cropX, cropY, cropW, cropH).resize(112, 112);
    const sfaceTensorData = new Float32Array(3 * 112 * 112);
    const srOff = 2 * 112 * 112;
    const sgOff = 1 * 112 * 112;
    const sbOff = 0 * 112 * 112;

    for (let y = 0; y < 112; y++) {
      for (let x = 0; x < 112; x++) {
        const idx = (y * 112 + x) * 4;
        const r = faceCrop.bitmap.data[idx]!;
        const g = faceCrop.bitmap.data[idx + 1]!;
        const b = faceCrop.bitmap.data[idx + 2]!;
        const pIdx = y * 112 + x;
        sfaceTensorData[sbOff + pIdx] = b;
        sfaceTensorData[sgOff + pIdx] = g;
        sfaceTensorData[srOff + pIdx] = r;
      }
    }

    const sfaceTensor = new this.ort.Tensor('float32', sfaceTensorData, [1, 3, 112, 112]);
    const sfaceRes = await this.sfaceSession.run({ [this.sfaceSession.inputNames[0]]: sfaceTensor });
    const rawVec = Array.from(sfaceRes[this.sfaceSession.outputNames[0]].data as Float32Array);

    if (rawVec.length !== 128) {
      throw new Error(`Invalid SFace output vector dimension: ${rawVec.length} (expected 128)`);
    }

    let sumSq = 0;
    for (const v of rawVec) {
      if (!Number.isFinite(v)) throw new Error('SFace output contains non-finite values.');
      sumSq += v * v;
    }

    const norm = Math.sqrt(sumSq);
    if (norm === 0 || !Number.isFinite(norm)) {
      throw new Error('SFace zero-length or non-finite norm encountered.');
    }

    return rawVec.map((v) => v / norm);
  }

  /**
   * End-to-end detection, alignment verification, and 128-D embedding extraction
   */
  async processImage(buffer: Buffer): Promise<BiometricDetectionResult> {
    const startTime = Date.now();
    const faces = await this.detectFacesFromBuffer(buffer);

    if (faces.length === 0) {
      return {
        faces: [],
        faceCount: 0,
        latencyMs: Date.now() - startTime,
        modelVersion: 'YuNet-2023mar + SFace-2021dec-INT8',
      };
    }

    const topFace = faces[0]!;
    const alignment = checkAlignmentQuality(topFace.landmarks);

    let embedding: number[] | undefined;
    if (alignment.isAligned && faces.length === 1) {
      embedding = await this.extractEmbedding(buffer, topFace);
    }

    return {
      faces,
      faceCount: faces.length,
      topFace,
      alignment,
      embedding,
      latencyMs: Date.now() - startTime,
      modelVersion: 'YuNet-2023mar + SFace-2021dec-INT8',
    };
  }
}

export const biometricInferenceService = BiometricInferenceService.getInstance();
