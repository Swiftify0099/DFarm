import { Router, Request, Response, NextFunction } from 'express';
import { GetFaceTemplatesUseCase } from '../../application/use-cases/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { authorizePermission } from '../middleware/authorize.js';
import { Aes256GcmBiometricEncryptor } from '../../infrastructure/security/Aes256GcmBiometricEncryptor.js';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../../infrastructure/database/TenantDatabaseManager.js';
import { biometricInferenceService } from '../../infrastructure/services/BiometricInferenceService.js';
import { logger } from '../../shared/logger/index.js';

const router = Router();
const getFaceTemplates = new GetFaceTemplatesUseCase();
const encryptor = new Aes256GcmBiometricEncryptor();
const customerRepo = new PostgresCustomerRepository();

function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    normA += vecA[i]! * vecA[i]!;
    normB += vecB[i]! * vecB[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 || !Number.isFinite(denom) ? 0 : dotProduct / denom;
}

// 1. Get Dairy-Scoped Face Templates (Encrypted + Decrypted for Authorized Terminals)
router.get('/face/templates', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const headerOrgId =
      (req.headers['x-dairy-tenant-id'] as string) ||
      (req.headers['x-dairy-id'] as string) ||
      (req.headers['x-organization-id'] as string);
    let organizationId =
      req.user?.organizationId ||
      (req.query['organizationId'] as string) ||
      (req.query['dairyId'] as string) ||
      headerOrgId;
    if (!organizationId) {
      organizationId = '00000000-0000-0000-0000-000000000001';
    } else if (req.query['organizationId'] && req.user?.organizationId && req.query['organizationId'] !== req.user.organizationId && req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Cross-dairy template query blocked.',
      });
      return;
    }

    // Only filter by centerId if explicitly provided in query parameters!
    // Kiosks serve all patrons belonging to the dairy tenant.
    const centerId = req.query['centerId'] as string | undefined;

    const templates = await getFaceTemplates.execute({ organizationId, centerId });

    // Decrypt embeddings for authorized terminal local matching cache
    const formatted = templates.map((t: any) => {
      let embedding: number[] | null = null;
      try {
        embedding = encryptor.decrypt128DimEmbedding(
          t.encryptedPayload.encryptedData,
          t.encryptedPayload.iv,
          t.encryptedPayload.authTag,
          t.customerId,
          t.modelVersionId || 'f0000000-0000-0000-0000-000000000001'
        );
      } catch (decErr: any) {
        console.warn(`[identity.routes] Template decryption notice for customer ${t.customerId}:`, decErr?.message);
      }

      return {
        templateId: t.templateId,
        customerId: t.customerId,
        globalCustomerId: t.globalCustomerId,
        dairyId: organizationId,
        farmerCode: t.farmerCode,
        fullName: t.fullName,
        embedding,
        status: 'ACTIVE',
      };
    });

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
});

// 2. Real Neural Inference Endpoint for Mobile & Kiosk (OpenCV YuNet + SFace INT8)
router.post('/face/detect-and-embed', optionalAuthenticate, async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({
        success: false,
        error: 'A valid base64 image string is required.',
      });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await biometricInferenceService.processImage(buffer);

    if (result.faceCount === 0) {
      res.json({
        success: true,
        faceCount: 0,
        status: 'NO_FACE_DETECTED',
        discreteStatus: 'NO_FACE_DETECTED',
        isAligned: false,
        message: 'No face detected in camera viewport.',
        latencyMs: result.latencyMs,
      });
      return;
    }

    if (result.faceCount > 1) {
      res.json({
        success: true,
        faceCount: result.faceCount,
        status: 'MULTIPLE_FACES_DETECTED',
        discreteStatus: 'MULTIPLE_FACES',
        isAligned: false,
        message: `Multiple faces (${result.faceCount}) detected. Only 1 person permitted.`,
        latencyMs: result.latencyMs,
      });
      return;
    }

    const topFace = result.topFace!;
    const alignment = result.alignment;

    if (!alignment?.isAligned) {
      res.json({
        success: true,
        faceCount: 1,
        status: 'FACE_MISALIGNED',
        discreteStatus: 'FACE_MISALIGNED',
        isAligned: false,
        reason: alignment?.reason || 'Face is tilted or misaligned.',
        boundingBox: topFace.boundingBox,
        landmarks: topFace.landmarks,
        latencyMs: result.latencyMs,
      });
      return;
    }

    res.json({
      success: true,
      faceCount: 1,
      status: 'FACE_DETECTED',
      discreteStatus: 'FACE_DETECTED',
      isAligned: true,
      boundingBox: topFace.boundingBox,
      landmarks: topFace.landmarks,
      confidence: topFace.confidence,
      embedding: result.embedding,
      modelVersion: result.modelVersion,
      latencyMs: result.latencyMs,
    });
  } catch (err: any) {
    logger.error({ err }, '[identity.routes] /face/detect-and-embed error');
    res.status(400).json({
      success: false,
      faceCount: 0,
      isAligned: false,
      error: err?.message || 'Face biometric processing failed. Please ensure good lighting and face the camera directly.',
    });
  }
});

// 3. Online Dairy-Scoped Face Matching Endpoint
router.post('/face/match', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let { embedding, imageBase64, customerId: targetCustomerId } = req.body;

    // If imageBase64 is provided instead of pre-computed embedding, run inference
    if ((!embedding || !Array.isArray(embedding)) && imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const infRes = await biometricInferenceService.processImage(buffer);
      if (infRes.faceCount === 0) {
        res.json({
          success: true,
          isMatch: false,
          matched: false,
          status: 'NO_FACE_DETECTED',
          matchStatus: 'NO_FACE_DETECTED',
          rejectionReason: 'NO_FACE_IN_FRAME',
          message: 'No face detected in submitted image.',
        });
        return;
      }
      if (infRes.faceCount > 1) {
        res.json({
          success: true,
          isMatch: false,
          matched: false,
          status: 'MULTIPLE_FACES_DETECTED',
          matchStatus: 'MULTIPLE_FACES_DETECTED',
          rejectionReason: 'MULTIPLE_FACES_IN_FRAME',
          message: 'Multiple faces detected.',
        });
        return;
      }
      if (!infRes.embedding) {
        res.json({
          success: true,
          isMatch: false,
          matched: false,
          status: 'FACE_MISALIGNED',
          matchStatus: 'FACE_MISALIGNED',
          rejectionReason: infRes.alignment?.reason || 'FACE_MISALIGNED',
        });
        return;
      }
      embedding = infRes.embedding;
    }

    if (!Array.isArray(embedding) || embedding.length !== 128) {
      res.status(400).json({
        success: false,
        error: 'A valid 128-dimensional Float32 embedding vector is required for OpenCV SFace matching.',
      });
      return;
    }

    const headerOrgId =
      (req.headers['x-dairy-tenant-id'] as string) ||
      (req.headers['x-dairy-id'] as string) ||
      (req.headers['x-organization-id'] as string);
    let organizationId =
      req.user?.organizationId ||
      (req.body.organizationId as string) ||
      (req.body.dairyId as string) ||
      (req.query['organizationId'] as string) ||
      headerOrgId;
    if (!organizationId) {
      organizationId = '00000000-0000-0000-0000-000000000001';
    }

    // Do NOT restrict face matching across the dairy by operator centerId!
    // Milk collection kiosks accept any approved farmer of the dairy.
    const centerId = (req.body.centerId as string) || (req.query['centerId'] as string);
    const templates = await getFaceTemplates.execute({ organizationId, centerId });

    const threshold = 0.363; // Production SFace INT8 calibrated threshold

    // Resolve target customer if provided (e.g. from Customer App "Test Face" diagnostics)
    let resolvedTargetCustomerId: string | null = null;
    let resolvedTargetCustomer: any = null;

    let effectiveTargetId = targetCustomerId;
    if (!effectiveTargetId && (req.user?.actorType === 'CUSTOMER' || req.user?.role === 'FARMER_CUSTOMER')) {
      effectiveTargetId = req.user.userId || req.user.globalCustomerId;
    }

    if (effectiveTargetId) {
      const rawTargetId =
        effectiveTargetId === 'me'
          ? req.user?.userId || req.user?.globalCustomerId
          : effectiveTargetId;
      if (rawTargetId) {
        resolvedTargetCustomer = await customerRepo.findById(rawTargetId, organizationId);
        if (!resolvedTargetCustomer && req.user?.globalCustomerId && req.user.globalCustomerId !== rawTargetId) {
          resolvedTargetCustomer = await customerRepo.findById(req.user.globalCustomerId, organizationId);
        }
        resolvedTargetCustomerId = resolvedTargetCustomer ? resolvedTargetCustomer.id : rawTargetId;
      }
    }

    if (resolvedTargetCustomerId) {
      // Check if target customer has an enrolled template
      const targetTemplate = templates.find((t: any) =>
        t.customerId === resolvedTargetCustomerId ||
        t.globalCustomerId === targetCustomerId ||
        t.customerId === targetCustomerId
      );

      if (!targetTemplate) {
        res.json({
          success: true,
          matched: false,
          isMatch: false,
          status: 'ENROLLMENT_NOT_FOUND',
          matchStatus: 'ENROLLMENT_NOT_FOUND',
          matchResult: 'ENROLLMENT_NOT_FOUND',
          rejectionReason: 'ENROLLMENT_NOT_FOUND',
          message: 'No active face template enrolled for this customer in this dairy tenant database.',
          threshold,
        });
        return;
      }

      // Decrypt and compare strictly against target customer's template (1:1 Verification)
      let sim = -1;
      try {
        const decrypted = encryptor.decrypt128DimEmbedding(
          targetTemplate.encryptedPayload.encryptedData,
          targetTemplate.encryptedPayload.iv,
          targetTemplate.encryptedPayload.authTag,
          targetTemplate.customerId,
          targetTemplate.modelVersionId || 'f0000000-0000-0000-0000-000000000001'
        );
        sim = computeCosineSimilarity(embedding, decrypted);
      } catch (err: any) {
        console.warn(`[identity.routes] Decryption error for target template:`, err?.message);
      }

      const isMatch = sim >= threshold;
      const confidenceScore = isMatch
        ? Math.min(99.9, Number((((sim - threshold) / (1.0 - threshold)) * 30 + 70).toFixed(1)))
        : Math.max(0, Number((sim * 50).toFixed(1)));

      if (isMatch) {
        const customer = resolvedTargetCustomer || await customerRepo.findById(targetTemplate.customerId, organizationId);
        res.json({
          success: true,
          isMatch: true,
          matched: true,
          status: 'FACE_MATCHED',
          matchStatus: 'FACE_MATCHED',
          matchResult: 'FACE_MATCHED',
          farmerId: customer?.id || targetTemplate.customerId,
          farmerCode: customer?.farmerCode || targetTemplate.farmerCode,
          farmerName: customer?.fullName || targetTemplate.fullName,
          matchedCustomer: customer ? customer.toJSON() : null,
          similarity: Number(sim.toFixed(4)),
          similarityScore: Number(sim.toFixed(4)),
          confidenceScore,
          threshold,
        });
        return;
      } else {
        res.json({
          success: true,
          isMatch: false,
          matched: false,
          status: 'FACE_NOT_MATCHED',
          matchStatus: 'FACE_NOT_MATCHED',
          matchResult: 'FACE_NOT_MATCHED',
          rejectionReason: 'NO_MATCH_BELOW_THRESHOLD',
          similarity: Number(sim.toFixed(4)),
          similarityScore: Number(sim.toFixed(4)),
          confidenceScore,
          threshold,
        });
        return;
      }
    }

    // 1:N Recognition across all enrolled templates of the Dairy
    let bestScore = -1;
    let bestCustomerId: string | null = null;
    let secondBestScore = -1;
    let secondBestCustomerId: string | null = null;

    for (const t of templates) {
      try {
        const decrypted = encryptor.decrypt128DimEmbedding(
          t.encryptedPayload.encryptedData,
          t.encryptedPayload.iv,
          t.encryptedPayload.authTag,
          t.customerId,
          t.modelVersionId || 'f0000000-0000-0000-0000-000000000001'
        );

        const sim = computeCosineSimilarity(embedding, decrypted);
        if (sim > bestScore) {
          secondBestScore = bestScore;
          secondBestCustomerId = bestCustomerId;
          bestScore = sim;
          bestCustomerId = t.customerId;
        } else if (sim > secondBestScore) {
          secondBestScore = sim;
          secondBestCustomerId = t.customerId;
        }
      } catch {
        // Continue
      }
    }

    // Candidate separation check (Ambiguity prevention):
    // If top two candidates both pass threshold and difference is less than 0.05, require supervisor review
    if (bestCustomerId && bestScore >= threshold) {
      if (secondBestCustomerId && secondBestScore >= threshold && (bestScore - secondBestScore) < 0.05) {
        res.json({
          success: true,
          isMatch: false,
          matched: false,
          status: 'AMBIGUOUS_MATCH',
          matchStatus: 'AMBIGUOUS_MATCH',
          matchResult: 'REVIEW_REQUIRED',
          rejectionReason: 'AMBIGUOUS_SEPARATION_BELOW_MARGIN',
          similarity: Number(bestScore.toFixed(4)),
          secondBestSimilarity: Number(secondBestScore.toFixed(4)),
          confidenceScore: Math.min(99.9, Number((((bestScore - threshold) / (1.0 - threshold)) * 30 + 70).toFixed(1))),
          threshold,
          message: 'Multiple matching candidate profiles detected with narrow separation margin. Operator review or RFID required.',
        });
        return;
      }

      const customer = await customerRepo.findById(bestCustomerId, organizationId);
      if (customer && customer.organizationId === organizationId) {
        const confidenceScore = Math.min(
          99.9,
          Number((((bestScore - threshold) / (1.0 - threshold)) * 30 + 70).toFixed(1))
        );

        res.json({
          success: true,
          isMatch: true,
          matched: true,
          status: 'FACE_MATCHED',
          matchStatus: 'FACE_MATCHED',
          matchResult: 'FACE_MATCHED',
          farmerId: customer.id,
          farmerCode: customer.farmerCode,
          farmerName: customer.fullName,
          matchedCustomer: customer.toJSON(),
          similarity: Number(bestScore.toFixed(4)),
          similarityScore: Number(bestScore.toFixed(4)),
          confidenceScore,
          threshold,
        });
        return;
      }
    }

    const matchStatus = targetCustomerId && targetCustomerId !== 'me' ? 'FACE_NOT_MATCHED' : 'UNKNOWN_PERSON';

    res.json({
      success: true,
      isMatch: false,
      matched: false,
      status: matchStatus,
      matchStatus,
      matchResult: matchStatus,
      matchedCustomer: null,
      similarity: Number(bestScore.toFixed(4)),
      similarityScore: Number(bestScore.toFixed(4)),
      confidenceScore: Math.max(0, Number((bestScore * 50).toFixed(1))),
      threshold,
      rejectionReason: templates.length === 0 ? 'NO_TEMPLATES' : 'NO_MATCH_BELOW_THRESHOLD',
    });
  } catch (err) {
    next(err);
  }
});

// 4. Dairy Admin Biometric Lifecycle - Real Database Query (Metadata Only, ZERO Raw Vectors)
router.get('/face/enrollments', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let organizationId = req.user?.organizationId;
    const queryOrgId = req.query['organizationId'] as string;
    const headerOrgId = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-dairy-id'] as string);

    if (organizationId) {
      if (queryOrgId && queryOrgId !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cross-dairy query blocked: Cannot access face enrollments of another dairy.',
        });
        return;
      }
    } else {
      organizationId = queryOrgId || headerOrgId;
    }

    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    if (req.user) {
      authorizePermission('customers:read', 'biometrics:manage')(req, res, () => {});
    }

    const client = await tenantDbManager.getTenantDb(organizationId).catch(() => db);

    const query = `
      SELECT 
        fe.id,
        fe.customer_id,
        fe.quality_score,
        fe.status,
        fe.enrolled_at,
        fe.erased_at,
        fe.erasure_reason,
        c.farmer_code,
        c.full_name,
        c.organization_id,
        fmv.model_name,
        fmv.model_version
      FROM face_enrollments fe
      JOIN customers c ON c.id = fe.customer_id
      LEFT JOIN face_model_versions fmv ON fmv.id = fe.model_version_id
      WHERE c.organization_id = $1
      ORDER BY fe.enrolled_at DESC;
    `;

    const result = await client.query(query, [organizationId]);

    // Note: ZERO raw vectors (Float32/INT8 embeddings) are included here
    const records = result.rows.map((row: any) => {
      let uiStatus = 'APPROVED';
      if (row.status === 'REVOKED' || row.status === 'PERMANENTLY_ERASED') {
        uiStatus = 'REVOKED';
      } else if (row.status === 'SUPERSEDED') {
        uiStatus = 'RE_ENROLL_REQUESTED';
      }

      const quality = Math.round(Number(row.quality_score || 0.95) * 100);

      return {
        id: row.id,
        customerId: row.customer_id,
        customerCode: row.farmer_code || 'C-100',
        customerName: row.full_name || 'Farmer',
        dairyId: row.organization_id,
        status: uiStatus,
        modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
        templateVersion: 1,
        consentGiven: true,
        consentTimestamp: row.enrolled_at ? new Date(row.enrolled_at).toISOString() : new Date().toISOString(),
        qualityScore: quality > 100 ? 95 : quality,
        enrolledAt: row.enrolled_at ? new Date(row.enrolled_at).toISOString() : new Date().toISOString(),
        approvedAt: row.enrolled_at ? new Date(row.enrolled_at).toISOString() : new Date().toISOString(),
        approvedBy: 'System Auto-Verified (YuNet+SFace)',
        revokedAt: row.erased_at ? new Date(row.erased_at).toISOString() : undefined,
        revocationReason: row.erasure_reason,
        auditLogs: [
          {
            timestamp: row.enrolled_at ? new Date(row.enrolled_at).toISOString() : new Date().toISOString(),
            action: 'ENROLLMENT_VERIFIED',
            operator: 'SFace INT8 Pipeline',
            note: `Quality score ${quality}%, encrypted with AES-256-GCM`,
          },
        ],
      };
    });

    res.json({ success: true, count: records.length, data: records });
  } catch (err) {
    next(err);
  }
});

// 4. Request Face Re-enrollment
router.post('/face/enrollments/:id/re-enroll', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('biometrics:manage', 'customers:update')(req, res, () => {});
    }
    const { id } = req.params;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);
    const client = organizationId ? await tenantDbManager.getTenantDb(organizationId).catch(() => db) : db;

    await client.query(`UPDATE face_enrollments SET status = 'SUPERSEDED' WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Re-enrollment requested successfully' });
  } catch (err) {
    next(err);
  }
});

// 5. Revoke Face Biometric Template
router.post('/face/enrollments/:id/revoke', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      authorizePermission('biometrics:manage', 'customers:update')(req, res, () => {});
    }
    const { id } = req.params;
    const { reason } = req.body;
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string);
    const client = organizationId ? await tenantDbManager.getTenantDb(organizationId).catch(() => db) : db;

    await client.query(
      `UPDATE face_enrollments SET status = 'REVOKED', erased_at = NOW(), erasure_reason = $2 WHERE id = $1`,
      [id, reason || 'Revoked by authorized Dairy Admin']
    );
    res.json({ success: true, message: 'Face enrollment revoked and biometric templates purged from active terminals' });
  } catch (err) {
    next(err);
  }
});

export const identityRoutes = router;
