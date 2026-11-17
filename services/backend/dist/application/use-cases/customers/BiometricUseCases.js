import { CustomerNotFoundError, DomainValidationError } from '../../../domain/errors/index.js';
import { tenantDbManager } from '../../../infrastructure/database/TenantDatabaseManager.js';
export class GetFaceTemplatesUseCase {
    async execute(params) {
        const tenantDb = await tenantDbManager.getTenantDb(params.organizationId);
        let sql = `
      SELECT 
        fe.id,
        fe.customer_id,
        fe.model_version_id,
        c.farmer_code,
        c.full_name,
        encode(fe.embedding_encrypted, 'base64') AS encrypted_data,
        encode(fe.embedding_iv, 'base64') AS iv,
        encode(fe.embedding_auth_tag, 'base64') AS auth_tag,
        fe.encryption_key_reference,
        fmv.model_name,
        fmv.model_version,
        fmv.embedding_dimension,
        fmv.similarity_metric,
        fmv.recommended_threshold
      FROM face_enrollments fe
      JOIN customers c ON c.id = fe.customer_id
      JOIN face_model_versions fmv ON fmv.id = fe.model_version_id
      WHERE fe.status = 'ACTIVE' 
        AND c.is_deleted = FALSE 
        AND c.status = 'ACTIVE'
        AND c.registration_status = 'APPROVED'
        AND c.organization_id = $1
    `;
        const queryParams = [params.organizationId];
        if (params.centerId) {
            sql += ` AND c.primary_center_id = $2`;
            queryParams.push(params.centerId);
        }
        const result = await tenantDb.query(sql, queryParams);
        return result.rows.map((r) => ({
            templateId: r.id,
            customerId: r.customer_id,
            farmerCode: r.farmer_code,
            fullName: r.full_name,
            modelName: r.model_name,
            modelVersion: r.model_version,
            modelVersionId: r.model_version_id,
            dimension: r.embedding_dimension,
            metric: r.similarity_metric,
            threshold: Number(r.recommended_threshold),
            encryptedPayload: {
                encryptedData: r.encrypted_data,
                iv: r.iv,
                authTag: r.auth_tag,
                keyReference: r.encryption_key_reference,
            },
        }));
    }
}
export class UpdateCustomerBiometricsUseCase {
    customerRepo;
    encryptor;
    constructor(customerRepo, encryptor) {
        this.customerRepo = customerRepo;
        this.encryptor = encryptor;
    }
    async execute(params) {
        const customer = await this.customerRepo.findById(params.customerId);
        if (!customer) {
            throw new CustomerNotFoundError(params.customerId);
        }
        const modelVersion = params.modelVersion || 'sface_int8_2021dec';
        const tenantDb = await tenantDbManager.getTenantDb(customer.organizationId);
        // Verify model exists in DB
        const modelRes = await tenantDb.query(`SELECT id, embedding_dimension FROM face_model_versions WHERE model_version = $1 LIMIT 1`, [modelVersion]);
        let modelId = 'f0000000-0000-0000-0000-000000000001';
        let expectedDim = 128;
        if (modelRes.rows.length > 0) {
            modelId = modelRes.rows[0].id;
            expectedDim = modelRes.rows[0].embedding_dimension;
        }
        if (params.embedding.length !== expectedDim) {
            throw new DomainValidationError(`Biometric vector dimension mismatch: expected ${expectedDim} for ${modelVersion}, received ${params.embedding.length}`);
        }
        // Encrypt with AES-256-GCM + AAD
        const encrypted = this.encryptor.encrypt128DimEmbedding(params.embedding, params.customerId, modelId);
        await this.customerRepo.updateFaceEnrollment(params.customerId, modelVersion, JSON.stringify(encrypted));
        return {
            success: true,
            customerId: params.customerId,
            modelVersion,
            status: 'ENROLLED',
            enrolledAt: new Date().toISOString(),
        };
    }
}
//# sourceMappingURL=BiometricUseCases.js.map