import { IBiometricEncryptor, ICustomerRepository } from '../../ports/index.js';
import { CustomerNotFoundError, DomainValidationError } from '../../../domain/errors/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';

export class GetFaceTemplatesUseCase {
  public async execute(params: { organizationId: string; centerId?: string }) {
    let sql = `
      SELECT 
        fe.id,
        fe.customer_id,
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
        AND c.organization_id = $1
    `;
    const queryParams: any[] = [params.organizationId];

    if (params.centerId) {
      sql += ` AND c.primary_center_id = $2`;
      queryParams.push(params.centerId);
    }

    const result = await db.query(sql, queryParams);

    return result.rows.map((r: any) => ({
      templateId: r.id,
      customerId: r.customer_id,
      farmerCode: r.farmer_code,
      fullName: r.full_name,
      modelName: r.model_name,
      modelVersion: r.model_version,
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
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly encryptor: IBiometricEncryptor
  ) {}

  public async execute(params: {
    customerId: string;
    embedding: number[];
    modelVersion?: string;
  }) {
    const customer = await this.customerRepo.findById(params.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(params.customerId);
    }

    const modelVersion = params.modelVersion || 'sface_int8_2021dec';

    // Verify model exists in DB
    const modelRes = await db.query(
      `SELECT id, embedding_dimension FROM face_model_versions WHERE model_version = $1 LIMIT 1`,
      [modelVersion]
    );

    if (modelRes.rows.length === 0) {
      throw new DomainValidationError(`Face model version '${modelVersion}' is not supported.`);
    }

    const expectedDim = modelRes.rows[0].embedding_dimension;
    if (params.embedding.length !== expectedDim) {
      throw new DomainValidationError(
        `Biometric vector dimension mismatch: expected ${expectedDim} for ${modelVersion}, received ${params.embedding.length}`
      );
    }

    // Encrypt with AES-256-GCM + AAD
    const encrypted = this.encryptor.encrypt128DimEmbedding(
      params.embedding,
      params.customerId,
      modelRes.rows[0].id
    );

    await this.customerRepo.updateFaceEnrollment(
      params.customerId,
      modelVersion,
      JSON.stringify(encrypted)
    );

    return {
      success: true,
      message: 'Face biometric template enrolled and encrypted successfully.',
      modelVersion,
      dimension: expectedDim,
      keyReference: encrypted.keyReference,
    };
  }
}
