// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// RFID CARD & ASSIGNMENT DATA REPOSITORY (POSTGRESQL)
// ==============================================================================

import { pool } from '../../config/db.js';
import type {
  RfidCard,
  RfidCardAssignment,
  CustomerRfidStatusDTO,
} from '@dfarm/shared-types';
import {
  RfidCardStatus,
  RfidTechnology,
  CustomerStatus,
} from '@dfarm/shared-types';

export class RfidRepository {
  /**
   * Find an RFID card record by card UID within an organization.
   */
  public static async findCardByUid(
    cardUid: string,
    organizationId: string
  ): Promise<RfidCard | null> {
    const res = await pool.query(
      `SELECT id, organization_id, card_uid, card_type, status, created_at, updated_at
       FROM rfid_cards
       WHERE card_uid = $1 AND organization_id = $2
       LIMIT 1;`,
      [cardUid, organizationId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      cardUid: row.card_uid,
      cardType: row.card_type as RfidTechnology,
      status: row.status as RfidCardStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Find an RFID card by its internal UUID.
   */
  public static async findCardById(
    cardId: string,
    organizationId: string
  ): Promise<RfidCard | null> {
    const res = await pool.query(
      `SELECT id, organization_id, card_uid, card_type, status, created_at, updated_at
       FROM rfid_cards
       WHERE id = $1 AND organization_id = $2
       LIMIT 1;`,
      [cardId, organizationId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      cardUid: row.card_uid,
      cardType: row.card_type as RfidTechnology,
      status: row.status as RfidCardStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Find the current active assignment for a given card UID.
   */
  public static async findActiveAssignmentByCardUid(
    cardUid: string,
    organizationId: string
  ): Promise<(RfidCardAssignment & { customerOrgId: string; customerStatus: CustomerStatus; customerDeleted: boolean; customerName: string; farmerCode: string; primaryCenterId: string }) | null> {
    const res = await pool.query(
      `SELECT a.id, a.rfid_card_id, a.customer_id, a.center_id, a.is_active, a.assigned_at, a.assigned_by,
              r.card_uid, c.organization_id as cust_org_id, c.status as cust_status, c.is_deleted as cust_deleted,
              c.full_name as cust_name, c.farmer_code, c.primary_center_id
       FROM rfid_card_assignments a
       JOIN rfid_cards r ON a.rfid_card_id = r.id
       JOIN customers c ON a.customer_id = c.id
       WHERE r.card_uid = $1 AND r.organization_id = $2 AND a.is_active = TRUE
       LIMIT 1;`,
      [cardUid, organizationId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      rfidCardId: row.rfid_card_id,
      customerId: row.customer_id,
      centerId: row.center_id,
      isActive: row.is_active,
      assignedAt: row.assigned_at.toISOString(),
      assignedBy: row.assigned_by,
      cardUid: row.card_uid,
      customerOrgId: row.cust_org_id,
      customerStatus: row.cust_status as CustomerStatus,
      customerDeleted: row.cust_deleted,
      customerName: row.cust_name,
      farmerCode: row.farmer_code,
      primaryCenterId: row.primary_center_id,
    };
  }

  /**
   * Find the current active card assignment for a given customer.
   */
  public static async findActiveAssignmentByCustomerId(
    customerId: string
  ): Promise<(RfidCardAssignment & { cardUid: string; cardType: RfidTechnology }) | null> {
    const res = await pool.query(
      `SELECT a.id, a.rfid_card_id, a.customer_id, a.center_id, a.is_active, a.assigned_at, a.assigned_by,
              r.card_uid, r.card_type
       FROM rfid_card_assignments a
       JOIN rfid_cards r ON a.rfid_card_id = r.id
       WHERE a.customer_id = $1 AND a.is_active = TRUE
       LIMIT 1;`,
      [customerId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      rfidCardId: row.rfid_card_id,
      customerId: row.customer_id,
      centerId: row.center_id,
      isActive: row.is_active,
      assignedAt: row.assigned_at.toISOString(),
      assignedBy: row.assigned_by,
      cardUid: row.card_uid,
      cardType: row.card_type as RfidTechnology,
    };
  }

  /**
   * Create or get an RFID card in the organization inventory.
   */
  public static async upsertCard(
    organizationId: string,
    cardUid: string,
    cardType: RfidTechnology = RfidTechnology.MIFARE_CLASSIC_1K
  ): Promise<RfidCard> {
    const res = await pool.query(
      `INSERT INTO rfid_cards (organization_id, card_uid, card_type, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (organization_id, card_uid)
       DO UPDATE SET updated_at = NOW()
       RETURNING id, organization_id, card_uid, card_type, status, created_at, updated_at;`,
      [organizationId, cardUid, cardType]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      cardUid: row.card_uid,
      cardType: row.card_type as RfidTechnology,
      status: row.status as RfidCardStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Assign an RFID card to a customer.
   * If customer is currently PENDING_RFID_ASSIGNMENT, updates them to ACTIVE & COMPLETED.
   */
  public static async createAssignment(params: {
    cardId: string;
    customerId: string;
    centerId: string;
    assignedBy: string;
    organizationId: string;
  }): Promise<RfidCardAssignment> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Insert assignment
      const assignRes = await client.query(
        `INSERT INTO rfid_card_assignments (
           rfid_card_id, customer_id, center_id, is_active, assigned_at, assigned_by
         ) VALUES ($1, $2, $3, TRUE, NOW(), $4)
         RETURNING id, rfid_card_id, customer_id, center_id, is_active, assigned_at, assigned_by;`,
        [params.cardId, params.customerId, params.centerId, params.assignedBy]
      );

      // 2. Update card status to ACTIVE
      await client.query(
        `UPDATE rfid_cards SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1;`,
        [params.cardId]
      );

      // 3. Check customer status: activate ONLY when all prerequisites (Face + RFID) are met
      const custRes = await client.query(
        `SELECT status, registration_status FROM customers WHERE id = $1 FOR UPDATE;`,
        [params.customerId]
      );

      if (custRes.rows.length > 0) {
        const curStatus = custRes.rows[0].status;
        const faceRes = await client.query(
          `SELECT 1 FROM face_enrollments WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1;`,
          [params.customerId]
        );
        const hasActiveFace = faceRes.rows.length > 0;

        if (curStatus === 'PENDING_RFID_ASSIGNMENT' || (curStatus === 'DRAFT' && hasActiveFace)) {
          await client.query(
            `UPDATE customers
             SET status = 'ACTIVE',
                 registration_status = 'COMPLETED',
                 updated_at = NOW(),
                 version = version + 1
             WHERE id = $1;`,
            [params.customerId]
          );

          await client.query(
            `INSERT INTO customer_status_history (
               customer_id, previous_status, new_status, change_reason, changed_by, changed_at
             ) VALUES ($1, $2, 'ACTIVE', 'Activated upon successful completion of all registration prerequisites (Face + RFID)', $3, NOW());`,
            [params.customerId, curStatus, params.assignedBy]
          );
        } else if (curStatus === 'DRAFT') {
          // Has RFID assigned but awaiting Face enrollment
          await client.query(
            `UPDATE customers
             SET status = 'PENDING_FACE_ENROLLMENT',
                 registration_status = 'IN_PROGRESS',
                 updated_at = NOW(),
                 version = version + 1
             WHERE id = $1;`,
            [params.customerId]
          );

          await client.query(
            `INSERT INTO customer_status_history (
               customer_id, previous_status, new_status, change_reason, changed_by, changed_at
             ) VALUES ($1, $2, 'PENDING_FACE_ENROLLMENT', 'RFID assigned, awaiting Face enrollment', $3, NOW());`,
            [params.customerId, curStatus, params.assignedBy]
          );
        }
      }

      // 4. Audit log
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, center_id, user_id, action, entity_type, entity_id, new_values
         ) VALUES ($1, $2, $3, 'RFID_CARD_ASSIGNED', 'CUSTOMER', $4, $5);`,
        [
          params.organizationId,
          params.centerId,
          params.assignedBy,
          params.customerId,
          JSON.stringify({ cardId: params.cardId, assignmentId: assignRes.rows[0].id }),
        ]
      );

      await client.query('COMMIT;');

      const row = assignRes.rows[0];
      return {
        id: row.id,
        rfidCardId: row.rfid_card_id,
        customerId: row.customer_id,
        centerId: row.center_id,
        isActive: row.is_active,
        assignedAt: row.assigned_at.toISOString(),
        assignedBy: row.assigned_by,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Replace an active RFID card with a new card.
   * Atomically revokes previous card and assigns the new card.
   */
  public static async replaceAssignment(params: {
    previousAssignmentId: string;
    previousCardId: string;
    newCardId: string;
    customerId: string;
    centerId: string;
    replacedBy: string;
    revocationReason: string;
    organizationId: string;
    newOldCardStatus?: 'REVOKED' | 'LOST';
  }): Promise<RfidCardAssignment> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Deactivate old assignment
      await client.query(
        `UPDATE rfid_card_assignments
         SET is_active = FALSE,
             revoked_at = NOW(),
             revoked_by = $1,
             revocation_reason = $2
         WHERE id = $3;`,
        [params.replacedBy, params.revocationReason, params.previousAssignmentId]
      );

      // 2. Update old card status
      const oldStatus = params.newOldCardStatus || 'REVOKED';
      await client.query(
        `UPDATE rfid_cards SET status = $1, updated_at = NOW() WHERE id = $2;`,
        [oldStatus, params.previousCardId]
      );

      // 3. Create new assignment
      const assignRes = await client.query(
        `INSERT INTO rfid_card_assignments (
           rfid_card_id, customer_id, center_id, is_active, assigned_at, assigned_by
         ) VALUES ($1, $2, $3, TRUE, NOW(), $4)
         RETURNING id, rfid_card_id, customer_id, center_id, is_active, assigned_at, assigned_by;`,
        [params.newCardId, params.customerId, params.centerId, params.replacedBy]
      );

      // 4. Update new card status to ACTIVE
      await client.query(
        `UPDATE rfid_cards SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1;`,
        [params.newCardId]
      );

      // 5. Audit log
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, center_id, user_id, action, entity_type, entity_id, old_values, new_values
         ) VALUES ($1, $2, $3, 'RFID_CARD_REPLACED', 'CUSTOMER', $4, $5, $6);`,
        [
          params.organizationId,
          params.centerId,
          params.replacedBy,
          params.customerId,
          JSON.stringify({ oldCardId: params.previousCardId, reason: params.revocationReason }),
          JSON.stringify({ newCardId: params.newCardId, assignmentId: assignRes.rows[0].id }),
        ]
      );

      await client.query('COMMIT;');

      const row = assignRes.rows[0];
      return {
        id: row.id,
        rfidCardId: row.rfid_card_id,
        customerId: row.customer_id,
        centerId: row.center_id,
        isActive: row.is_active,
        assignedAt: row.assigned_at.toISOString(),
        assignedBy: row.assigned_by,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke an RFID card and deactivate any active assignment.
   */
  public static async revokeCard(params: {
    cardId: string;
    status: 'REVOKED' | 'LOST' | 'BLOCKED';
    reason: string;
    revokedBy: string;
    organizationId: string;
  }): Promise<{ affectedCustomerIds: string[] }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Update card status
      await client.query(
        `UPDATE rfid_cards SET status = $1, updated_at = NOW() WHERE id = $2;`,
        [params.status, params.cardId]
      );

      // 2. Find any active assignment
      const assignRes = await client.query(
        `SELECT id, customer_id, center_id
         FROM rfid_card_assignments
         WHERE rfid_card_id = $1 AND is_active = TRUE;`,
        [params.cardId]
      );

      const affectedCustomerIds: string[] = [];
      for (const row of assignRes.rows) {
        affectedCustomerIds.push(row.customer_id);
        await client.query(
          `UPDATE rfid_card_assignments
           SET is_active = FALSE,
               revoked_at = NOW(),
               revoked_by = $1,
               revocation_reason = $2
           WHERE id = $3;`,
          [params.revokedBy, params.reason, row.id]
        );

        // Audit log
        await client.query(
          `INSERT INTO audit_logs (
             organization_id, center_id, user_id, action, entity_type, entity_id, new_values
           ) VALUES ($1, $2, $3, 'RFID_CARD_REVOKED', 'RFID_CARD', $4, $5);`,
          [
            params.organizationId,
            row.center_id,
            params.revokedBy,
            params.cardId,
            JSON.stringify({ status: params.status, reason: params.reason, customerId: row.customer_id }),
          ]
        );
      }

      await client.query('COMMIT;');
      return { affectedCustomerIds };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get complete RFID status and assignment history for a customer.
   */
  public static async getCustomerRfidStatus(
    customerId: string,
    organizationId: string
  ): Promise<CustomerRfidStatusDTO | null> {
    // 1. Fetch customer info
    const custRes = await pool.query(
      `SELECT id, status, registration_status, is_deleted
       FROM customers
       WHERE id = $1 AND organization_id = $2;`,
      [customerId, organizationId]
    );

    if (custRes.rows.length === 0) return null;
    const cust = custRes.rows[0];

    // 2. Fetch all assignments
    const assignRes = await pool.query(
      `SELECT a.id, a.rfid_card_id, a.is_active, a.assigned_at, a.assigned_by,
              a.revoked_at, a.revocation_reason, r.card_uid, r.card_type
       FROM rfid_card_assignments a
       JOIN rfid_cards r ON a.rfid_card_id = r.id
       WHERE a.customer_id = $1
       ORDER BY a.assigned_at DESC;`,
      [customerId]
    );

    let activeCard: CustomerRfidStatusDTO['activeCard'] = null;
    const assignmentHistory: CustomerRfidStatusDTO['assignmentHistory'] = [];

    for (const row of assignRes.rows) {
      const item = {
        id: row.id,
        assignmentId: row.id,
        cardId: row.rfid_card_id,
        rfidCardId: row.rfid_card_id,
        cardUid: row.card_uid,
        isActive: row.is_active,
        assignedAt: row.assigned_at.toISOString(),
        assignedBy: row.assigned_by,
        revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
        revocationReason: row.revocation_reason,
      };

      assignmentHistory.push(item as any);

      if (row.is_active && !activeCard) {
        activeCard = {
          id: row.id,
          assignmentId: row.id,
          cardId: row.rfid_card_id,
          rfidCardId: row.rfid_card_id,
          cardUid: row.card_uid,
          cardType: row.card_type as RfidTechnology,
          assignedAt: row.assigned_at.toISOString(),
        } as any;
      }
    }

    return {
      customerId: cust.id,
      customerStatus: cust.status as CustomerStatus,
      registrationStatus: cust.registration_status,
      activeCard,
      assignmentHistory,
    };
  }
}

