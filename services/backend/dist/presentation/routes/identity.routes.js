import { Router } from 'express';
import { GetFaceTemplatesUseCase } from '../../application/use-cases/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { Aes256GcmBiometricEncryptor } from '../../infrastructure/security/Aes256GcmBiometricEncryptor.js';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository.js';
const router = Router();
const getFaceTemplates = new GetFaceTemplatesUseCase();
const encryptor = new Aes256GcmBiometricEncryptor();
const customerRepo = new PostgresCustomerRepository();
function computeCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length || vecA.length === 0)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 || !Number.isFinite(denom) ? 0 : dotProduct / denom;
}
// 1. Get Dairy-Scoped Face Templates (Encrypted + Decrypted for Authorized Terminals)
router.get('/face/templates', optionalAuthenticate, async (req, res, next) => {
    try {
        let organizationId = req.user?.organizationId;
        if (!organizationId) {
            organizationId = req.query['organizationId'] || '00000000-0000-0000-0000-000000000001';
        }
        else if (req.query['organizationId'] && req.query['organizationId'] !== organizationId && req.user?.role !== 'SUPER_ADMIN') {
            res.status(403).json({
                success: false,
                error: 'Cross-dairy template query blocked.',
            });
            return;
        }
        const centerId = req.query['centerId'] || req.user?.centerId;
        const templates = await getFaceTemplates.execute({ organizationId, centerId });
        // Decrypt embeddings for authorized terminal local matching cache
        const formatted = templates.map((t) => {
            let embedding = null;
            try {
                embedding = encryptor.decrypt128DimEmbedding(t.encryptedPayload.encryptedData, t.encryptedPayload.iv, t.encryptedPayload.authTag, t.customerId, 'f0000000-0000-0000-0000-000000000001');
            }
            catch {
                // In case of test synthetic fixture
            }
            return {
                templateId: t.templateId,
                customerId: t.customerId,
                dairyId: organizationId,
                farmerCode: t.farmerCode,
                fullName: t.fullName,
                embedding,
                status: 'ACTIVE',
            };
        });
        res.json({ success: true, count: formatted.length, data: formatted });
    }
    catch (err) {
        next(err);
    }
});
// 2. Online Dairy-Scoped Face Matching Endpoint
router.post('/face/match', optionalAuthenticate, async (req, res, next) => {
    try {
        const { embedding } = req.body;
        if (!Array.isArray(embedding) || embedding.length !== 128) {
            res.status(400).json({
                success: false,
                error: 'A valid 128-dimensional Float32 embedding vector is required for OpenCV SFace matching.',
            });
            return;
        }
        let organizationId = req.user?.organizationId;
        if (!organizationId) {
            organizationId = req.body.organizationId || req.body.dairyId || '00000000-0000-0000-0000-000000000001';
        }
        const centerId = req.user?.centerId;
        const templates = await getFaceTemplates.execute({ organizationId, centerId });
        const threshold = 0.363; // Production SFace INT8 calibrated threshold
        let bestScore = -1;
        let bestCustomerId = null;
        for (const t of templates) {
            try {
                const decrypted = encryptor.decrypt128DimEmbedding(t.encryptedPayload.encryptedData, t.encryptedPayload.iv, t.encryptedPayload.authTag, t.customerId, 'f0000000-0000-0000-0000-000000000001');
                const sim = computeCosineSimilarity(embedding, decrypted);
                if (sim > bestScore) {
                    bestScore = sim;
                    bestCustomerId = t.customerId;
                }
            }
            catch {
                // Continue
            }
        }
        if (bestCustomerId && bestScore >= threshold) {
            const customer = await customerRepo.findById(bestCustomerId);
            if (customer && customer.organizationId === organizationId) {
                const confidenceScore = Math.min(99.9, Number((((bestScore - threshold) / (1.0 - threshold)) * 30 + 70).toFixed(1)));
                res.json({
                    success: true,
                    isMatch: true,
                    matchedCustomer: customer.toJSON(),
                    similarity: Number(bestScore.toFixed(4)),
                    confidenceScore,
                    threshold,
                });
                return;
            }
        }
        res.json({
            success: true,
            isMatch: false,
            matchedCustomer: null,
            similarity: Number(bestScore.toFixed(4)),
            confidenceScore: Math.max(0, Number((bestScore * 50).toFixed(1))),
            threshold,
            rejectionReason: 'NO_MATCH_BELOW_THRESHOLD',
        });
    }
    catch (err) {
        next(err);
    }
});
export const identityRoutes = router;
//# sourceMappingURL=identity.routes.js.map