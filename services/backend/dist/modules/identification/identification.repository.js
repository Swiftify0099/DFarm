// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// IDENTIFICATION AUDIT & VERIFICATION DATA REPOSITORY (POSTGRESQL)
// ==============================================================================
import { pool } from '../../config/db.js';
export class IdentificationRepository {
    /**
     * Commit an identification attempt audit log.
     * Protects audit logs as append-only.
     */
    static async recordAuditLog(params) {
        let modelVersionUuid = null;
        if (params.faceModelVersionId) {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.faceModelVersionId)) {
                modelVersionUuid = params.faceModelVersionId;
            }
            else {
                const mvRes = await pool.query(`SELECT id FROM face_model_versions WHERE model_version = $1 LIMIT 1;`, [params.faceModelVersionId]);
                if (mvRes.rows.length > 0) {
                    modelVersionUuid = mvRes.rows[0].id;
                }
            }
        }
        const res = await pool.query(`INSERT INTO identification_audit_logs (
         organization_id,
         center_id,
         session_id,
         customer_id,
         identification_method,
         verification_outcome,
         face_model_version_id,
         face_match_score,
         rfid_card_uid_scanned,
         supervisor_id,
         supervisor_reason_code,
         device_id,
         recorded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING id;`, [
            params.organizationId,
            params.centerId,
            params.sessionId || null,
            params.customerId || null,
            params.identificationMethod,
            params.verificationOutcome,
            modelVersionUuid,
            params.faceMatchScore !== undefined && params.faceMatchScore !== null ? Number(params.faceMatchScore.toFixed(4)) : null,
            params.rfidCardUidScanned || null,
            params.supervisorId || null,
            params.supervisorReasonCode || null,
            params.deviceId,
        ]);
        return res.rows[0].id;
    }
    /**
     * Commit a supervisor manual verification record linked to an audit log.
     */
    static async recordSupervisorVerification(params) {
        const res = await pool.query(`INSERT INTO supervisor_verification_records (
         audit_log_id,
         supervisor_id,
         customer_id,
         center_id,
         reason_category,
         justification_notes,
         authenticated_via,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id;`, [
            params.auditLogId,
            params.supervisorId,
            params.customerId,
            params.centerId,
            params.reasonCategory,
            params.justificationNotes,
            params.authenticatedVia || 'PIN',
        ]);
        return res.rows[0].id;
    }
    /**
     * Find an active customer with their card and registration info.
     */
    static async findActiveFaceEnrollment(customerId) {
        const res = await pool.query(`SELECT id, status, model_version_id 
       FROM face_enrollments 
       WHERE customer_id = $1 
       ORDER BY enrolled_at DESC LIMIT 1;`, [customerId]);
        if (res.rows.length === 0)
            return null;
        return {
            id: res.rows[0].id,
            status: res.rows[0].status,
            modelVersionId: res.rows[0].model_version_id,
        };
    }
    /**
     * Find an active customer with their card and registration info.
     */
    static async findCustomerById(customerId, organizationId) {
        const custRes = await pool.query(`SELECT c.id, c.organization_id, c.primary_center_id, c.farmer_code, c.full_name, c.status, c.is_deleted,
              COALESCE(array_agg(m.milk_category) FILTER (WHERE m.milk_category IS NOT NULL), '{}') as categories
       FROM customers c
       LEFT JOIN customer_milk_categories m ON c.id = m.customer_id AND m.is_authorized = TRUE
       WHERE c.id = $1 AND c.organization_id = $2
       GROUP BY c.id;`, [customerId, organizationId]);
        if (custRes.rows.length === 0)
            return null;
        const row = custRes.rows[0];
        return {
            id: row.id,
            organizationId: row.organization_id,
            primaryCenterId: row.primary_center_id,
            farmerCode: row.farmer_code,
            fullName: row.full_name,
            status: row.status,
            isDeleted: row.is_deleted,
            permittedCategories: row.categories || [],
        };
    }
    /**
     * Resolve customer via RFID card UID.
     */
    static async findCustomerByRfidCard(normalizedCardUid, organizationId) {
        const res = await pool.query(`SELECT r.id as card_id, r.status as card_status, a.is_active as is_assignment_active,
              c.id as customer_id, c.is_deleted as customer_deleted, c.status as customer_status,
              c.full_name as customer_name, c.farmer_code, c.primary_center_id,
              COALESCE(array_agg(m.milk_category) FILTER (WHERE m.milk_category IS NOT NULL), '{}') as categories
       FROM rfid_cards r
       LEFT JOIN rfid_card_assignments a ON r.id = a.rfid_card_id AND a.is_active = TRUE
       LEFT JOIN customers c ON a.customer_id = c.id
       LEFT JOIN customer_milk_categories m ON c.id = m.customer_id AND m.is_authorized = TRUE
       WHERE r.card_uid = $1 AND r.organization_id = $2
       GROUP BY r.id, r.status, a.is_active, c.id, c.is_deleted, c.status, c.full_name, c.farmer_code, c.primary_center_id
       LIMIT 1;`, [normalizedCardUid, organizationId]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        return {
            cardId: row.card_id,
            cardStatus: row.card_status,
            isAssignmentActive: Boolean(row.is_assignment_active),
            customerId: row.customer_id,
            customerDeleted: Boolean(row.customer_deleted),
            customerStatus: row.customer_status,
            customerName: row.customer_name,
            farmerCode: row.farmer_code,
            primaryCenterId: row.primary_center_id,
            permittedCategories: row.categories || [],
        };
    }
    /**
     * Verify supervisor credentials and center authorization.
     */
    static async verifySupervisorAuthorization(supervisorId, centerId, organizationId) {
        const res = await pool.query(`SELECT u.id, u.role, u.full_name, u.status,
              EXISTS (
                SELECT 1 FROM user_center_assignments a 
                WHERE a.user_id = u.id AND a.center_id = $2
              ) as center_assigned
       FROM users u
       WHERE u.id = $1 AND u.organization_id = $3 AND u.status = 'ACTIVE';`, [supervisorId, centerId, organizationId]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        // Super admins and dairy owners have global center authorization
        const isGlobal = row.role === 'SUPER_ADMIN' || row.role === 'DAIRY_OWNER';
        const isAuthorized = isGlobal || Boolean(row.center_assigned);
        return {
            isValid: isAuthorized,
            role: row.role,
            fullName: row.full_name,
        };
    }
    /**
     * Query recent identification audit logs.
     */
    static async queryAuditLogs(params) {
        let q = `
      SELECT id, organization_id, center_id, session_id, customer_id,
             identification_method, verification_outcome, face_match_score,
             rfid_card_uid_scanned, supervisor_id, supervisor_reason_code,
             device_id, recorded_at
      FROM identification_audit_logs
      WHERE organization_id = $1
    `;
        const args = [params.organizationId];
        if (params.centerId) {
            args.push(params.centerId);
            q += ` AND center_id = $${args.length}`;
        }
        if (params.customerId) {
            args.push(params.customerId);
            q += ` AND customer_id = $${args.length}`;
        }
        q += ` ORDER BY recorded_at DESC LIMIT $${args.length + 1};`;
        args.push(params.limit || 50);
        const res = await pool.query(q, args);
        return res.rows.map(row => ({
            id: row.id,
            organizationId: row.organization_id,
            centerId: row.center_id,
            sessionId: row.session_id,
            customerId: row.customer_id,
            identificationMethod: row.identification_method,
            verificationOutcome: row.verification_outcome,
            faceMatchScore: row.face_match_score ? Number(row.face_match_score) : null,
            rfidCardUidScanned: row.rfid_card_uid_scanned,
            supervisorId: row.supervisor_id,
            supervisorReasonCode: row.supervisor_reason_code,
            deviceId: row.device_id,
            recordedAt: row.recorded_at.toISOString(),
        }));
    }
}
//# sourceMappingURL=identification.repository.js.map