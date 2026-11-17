import { Customer } from '../../domain/entities/Customer.js';
import { db } from '../database/PostgresPool.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';
import { logger } from '../../shared/logger/index.js';
export class PostgresCustomerRepository {
    static fallbackStore = new Map();
    mapRowToCustomer(row, categories, faceEnrolled) {
        const defaultCats = Array.isArray(categories) && categories.length > 0
            ? categories
            : (Array.isArray(row.permitted_categories) && row.permitted_categories.length > 0
                ? row.permitted_categories.filter((c) => c === 'COW' || c === 'BUFFALO')
                : ['COW']);
        const props = {
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
    getBaseSelectQuery() {
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
    async hydrateDetails(client, rows) {
        if (rows.length === 0)
            return [];
        const customerIds = rows.map((r) => r.id);
        const placeholders = customerIds.map((_, i) => `$${i + 1}`).join(', ');
        // 1. Fetch categories
        const catMap = new Map();
        try {
            const catRes = await client.query(`SELECT customer_id, milk_category FROM customer_milk_categories WHERE customer_id IN (${placeholders}) AND is_authorized = TRUE;`, customerIds);
            for (const row of catRes.rows) {
                const list = catMap.get(row.customer_id) || [];
                if (row.milk_category === 'COW' || row.milk_category === 'BUFFALO') {
                    list.push(row.milk_category);
                }
                catMap.set(row.customer_id, list);
            }
        }
        catch {
            // Ignored
        }
        // 2. Fetch face enrollment state
        const enrolledSet = new Set();
        try {
            const faceRes = await client.query(`SELECT DISTINCT customer_id FROM face_enrollments WHERE customer_id IN (${placeholders}) AND status = 'ACTIVE';`, customerIds);
            for (const row of faceRes.rows) {
                enrolledSet.add(row.customer_id);
            }
        }
        catch {
            // Ignored
        }
        return rows.map((r) => this.mapRowToCustomer(r, catMap.get(r.id), enrolledSet.has(r.id)));
    }
    async findById(id, organizationId) {
        // 1. Check in-memory fallback
        const cached = PostgresCustomerRepository.fallbackStore.get(id);
        if (cached && (!organizationId || cached.organizationId === organizationId)) {
            return cached;
        }
        // 2. Resolve target tenant DB or all mapped tenant DBs
        const targetClients = [];
        if (organizationId) {
            const cl = await tenantDbManager.getTenantDb(organizationId);
            targetClients.push({ client: cl, orgId: organizationId });
        }
        else {
            const mappings = tenantDbManager.getAllMappings();
            for (const m of mappings) {
                const cl = await tenantDbManager.getTenantDb(m.dairyId);
                targetClients.push({ client: cl, orgId: m.dairyId });
            }
            // Also include default control plane client
            targetClients.push({ client: db, orgId: '' });
        }
        for (const { client } of targetClients) {
            try {
                const sql = `
          ${this.getBaseSelectQuery()}
          WHERE c.id = $1 AND c.is_deleted = FALSE
          LIMIT 1;
        `;
                const result = await client.query(sql, [id]);
                if (result.rows.length > 0) {
                    const hydrated = await this.hydrateDetails(client, result.rows);
                    return hydrated[0] || null;
                }
            }
            catch {
                // Continue searching
            }
        }
        return cached || null;
    }
    async findByFarmerCode(farmerCode, organizationId) {
        try {
            const client = await tenantDbManager.getTenantDb(organizationId);
            const sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.farmer_code = $1 AND c.organization_id = $2 AND c.is_deleted = FALSE
        LIMIT 1;
      `;
            const result = await client.query(sql, [farmerCode, organizationId]);
            if (result.rows.length === 0)
                return null;
            const hydrated = await this.hydrateDetails(client, result.rows);
            return hydrated[0] || null;
        }
        catch {
            for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
                if (cust.farmerCode === farmerCode && cust.organizationId === organizationId) {
                    return cust;
                }
            }
            return null;
        }
    }
    async findByRfid(cardUid, organizationId) {
        const targetClients = [];
        if (organizationId) {
            targetClients.push(await tenantDbManager.getTenantDb(organizationId));
        }
        else {
            for (const m of tenantDbManager.getAllMappings()) {
                targetClients.push(await tenantDbManager.getTenantDb(m.dairyId));
            }
            targetClients.push(db);
        }
        for (const client of targetClients) {
            try {
                let sql = `
          ${this.getBaseSelectQuery()}
          WHERE r.card_uid = $1 AND rca.is_active = TRUE AND c.is_deleted = FALSE
        `;
                const params = [cardUid];
                if (organizationId) {
                    sql += ` AND c.organization_id = $2`;
                    params.push(organizationId);
                }
                sql += ` LIMIT 1;`;
                const result = await client.query(sql, params);
                if (result.rows.length > 0) {
                    const hydrated = await this.hydrateDetails(client, result.rows);
                    return hydrated[0] || null;
                }
            }
            catch {
                // Continue
            }
        }
        for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
            if (cust.rfidCardUid === cardUid && (!organizationId || cust.organizationId === organizationId)) {
                return cust;
            }
        }
        return null;
    }
    async findByPhone(phoneE164, organizationId) {
        const targetClients = [];
        if (organizationId) {
            targetClients.push(await tenantDbManager.getTenantDb(organizationId));
        }
        else {
            for (const m of tenantDbManager.getAllMappings()) {
                targetClients.push(await tenantDbManager.getTenantDb(m.dairyId));
            }
            targetClients.push(db);
        }
        for (const client of targetClients) {
            try {
                let sql = `
          ${this.getBaseSelectQuery()}
          WHERE c.normalized_mobile_number = $1 AND c.is_deleted = FALSE
        `;
                const params = [phoneE164];
                if (organizationId) {
                    sql += ` AND c.organization_id = $2`;
                    params.push(organizationId);
                }
                sql += ` LIMIT 1;`;
                const result = await client.query(sql, params);
                if (result.rows.length > 0) {
                    const hydrated = await this.hydrateDetails(client, result.rows);
                    return hydrated[0] || null;
                }
            }
            catch {
                // Continue
            }
        }
        return PostgresCustomerRepository.fallbackStore.get(phoneE164) || null;
    }
    async listCustomers(params) {
        const client = await tenantDbManager.getTenantDb(params.organizationId);
        const conditions = ['c.organization_id = $1'];
        if (!params.includeSoftDeleted) {
            conditions.push('c.is_deleted = FALSE');
        }
        const queryParams = [params.organizationId];
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
      ORDER BY c.farmer_code ASC LIMIT $${idx++} OFFSET $${idx++};
    `;
        queryParams.push(params.limit || 50, params.offset || 0);
        try {
            const result = await client.query(sql, queryParams);
            let list = await this.hydrateDetails(client, result.rows);
            if (params.category) {
                list = list.filter((c) => c.permittedCategories.includes(params.category));
            }
            return list;
        }
        catch (err) {
            logger.warn({ error: err.message }, 'listCustomers database query failed, falling back to cache');
            const list = [];
            for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
                if (cust.organizationId === params.organizationId && (!cust.isDeleted || params.includeSoftDeleted)) {
                    list.push(cust);
                }
            }
            return list;
        }
    }
    async save(customer) {
        PostgresCustomerRepository.fallbackStore.set(customer.id, customer);
        PostgresCustomerRepository.fallbackStore.set(customer.mobileNumber, customer);
        const client = await tenantDbManager.getTenantDb(customer.organizationId);
        try {
            await client.withTransaction(async (dbClient) => {
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
                // Save milk category permissions
                if (customer.permittedCategories && customer.permittedCategories.length > 0) {
                    for (const cat of customer.permittedCategories) {
                        await dbClient.query(`INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
               VALUES ($1, $2, TRUE, '00000000-0000-0000-0000-000000000099')
               ON CONFLICT (customer_id, milk_category) DO NOTHING;`, [customer.id, cat]).catch(() => { });
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
        }
        catch (err) {
            logger.error({ error: err.message, customerId: customer.id, orgId: customer.organizationId }, 'Failed to persist customer in tenant database');
            throw err;
        }
    }
    async listPendingRegistrations(organizationId) {
        const list = [];
        const client = await tenantDbManager.getTenantDb(organizationId);
        try {
            let sql = `
        ${this.getBaseSelectQuery()}
        WHERE c.registration_status = 'PENDING_APPROVAL' AND c.is_deleted = FALSE
      `;
            const params = [];
            if (organizationId) {
                sql += ` AND c.organization_id = $1`;
                params.push(organizationId);
            }
            sql += ` ORDER BY c.created_at DESC;`;
            const res = await client.query(sql, params);
            const hydrated = await this.hydrateDetails(client, res.rows);
            for (const item of hydrated) {
                list.push(item);
            }
        }
        catch (err) {
            logger.warn({ error: err.message }, 'Database query in listPendingRegistrations failed');
        }
        // Merge in-memory fallbackStore entries for this tenant if any
        const existingIds = new Set(list.map((c) => c.id));
        for (const cust of PostgresCustomerRepository.fallbackStore.values()) {
            if (cust.registrationStatus === 'PENDING_APPROVAL' &&
                (!organizationId || cust.organizationId === organizationId) &&
                !existingIds.has(cust.id)) {
                list.push(cust);
            }
        }
        return list;
    }
    async updateFaceEnrollment(customerId, modelVersion, encryptedPayload) {
        const cached = PostgresCustomerRepository.fallbackStore.get(customerId);
        if (cached) {
            cached.setFaceTemplateEnrolled(true);
        }
        // Find customer's organizationId
        const customer = await this.findById(customerId);
        const orgId = customer?.organizationId || '00000000-0000-0000-0000-000000000001';
        const client = await tenantDbManager.getTenantDb(orgId);
        try {
            await client.withTransaction(async (dbClient) => {
                // Find model version id
                const modelRes = await dbClient.query(`SELECT id FROM face_model_versions WHERE model_version = $1 LIMIT 1`, [modelVersion]);
                let modelVersionId = 'f0000000-0000-0000-0000-000000000001';
                if (modelRes.rows.length > 0) {
                    modelVersionId = modelRes.rows[0].id;
                }
                // Mark old active enrollments superseded
                await dbClient.query(`UPDATE face_enrollments SET status = 'SUPERSEDED' WHERE customer_id = $1 AND model_version_id = $2 AND status = 'ACTIVE'`, [customerId, modelVersionId]);
                const userRes = await dbClient.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'DAIRY_ADMIN', 'COLLECTION_OPERATOR') LIMIT 1;`);
                const enrolledBy = userRes.rows[0]?.id || '00000000-0000-0000-0000-000000000099';
                const parsed = JSON.parse(encryptedPayload);
                const insertSql = `
          INSERT INTO face_enrollments (
            customer_id, model_version_id, embedding_encrypted, embedding_iv,
            embedding_auth_tag, encryption_key_reference, quality_score, status,
            enrolled_by, device_id
          ) VALUES (
            $1, $2, decode($3, 'base64'), decode($4, 'base64'),
            decode($5, 'base64'), $6, 0.95, 'ACTIVE',
            $7,
            'KIOSK_MAIN'
          ) RETURNING id;
        `;
                const enrollRes = await dbClient.query(insertSql, [
                    customerId,
                    modelVersionId,
                    parsed.encryptedData,
                    parsed.iv,
                    parsed.authTag,
                    parsed.keyReference,
                    enrolledBy,
                ]);
                const enrollmentId = enrollRes.rows[0]?.id;
                // Record customer biometric consent if not already recorded
                await dbClient.query(`INSERT INTO customer_consent_records (
            customer_id, consent_type, consent_granted, consent_text_version,
            consent_language, officer_id
          )
          VALUES (
            $1, 'BIOMETRIC_FACE_ENROLLMENT', TRUE, 'v1.0', 'en', $2
          )
          ON CONFLICT DO NOTHING;`, [customerId, enrolledBy]);
                // Record biometric retention record
                if (enrollmentId) {
                    await dbClient.query(`INSERT INTO biometric_retention_records (
              customer_id, face_enrollment_id, retention_policy_name, retention_status
            ) VALUES ($1, $2, 'POLICY_SUBJECT_TO_CONSENT', 'ACTIVE')
            ON CONFLICT DO NOTHING;`, [customerId, enrollmentId]);
                }
            });
        }
        catch (err) {
            logger.error({ error: err.message, customerId }, 'Failed to persist face enrollment in tenant database');
            throw err;
        }
    }
}
//# sourceMappingURL=PostgresCustomerRepository.js.map