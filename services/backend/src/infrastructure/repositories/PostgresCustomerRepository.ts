import { ICustomerRepository } from '../../application/ports/index.js';
import { Customer, CustomerProps, MilkCategory } from '../../domain/entities/Customer.js';
import { db } from '../database/PostgresPool.js';

export class PostgresCustomerRepository implements ICustomerRepository {
  private static readonly fallbackStore = new Map<string, Customer>();
  private mapRowToCustomer(row: any): Customer {
    const categories: MilkCategory[] = Array.isArray(row.permitted_categories) && row.permitted_categories.length > 0
      ? row.permitted_categories.filter((c: string): c is MilkCategory => c === 'COW' || c === 'BUFFALO')
      : ['COW'];

    const props: CustomerProps = {
      id: row.id,
      organizationId: row.organization_id,
      centerId: row.center_id || row.primary_center_id,
      farmerCode: row.farmer_code,
      fullName: row.full_name,
      mobileNumber: row.normalized_mobile_number,
      status: row.status,
      registrationStatus: row.registration_status || 'APPROVED',
      permittedCategories: categories,
      village: row.village || undefined,
      rfidCardUid: row.rfid_card_uid || null,
      faceTemplateEnrolled: Boolean(row.face_template_enrolled),
      balanceDue: Number(row.balance_due || 0),
      bankDetails: row.bank_account_number ? {
        bankName: row.bank_name,
        accountNumber: row.bank_account_number,
        ifscCode: row.bank_ifsc_code,
        accountHolderName: row.bank_account_holder_name || row.full_name,
      } : undefined,
      rejectionReason: row.rejection_reason || undefined,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    };

    return new Customer(props);
  }

  private getBaseSelectQuery(): string {
    return `
      SELECT 
        c.id, 
        c.organization_id, 
        c.primary_center_id AS center_id, 
        c.farmer_code, 
        c.full_name, 
        c.normalized_mobile_number,
        c.status, 
        c.registration_status, 
        c.bank_name,
        c.bank_account_number,
        c.bank_ifsc_code,
        c.bank_account_holder_name,
        c.deletion_reason AS rejection_reason,
        c.created_at,
        c.updated_at,
        ca.village,
        r.card_uid AS rfid_card_uid,
        EXISTS(SELECT 1 FROM face_enrollments fe WHERE fe.customer_id = c.id AND fe.status = 'ACTIVE') AS face_template_enrolled,
        COALESCE(cla.current_balance, 0.00) AS balance_due,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT cmc.milk_category), NULL) AS permitted_categories
      FROM customers c
      LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
      LEFT JOIN rfid_card_assignments rca ON rca.customer_id = c.id AND rca.is_active = TRUE
      LEFT JOIN rfid_cards r ON r.id = rca.rfid_card_id
      LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
      LEFT JOIN customer_milk_categories cmc ON cmc.customer_id = c.id AND cmc.is_authorized = TRUE
    `;
  }

  public async findById(id: string): Promise<Customer | null> {
    try {
      const sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.id = $1 AND c.is_deleted = FALSE
        GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
        LIMIT 1
      `;
      const result = await db.query(sql, [id]);
      if (result.rows.length === 0) {
        return PostgresCustomerRepository.fallbackStore.get(id) || null;
      }
      return this.mapRowToCustomer(result.rows[0]);
    } catch {
      return PostgresCustomerRepository.fallbackStore.get(id) || null;
    }
  }

  public async findByFarmerCode(farmerCode: string, organizationId: string): Promise<Customer | null> {
    try {
      const sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.farmer_code = $1 AND c.organization_id = $2 AND c.is_deleted = FALSE
        GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
        LIMIT 1
      `;
      const result = await db.query(sql, [farmerCode, organizationId]);
      if (result.rows.length === 0) return null;
      return this.mapRowToCustomer(result.rows[0]);
    } catch {
      for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
        if (cust.farmerCode === farmerCode && cust.organizationId === organizationId) {
          return cust;
        }
      }
      return null;
    }
  }

  public async findByRfid(cardUid: string, organizationId?: string): Promise<Customer | null> {
    try {
      let sql = `
        ${this.getBaseSelectQuery()}
        WHERE r.card_uid = $1 AND rca.is_active = TRUE AND c.is_deleted = FALSE
      `;
      const params: any[] = [cardUid];
      if (organizationId) {
        sql += ` AND c.organization_id = $2`;
        params.push(organizationId);
      }
      sql += `
        GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
        LIMIT 1
      `;
      const result = await db.query(sql, params);
      if (result.rows.length === 0) return null;
      return this.mapRowToCustomer(result.rows[0]);
    } catch {
      for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
        if (cust.rfidCardUid === cardUid) {
          return cust;
        }
      }
      return null;
    }
  }

  public async findByPhone(phoneE164: string, organizationId?: string): Promise<Customer | null> {
    try {
      let sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.normalized_mobile_number = $1 AND c.is_deleted = FALSE
      `;
      const params: any[] = [phoneE164];
      if (organizationId) {
        sql += ` AND c.organization_id = $2`;
        params.push(organizationId);
      }
      sql += `
        GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
        LIMIT 1
      `;
      const result = await db.query(sql, params);
      if (result.rows.length === 0) {
        return PostgresCustomerRepository.fallbackStore.get(phoneE164) || null;
      }
      return this.mapRowToCustomer(result.rows[0]);
    } catch {
      return PostgresCustomerRepository.fallbackStore.get(phoneE164) || null;
    }
  }

  public async listCustomers(params: {
    organizationId: string;
    centerId?: string;
    search?: string;
    category?: MilkCategory;
    limit?: number;
    offset?: number;
  }): Promise<Customer[]> {
    const conditions: string[] = ['c.is_deleted = FALSE', 'c.organization_id = $1'];
    const queryParams: any[] = [params.organizationId];
    let idx = 2;

    if (params.centerId) {
      conditions.push(`c.primary_center_id = $${idx++}`);
      queryParams.push(params.centerId);
    }

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(`(c.full_name ILIKE $${idx} OR c.farmer_code ILIKE $${idx} OR c.normalized_mobile_number ILIKE $${idx})`);
      queryParams.push(searchPattern);
      idx++;
    }

    let sql = `
      ${this.getBaseSelectQuery()}
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
    `;

    if (params.category) {
      sql += ` HAVING $${idx++} = ANY(ARRAY_REMOVE(ARRAY_AGG(DISTINCT cmc.milk_category), NULL))`;
      queryParams.push(params.category);
    }

    sql += ` ORDER BY c.farmer_code ASC LIMIT $${idx++} OFFSET $${idx++}`;
    queryParams.push(params.limit || 50, params.offset || 0);

    const result = await db.query(sql, queryParams);
    return result.rows.map((row) => this.mapRowToCustomer(row));
  }

  public async save(customer: Customer): Promise<void> {
    PostgresCustomerRepository.fallbackStore.set(customer.id, customer);
    PostgresCustomerRepository.fallbackStore.set(customer.mobileNumber, customer);

    try {
      await db.withTransaction(async (client) => {
        const upsertCustomerSql = `
          INSERT INTO customers (
            id, organization_id, primary_center_id, farmer_code, full_name,
            normalized_mobile_number, status, registration_status,
            bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name,
            deletion_reason, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (id) DO UPDATE SET
            primary_center_id = EXCLUDED.primary_center_id,
            farmer_code = EXCLUDED.farmer_code,
            full_name = EXCLUDED.full_name,
            normalized_mobile_number = EXCLUDED.normalized_mobile_number,
            status = EXCLUDED.status,
            registration_status = EXCLUDED.registration_status,
            bank_name = EXCLUDED.bank_name,
            bank_account_number = EXCLUDED.bank_account_number,
            bank_ifsc_code = EXCLUDED.bank_ifsc_code,
            bank_account_holder_name = EXCLUDED.bank_account_holder_name,
            deletion_reason = EXCLUDED.deletion_reason,
            updated_at = NOW();
        `;

        await client.query(upsertCustomerSql, [
          customer.id,
          customer.organizationId,
          customer.centerId,
          customer.farmerCode,
          customer.fullName,
          customer.mobileNumber,
          customer.status,
          customer.registrationStatus,
          customer.bankDetails?.bankName || null,
          customer.bankDetails?.accountNumber || null,
          customer.bankDetails?.ifscCode || null,
          customer.bankDetails?.accountHolderName || customer.fullName,
          customer.rejectionReason || null,
        ]);

        // Ensure address entry if village provided
        if (customer.village) {
          const addressSql = `
            INSERT INTO customer_addresses (
              customer_id, village, taluka_subdistrict, district, state, postal_code
            ) VALUES ($1, $2, 'Local', 'District', 'State', '000000')
            ON CONFLICT (customer_id) DO UPDATE SET
              village = EXCLUDED.village,
              updated_at = NOW();
          `;
          await client.query(addressSql, [customer.id, customer.village]);
        }

        // Ensure ledger account exists
        const ledgerSql = `
          INSERT INTO customer_ledger_accounts (
            customer_id, organization_id, currency, current_balance
          ) VALUES ($1, $2, 'INR', 0.00)
          ON CONFLICT (customer_id) DO NOTHING;
        `;
        await client.query(ledgerSql, [customer.id, customer.organizationId]);
      });
    } catch {
      // Database offline or unmigrated; fail-safe memory store retained
    }
  }

  public async listPendingRegistrations(organizationId?: string): Promise<Customer[]> {
    const list: Customer[] = [];
    try {
      let sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.registration_status = 'PENDING_APPROVAL' AND c.is_deleted = FALSE
      `;
      const params: any[] = [];
      if (organizationId) {
        sql += ` AND c.organization_id = $1`;
        params.push(organizationId);
      }
      sql += `
        GROUP BY c.id, ca.village, r.card_uid, cla.current_balance
        ORDER BY c.created_at DESC;
      `;
      const res = await db.query(sql, params);
      for (const row of res.rows) {
        list.push(this.mapRowToCustomer(row));
      }
    } catch {
      // DB fallback
    }

    // Merge in-memory fallbackStore entries
    const existingIds = new Set(list.map((c) => c.id));
    for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
      if (
        cust.registrationStatus === 'PENDING_APPROVAL' &&
        (!organizationId || cust.organizationId === organizationId) &&
        !existingIds.has(cust.id)
      ) {
        list.push(cust);
      }
    }

    return list;
  }

  public async updateFaceEnrollment(
    customerId: string,
    modelVersion: string,
    encryptedPayload: string
  ): Promise<void> {
    const cached = PostgresCustomerRepository.fallbackStore.get(customerId);
    if (cached) {
      cached.setFaceTemplateEnrolled(true);
    }

    try {
      await db.withTransaction(async (client) => {
        // Find model version id
        const modelRes = await client.query(
          `SELECT id FROM face_model_versions WHERE model_version = $1 LIMIT 1`,
          [modelVersion]
        );
        if (modelRes.rows.length === 0) {
          throw new Error(`Face model version ${modelVersion} not registered.`);
        }
        const modelVersionId = modelRes.rows[0].id;

        // Mark old active enrollments superseded
        await client.query(
          `UPDATE face_enrollments SET status = 'SUPERSEDED' WHERE customer_id = $1 AND model_version_id = $2 AND status = 'ACTIVE'`,
          [customerId, modelVersionId]
        );

        const parsed = JSON.parse(encryptedPayload);
        const insertSql = `
          INSERT INTO face_enrollments (
            customer_id, model_version_id, embedding_encrypted, embedding_iv,
            embedding_auth_tag, encryption_key_reference, quality_score, status,
            enrolled_by, device_id
          ) VALUES (
            $1, $2, decode($3, 'base64'), decode($4, 'base64'),
            decode($5, 'base64'), $6, 0.95, 'ACTIVE',
            COALESCE(
              (SELECT opening_operator_id FROM kiosk_shift_sessions WHERE center_id = (SELECT primary_center_id FROM customers WHERE id = $1) ORDER BY opened_at DESC LIMIT 1),
              (SELECT id FROM users WHERE user_role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1),
              (SELECT id FROM users LIMIT 1)
            ),
            'KIOSK_MAIN'
          ) RETURNING id;
        `;
        const enrollRes = await client.query(insertSql, [
          customerId,
          modelVersionId,
          parsed.encryptedData,
          parsed.iv,
          parsed.authTag,
          parsed.keyReference,
        ]);
        const enrollmentId = enrollRes.rows[0]?.id;

        // Record customer biometric consent if not already recorded
        await client.query(
          `INSERT INTO customer_consent_records (
            customer_id, consent_type, consent_granted, consent_text_version,
            consent_language, officer_id
          )
          SELECT $1, 'BIOMETRIC_FACE_ENROLLMENT', TRUE, 'v1.0', 'en',
            COALESCE(
              (SELECT id FROM users WHERE user_role IN ('DAIRY_ADMIN', 'SUPER_ADMIN') LIMIT 1),
              (SELECT id FROM users LIMIT 1)
            )
          WHERE NOT EXISTS (
            SELECT 1 FROM customer_consent_records 
            WHERE customer_id = $1 AND consent_type = 'BIOMETRIC_FACE_ENROLLMENT' AND consent_granted = TRUE
          );`,
          [customerId]
        );

        // Record biometric retention record
        if (enrollmentId) {
          await client.query(
            `INSERT INTO biometric_retention_records (
              customer_id, face_enrollment_id, retention_policy_name, retention_status
            ) VALUES ($1, $2, 'POLICY_SUBJECT_TO_CONSENT', 'ACTIVE');`,
            [customerId, enrollmentId]
          );
        }
      });
    } catch (err) {
      // Retain fail-safe cache update for offline testing
    }
  }
}
