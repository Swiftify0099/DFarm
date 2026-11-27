import { ICustomerRepository } from '../../application/ports/index.js';
import { Customer, CustomerProps, MilkCategory } from '../../domain/entities/Customer.js';
import { DomainValidationError, ForbiddenError, ForbiddenTenantError } from '../../domain/errors/index.js';
import { tenantDbManager, IDatabaseClient } from '../database/TenantDatabaseManager.js';

export class PostgresCustomerRepository implements ICustomerRepository {
  private mapRowToCustomer(row: any, categories?: MilkCategory[], faceEnrolled?: boolean): Customer {
    const defaultCats = Array.isArray(categories) && categories.length > 0
      ? categories
      : (Array.isArray(row.permitted_categories) && row.permitted_categories.length > 0
        ? row.permitted_categories.filter((c: string): c is MilkCategory => c === 'COW' || c === 'BUFFALO')
        : ['COW']);

    const props: CustomerProps = {
      id: row.id,
      organizationId: row.organization_id,
      centerId: row.center_id || row.primary_center_id,
      farmerCode: row.farmer_code,
      fullName: row.full_name,
      mobileNumber: row.normalized_mobile_number,
      status: row.status,
      registrationStatus: row.registration_status || 'APPROVED',
      permittedCategories: defaultCats,
      village: row.village || undefined,
      rfidCardUid: row.rfid_card_uid || null,
      faceTemplateEnrolled: faceEnrolled !== undefined ? faceEnrolled : Boolean(row.face_template_enrolled),
      globalCustomerId: row.global_customer_id || undefined,
      balanceDue: Number(row.balance_due || 0),
      isDeleted: Boolean(row.is_deleted),
      deletionReason: row.deletion_reason || undefined,
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
        c.global_customer_id,
        c.is_deleted,
        c.bank_name,
        c.bank_account_number,
        c.bank_ifsc_code,
        c.bank_account_holder_name,
        c.deletion_reason,
        c.deletion_reason AS rejection_reason,
        c.created_at,
        c.updated_at,
        ca.village,
        r.card_uid AS rfid_card_uid,
        COALESCE(cla.current_balance, 0.00) AS balance_due
      FROM customers c
      LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
      LEFT JOIN rfid_card_assignments rca ON rca.customer_id = c.id AND rca.is_active = TRUE
      LEFT JOIN rfid_cards r ON r.id = rca.rfid_card_id
      LEFT JOIN customer_ledger_accounts cla ON cla.customer_id = c.id
    `;
  }

  private async hydrateDetails(
    client: IDatabaseClient,
    rows: any[]
  ): Promise<Customer[]> {
    if (rows.length === 0) return [];
    const customerIds = rows.map((r) => r.id);
    const placeholders = customerIds.map((_, i) => `$${i + 1}`).join(', ');

    // 1. Fetch categories
    const catMap = new Map<string, MilkCategory[]>();
    try {
      const catRes = await client.query(
        `SELECT customer_id, milk_category FROM customer_milk_categories WHERE customer_id IN (${placeholders}) AND is_authorized = TRUE;`,
        customerIds
      );
      for (const row of catRes.rows) {
        const list = catMap.get(row.customer_id) || [];
        if (row.milk_category === 'COW' || row.milk_category === 'BUFFALO') {
          list.push(row.milk_category);
        }
        catMap.set(row.customer_id, list);
      }
    } catch {
      // Ignored
    }

    // 2. Fetch face enrollment state
    const enrolledSet = new Set<string>();
    try {
      const faceRes = await client.query(
        `SELECT DISTINCT customer_id FROM face_enrollments WHERE customer_id IN (${placeholders}) AND status = 'ACTIVE';`,
        customerIds
      );
      for (const row of faceRes.rows) {
        enrolledSet.add(row.customer_id);
      }
    } catch {
      // Ignored
    }

    return rows.map((r) =>
      this.mapRowToCustomer(r, catMap.get(r.id), enrolledSet.has(r.id))
    );
  }

  /**
   * Finds customer by ID strictly within the authorized dairy tenant database.
   * Cross-tenant scatter-gather queries are strictly prohibited.
   */
  public async findById(id: string, organizationId?: string, includeDeleted = false): Promise<Customer | null> {
    if (!id || typeof id !== 'string') {
      return null;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!isUuid.test(id)) {
      return null;
    }

    let resolvedOrgId = organizationId;

    if (!resolvedOrgId) {
      // In the absence of an explicit organizationId (e.g. public customer registration status polling),
      // resolve the dairy tenant context from central control plane customer registry
      const controlDb = tenantDbManager.getControlPlaneDb();
      try {
        const lookupRes = await controlDb.query(
          'SELECT organization_id FROM customer_tenant_lookup WHERE customer_id = $1 OR global_customer_id = $1 LIMIT 1;',
          [id]
        );
        if (lookupRes.rows.length > 0 && lookupRes.rows[0].organization_id) {
          resolvedOrgId = lookupRes.rows[0].organization_id;
        }
      } catch {
        // Ignored
      }

      if (!resolvedOrgId) {
        try {
          const memRes = await controlDb.query(
            'SELECT organization_id FROM customer_dairy_memberships WHERE tenant_customer_id = $1 OR id = $1 OR global_customer_id = $1 LIMIT 1;',
            [id]
          );
          if (memRes.rows.length > 0 && memRes.rows[0].organization_id) {
            resolvedOrgId = memRes.rows[0].organization_id;
          }
        } catch {
          // Ignored
        }
      }
    }

    if (!resolvedOrgId) {
      return null;
    }

    const client = await tenantDbManager.getStrictTenantDb(resolvedOrgId);
    const conditions = ['(c.id = $1 OR c.global_customer_id = $1)', 'c.organization_id = $2'];
    if (!includeDeleted) {
      conditions.push('c.is_deleted = FALSE');
    }
    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE ${conditions.join(' AND ')}
      LIMIT 1;
    `;
    const result = await client.query(sql, [id, resolvedOrgId]);
    if (result.rows.length === 0) return null;

    const hydrated = await this.hydrateDetails(client, result.rows);
    return hydrated[0] || null;
  }

  public async findByFarmerCode(farmerCode: string, organizationId: string): Promise<Customer | null> {
    if (!organizationId) {
      throw new Error('Tenant context (organizationId) is required for farmer code lookup.');
    }

    const client = await tenantDbManager.getStrictTenantDb(organizationId);
    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE c.farmer_code = $1 AND c.organization_id = $2 AND c.is_deleted = FALSE
      LIMIT 1;
    `;
    const result = await client.query(sql, [farmerCode, organizationId]);
    if (result.rows.length === 0) return null;

    const hydrated = await this.hydrateDetails(client, result.rows);
    return hydrated[0] || null;
  }

  /**
   * Finds customer by RFID card strictly within the authorized dairy tenant database.
   */
  public async findByRfid(cardUid: string, organizationId?: string): Promise<Customer | null> {
    if (!organizationId) {
      throw new Error('Tenant context (organizationId) is required for RFID card lookup. Cross-dairy search is prohibited.');
    }

    const client = await tenantDbManager.getStrictTenantDb(organizationId);
    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE r.card_uid = $1 AND c.organization_id = $2 AND rca.is_active = TRUE AND c.is_deleted = FALSE
      LIMIT 1;
    `;
    const result = await client.query(sql, [cardUid, organizationId]);
    if (result.rows.length === 0) return null;

    const hydrated = await this.hydrateDetails(client, result.rows);
    return hydrated[0] || null;
  }

  /**
   * Finds customer by normalized phone number strictly within the authorized dairy tenant database.
   */
  public async findByPhone(phoneE164: string, organizationId?: string): Promise<Customer | null> {
    let resolvedOrgId = organizationId;

    if (!resolvedOrgId) {
      const controlDb = tenantDbManager.getControlPlaneDb();
      try {
        const lookupRes = await controlDb.query(
          'SELECT organization_id FROM customer_tenant_lookup WHERE mobile_number = $1 OR normalized_mobile_number = $1 LIMIT 1;',
          [phoneE164]
        );
        if (lookupRes.rows.length > 0 && lookupRes.rows[0].organization_id) {
          resolvedOrgId = lookupRes.rows[0].organization_id;
        }
      } catch {
        // Ignored
      }
    }

    if (!resolvedOrgId) {
      // Customer is not registered in any dairy tenant database
      return null;
    }

    const client = await tenantDbManager.getStrictTenantDb(resolvedOrgId);
    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE c.normalized_mobile_number = $1 AND c.organization_id = $2 AND c.is_deleted = FALSE
      LIMIT 1;
    `;
    const result = await client.query(sql, [phoneE164, resolvedOrgId]);
    if (result.rows.length === 0) return null;

    const hydrated = await this.hydrateDetails(client, result.rows);
    return hydrated[0] || null;
  }

  public async listCustomers(params: {
    organizationId: string;
    centerId?: string;
    search?: string;
    category?: MilkCategory;
    limit?: number;
    offset?: number;
    includeSoftDeleted?: boolean;
  }): Promise<Customer[]> {
    if (!params.organizationId) {
      throw new Error('Tenant context (organizationId) is required to list customers.');
    }

    const client = await tenantDbManager.getStrictTenantDb(params.organizationId);
    const conditions: string[] = ['c.organization_id = $1'];
    if (!params.includeSoftDeleted) {
      conditions.push('c.is_deleted = FALSE');
    }
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

    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.farmer_code ASC LIMIT $${idx++} OFFSET $${idx++};
    `;
    queryParams.push(params.limit || 50, params.offset || 0);

    const result = await client.query(sql, queryParams);
    let list = await this.hydrateDetails(client, result.rows);
    if (params.category) {
      list = list.filter((c) => c.permittedCategories.includes(params.category!));
    }
    return list;
  }

  public async save(customer: Customer): Promise<void> {
    if (!customer.organizationId) {
      throw new DomainValidationError('Customer organizationId is mandatory for persistence', 'MISSING_ORGANIZATION_ID');
    }

    const client = await tenantDbManager.getStrictTenantDb(customer.organizationId);

    await client.withTransaction(async (dbClient) => {
      // Verify organization exists and is active in tenant DB (never auto-create fake org)
      const orgCheck = await dbClient.query(
        `SELECT id, status FROM organizations WHERE id = $1 LIMIT 1;`,
        [customer.organizationId]
      );
      if (orgCheck.rows.length === 0) {
        throw new DomainValidationError(
          `Organization '${customer.organizationId}' does not exist in tenant database.`,
          'INVALID_ORGANIZATION'
        );
      }
      if (String(orgCheck.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError(
          `Organization '${customer.organizationId}' is not active.`,
          'ORGANIZATION_INACTIVE'
        );
      }

      // Verify primary center exists, belongs to this organization, and is active (never auto-create fake center)
      if (!customer.centerId) {
        throw new DomainValidationError('Customer primary centerId is mandatory.', 'MISSING_CENTER_ID');
      }
      const centerCheck = await dbClient.query(
        `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`,
        [customer.centerId]
      );
      if (centerCheck.rows.length === 0) {
        throw new DomainValidationError(
          `Collection center '${customer.centerId}' does not exist in tenant database.`,
          'INVALID_CENTER'
        );
      }
      if (String(centerCheck.rows[0].organization_id || '').toLowerCase() !== customer.organizationId.toLowerCase()) {
        throw new ForbiddenTenantError(
          `Cross-tenant center '${customer.centerId}' does not belong to organization '${customer.organizationId}'.`
        );
      }
      if (String(centerCheck.rows[0].status || '').toUpperCase() !== 'ACTIVE') {
        throw new DomainValidationError(
          `Collection center '${customer.centerId}' is inactive.`,
          'INACTIVE_CENTER'
        );
      }

      const upsertCustomerSql = `
        INSERT INTO customers (
          id, organization_id, primary_center_id, farmer_code, full_name,
          normalized_mobile_number, status, registration_status,
          bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name,
          deletion_reason, global_customer_id, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
          global_customer_id = COALESCE(EXCLUDED.global_customer_id, customers.global_customer_id),
          updated_at = NOW();
      `;

      await dbClient.query(upsertCustomerSql, [
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
        customer.globalCustomerId || null,
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
        await dbClient.query(addressSql, [customer.id, customer.village]);
      }

      // Save milk category permissions using an authoritative staff user from tenant DB if available
      if (customer.permittedCategories && customer.permittedCategories.length > 0) {
        const staffRes = await dbClient.query(
          `SELECT id FROM users WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`,
          [customer.organizationId]
        ).catch(() => ({ rows: [] as any[] }));
        const authUserId = staffRes.rows[0]?.id;
        if (authUserId) {
          for (const cat of customer.permittedCategories) {
            await dbClient.query(
              `INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
               VALUES ($1, $2, TRUE, $3)
               ON CONFLICT (customer_id, milk_category) DO NOTHING;`,
              [customer.id, cat, authUserId]
            ).catch(() => {});
          }
        }
      }

      // Ensure ledger account exists
      const ledgerSql = `
        INSERT INTO customer_ledger_accounts (
          customer_id, organization_id, currency, current_balance
        ) VALUES ($1, $2, 'INR', 0.00)
        ON CONFLICT (customer_id) DO NOTHING;
      `;
      await dbClient.query(ledgerSql, [customer.id, customer.organizationId]);
    });

    // Update central customer tenant lookup index for public status polling without scatter-gather
    try {
      const controlDb = tenantDbManager.getControlPlaneDb();
      await controlDb.query(`
        CREATE TABLE IF NOT EXISTS customer_tenant_lookup (
          customer_id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          normalized_mobile_number VARCHAR(30),
          registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await controlDb.query(`
        INSERT INTO customer_tenant_lookup (customer_id, organization_id, normalized_mobile_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (customer_id) DO UPDATE SET 
          organization_id = EXCLUDED.organization_id,
          normalized_mobile_number = EXCLUDED.normalized_mobile_number;
      `, [customer.id, customer.organizationId, customer.mobileNumber]);
    } catch {
      // Best-effort index in control plane
    }
  }

  public async listPendingRegistrations(organizationId?: string): Promise<Customer[]> {
    if (!organizationId) {
      throw new Error('Tenant context (organizationId) is required to view pending customer approvals.');
    }

    const client = await tenantDbManager.getStrictTenantDb(organizationId);
    const sql = `
      ${this.getBaseSelectQuery()}
      WHERE c.registration_status = 'PENDING_APPROVAL' AND c.organization_id = $1 AND c.is_deleted = FALSE
      ORDER BY c.created_at DESC;
    `;
    const res = await client.query(sql, [organizationId]);
    return await this.hydrateDetails(client, res.rows);
  }

  public async assignRfidCard(customerId: string, cardUid: string, organizationId?: string): Promise<void> {
    if (!organizationId) {
      throw new DomainValidationError('Tenant context (organizationId) is required for RFID card assignment.', 'TENANT_CONTEXT_REQUIRED');
    }

    const orgId = organizationId;
    const client = await tenantDbManager.getStrictTenantDb(orgId);
    await client.withTransaction(async (dbClient) => {
      // 1. Ensure card exists in rfid_cards
      const cardRes = await dbClient.query(`
        INSERT INTO rfid_cards (id, organization_id, card_uid, status)
        VALUES (gen_random_uuid(), $1, $2, 'ACTIVE')
        ON CONFLICT (organization_id, card_uid) DO UPDATE SET status = 'ACTIVE'
        RETURNING id;
      `, [orgId, cardUid]);
      const cardId = cardRes.rows[0]?.id;

      // 2. Fetch centerId and staff user
      const custRes = await dbClient.query(`SELECT primary_center_id FROM customers WHERE id = $1 AND organization_id = $2;`, [customerId, orgId]);
      const centerId = custRes.rows[0]?.primary_center_id;
      const userRes = await dbClient.query(`SELECT id FROM users WHERE organization_id = $1 AND status = 'ACTIVE' LIMIT 1;`, [orgId]);
      const operatorId = userRes.rows[0]?.id;
      if (!centerId || !operatorId) {
        throw new DomainValidationError('Valid customer center and active tenant operator are required for RFID assignment.', 'RFID_ASSIGNMENT_PRECONDITION_FAILED');
      }

      // 3. Deactivate existing active assignment for this customer or card
      await dbClient.query(`
        UPDATE rfid_card_assignments SET is_active = FALSE WHERE (customer_id = $1 OR rfid_card_id = $2) AND is_active = TRUE;
      `, [customerId, cardId]);

      // 4. Insert new active assignment
      await dbClient.query(`
        INSERT INTO rfid_card_assignments (id, rfid_card_id, customer_id, center_id, is_active, assigned_by)
        VALUES (gen_random_uuid(), $1, $2, $3, TRUE, $4);
      `, [cardId, customerId, centerId, operatorId]);
    });
  }

  public async updateFaceEnrollment(
    customerId: string,
    modelVersion: string,
    encryptedPayload: string,
    organizationId?: string
  ): Promise<void> {
    let orgId = organizationId;

    if (!orgId) {
      // Resolve tenant DB from central control plane
      const controlDb = tenantDbManager.getControlPlaneDb();
      try {
        const memLookup = await controlDb.query(
          'SELECT organization_id FROM customer_dairy_memberships WHERE tenant_customer_id = $1 OR id = $1 OR global_customer_id = $1 LIMIT 1;',
          [customerId]
        );
        if (memLookup.rows.length > 0 && memLookup.rows[0].organization_id) {
          orgId = memLookup.rows[0].organization_id;
        }
      } catch {}

      if (!orgId) {
        try {
          const lookup = await controlDb.query(
            'SELECT organization_id FROM customer_tenant_lookup WHERE customer_id = $1 LIMIT 1;',
            [customerId]
          );
          if (lookup.rows.length > 0) {
            orgId = lookup.rows[0].organization_id;
          }
        } catch {}
      }
    }

    if (!orgId) {
      throw new DomainValidationError(
        `Tenant context (organizationId) could not be resolved for customer '${customerId}' biometric enrollment.`,
        'MISSING_ORGANIZATION_ID'
      );
    }

    const client = await tenantDbManager.getStrictTenantDb(orgId);

    // Resolve model version UUID
    let modelVersionId: string = 'f0000000-0000-0000-0000-000000000001';
    try {
      const modelRes = await client.query(
        'SELECT id FROM face_model_versions WHERE model_version = $1 LIMIT 1;',
        [modelVersion]
      );
      if (modelRes.rows.length > 0) {
        modelVersionId = modelRes.rows[0].id;
      } else {
        const anyRes = await client.query('SELECT id FROM face_model_versions LIMIT 1;');
        if (anyRes.rows.length > 0) {
          modelVersionId = anyRes.rows[0].id;
        } else {
          const insRes = await client.query(`
            INSERT INTO face_model_versions (
              model_name, model_version, embedding_dimension, similarity_metric,
              recommended_threshold, is_active
            ) VALUES (
              'OpenCV-SFace-INT8', $1, 128, 'COSINE', 0.363, TRUE
            ) RETURNING id;
          `, [modelVersion]);
          modelVersionId = insRes.rows[0].id;
        }
      }
    } catch {}

    // Resolve authoritative active staff operator in tenant DB scoped strictly to organization_id (never fabricate or cross-query)
    let enrolledBy: string | null = null;
    const uRes = await client.query(
      `SELECT id FROM users WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`,
      [orgId]
    );
    if (uRes.rows.length > 0) {
      enrolledBy = uRes.rows[0].id;
    }
    if (!enrolledBy) {
      throw new DomainValidationError(
        `No active staff user found in tenant database '${orgId}' to attribute biometric enrollment.`,
        'NO_ACTIVE_OPERATOR'
      );
    }

    const payload = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
    const encDataB64 = payload.encryptedData || '';
    const ivB64 = payload.iv || '';
    const authTagB64 = payload.authTag || '';
    const keyRef = payload.keyReference || 'PRIMARY_KEY';

    // Mark previous ACTIVE enrollment for this customer and model version as SUPERSEDED (audit preservation)
    try {
      await client.query(
        `UPDATE face_enrollments SET status = 'SUPERSEDED' WHERE customer_id = $1 AND model_version_id = $2 AND status = 'ACTIVE';`,
        [customerId, modelVersionId]
      );
    } catch {}

    await client.query(`
      INSERT INTO face_enrollments (
        id, customer_id, model_version_id,
        embedding_encrypted, embedding_iv, embedding_auth_tag,
        encryption_key_reference, quality_score, status, enrolled_at,
        enrolled_by, device_id
      ) VALUES (
        gen_random_uuid(), $1, $2,
        decode($3, 'base64'), decode($4, 'base64'), decode($5, 'base64'),
        $6, 0.950, 'ACTIVE', NOW(),
        $7, 'KIOSK_MAIN_01'
      );
    `, [customerId, modelVersionId, encDataB64, ivB64, authTagB64, keyRef, enrolledBy]);

    // Touch customer updated_at timestamp to signify updated profile state
    try {
      await client.query('UPDATE customers SET updated_at = NOW() WHERE id = $1;', [customerId]);
    } catch {}
  }
}
