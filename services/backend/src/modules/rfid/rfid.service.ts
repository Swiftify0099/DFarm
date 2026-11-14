// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// RFID BUSINESS SERVICE (ASSIGNMENT, REPLACEMENT, REVOCATION & STATUS)
// ==============================================================================

import { RfidRepository } from './rfid.repository.js';
import { normalizeRfidUid } from '@dfarm/shared-validation';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  UserRole,
  RfidTechnology,
  RfidCardStatus,
  type RfidAssignDTO,
  type RfidReplaceDTO,
  type RfidRevokeDTO,
  type CustomerRfidStatusDTO,
} from '@dfarm/shared-types';
import { pool } from '../../config/db.js';

export class RfidService {
  /**
   * Assign an RFID card to a customer.
   */
  public static async assignRfidCard(
    dto: RfidAssignDTO,
    context: AuthContext
  ): Promise<{ assignmentId: string; cardUid: string; customerId: string; status: string }> {
    // 1. Role verification: Only authorized Admin, Center Manager, or Registration Officer
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];

    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError('Only Registration Officers, Center Managers, and Admins can assign RFID cards');
    }

    // 2. Normalize Card UID
    const normalizedUid = normalizeRfidUid(dto.cardUid);

    // 3. Customer Existence & Organization Isolation Check
    const custRes = await pool.query(
      `SELECT id, organization_id, primary_center_id, status, is_deleted, full_name
       FROM customers
       WHERE id = $1;`,
      [dto.customerId]
    );

    if (custRes.rows.length === 0) {
      throw new NotFoundError(`Customer with UUID ${dto.customerId} does not exist`);
    }

    const customer = custRes.rows[0];

    // Organization boundary enforcement
    if (context.role !== UserRole.SUPER_ADMIN && customer.organization_id !== context.organizationId) {
      throw new ForbiddenError('Access denied: Customer belongs to a different organization');
    }

    // Deleted customer check
    if (customer.is_deleted) {
      throw new BadRequestError('Cannot assign RFID card to a soft-deleted customer. Restore customer first.');
    }

    // Center scope verification
    const centerId = dto.centerId || customer.primary_center_id;
    if (context.role === UserRole.CENTER_MANAGER || context.role === UserRole.REGISTRATION_OFFICER) {
      if (!context.centerIds.includes(centerId)) {
        throw new ForbiddenError(`User is not authorized for center ${centerId}`);
      }
    }

    // 4. Policy Check: Customer must NOT have multiple active cards
    const existingCustCard = await RfidRepository.findActiveAssignmentByCustomerId(dto.customerId);
    if (existingCustCard) {
      throw new ConflictError(
        `Customer already holds an active card (UID: ${existingCustCard.cardUid}). Multiple active cards are prohibited. Use the replacement workflow instead.`
      );
    }

    // 5. Card Uniqueness & Inventory Verification
    const existingCard = await RfidRepository.findCardByUid(normalizedUid, customer.organization_id);

    let targetCardId: string;
    if (existingCard) {
      // Check card status
      if (
        existingCard.status === RfidCardStatus.BLOCKED ||
        existingCard.status === RfidCardStatus.REVOKED ||
        existingCard.status === RfidCardStatus.LOST
      ) {
        throw new BadRequestError(`RFID Card ${normalizedUid} is currently ${existingCard.status} and cannot be assigned`);
      }

      // Check if actively assigned to another customer
      const activeAssign = await pool.query(
        `SELECT id, customer_id FROM rfid_card_assignments WHERE rfid_card_id = $1 AND is_active = TRUE;`,
        [existingCard.id]
      );

      if (activeAssign.rows.length > 0) {
        throw new ConflictError(`RFID card ${normalizedUid} is already actively assigned to another customer`);
      }

      targetCardId = existingCard.id;
    } else {
      // Create card in inventory
      const newCard = await RfidRepository.upsertCard(
        customer.organization_id,
        normalizedUid,
        dto.cardType || RfidTechnology.MIFARE_CLASSIC_1K
      );
      targetCardId = newCard.id;
    }

    // 6. Create Assignment & update customer registration status
    const assignment = await RfidRepository.createAssignment({
      cardId: targetCardId,
      customerId: dto.customerId,
      centerId,
      assignedBy: context.userId,
      organizationId: customer.organization_id,
    });

    return {
      assignmentId: assignment.id,
      cardUid: normalizedUid,
      customerId: dto.customerId,
      status: 'ACTIVE',
    };
  }

  /**
   * Replace a customer's active RFID card with a new card.
   */
  public static async replaceRfidCard(
    dto: RfidReplaceDTO,
    context: AuthContext
  ): Promise<{ newAssignmentId: string; previousCardUid: string; newCardUid: string; customerId: string }> {
    // 1. Role verification
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];

    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError('Only Registration Officers, Center Managers, and Admins can replace RFID cards');
    }

    // 2. Customer verification
    const custRes = await pool.query(
      `SELECT id, organization_id, primary_center_id, status, is_deleted
       FROM customers
       WHERE id = $1;`,
      [dto.customerId]
    );

    if (custRes.rows.length === 0) {
      throw new NotFoundError(`Customer with UUID ${dto.customerId} does not exist`);
    }

    const customer = custRes.rows[0];

    if (context.role !== UserRole.SUPER_ADMIN && customer.organization_id !== context.organizationId) {
      throw new ForbiddenError('Access denied: Customer belongs to a different organization');
    }

    if (customer.is_deleted) {
      throw new BadRequestError('Cannot replace RFID card for a soft-deleted customer');
    }

    // 3. Check existing active assignment
    const currentAssignment = await RfidRepository.findActiveAssignmentByCustomerId(dto.customerId);
    if (!currentAssignment) {
      throw new BadRequestError('Customer does not hold an active RFID card to replace. Use the initial assignment workflow.');
    }

    // 4. Normalize and validate new UID
    const newUidNormalized = normalizeRfidUid(dto.newCardUid);

    if (newUidNormalized === currentAssignment.cardUid) {
      throw new BadRequestError('New card UID must be different from current card UID');
    }

    // 5. Ensure new card is available
    const existingNewCard = await RfidRepository.findCardByUid(newUidNormalized, customer.organization_id);
    let targetNewCardId: string;

    if (existingNewCard) {
      if (
        existingNewCard.status === RfidCardStatus.BLOCKED ||
        existingNewCard.status === RfidCardStatus.REVOKED ||
        existingNewCard.status === RfidCardStatus.LOST
      ) {
        throw new BadRequestError(`Target RFID Card ${newUidNormalized} is currently ${existingNewCard.status} and cannot be assigned`);
      }

      const activeAssign = await pool.query(
        `SELECT id FROM rfid_card_assignments WHERE rfid_card_id = $1 AND is_active = TRUE;`,
        [existingNewCard.id]
      );

      if (activeAssign.rows.length > 0) {
        throw new ConflictError(`Target RFID card ${newUidNormalized} is already actively assigned to another customer`);
      }

      targetNewCardId = existingNewCard.id;
    } else {
      const newCard = await RfidRepository.upsertCard(
        customer.organization_id,
        newUidNormalized,
        dto.cardType || RfidTechnology.MIFARE_CLASSIC_1K
      );
      targetNewCardId = newCard.id;
    }

    // 6. Execute atomic replacement
    const centerId = dto.centerId || customer.primary_center_id;
    const oldCardStatus = dto.reasonCategory === 'CARD_LOST' ? 'LOST' : 'REVOKED';

    const newAssignment = await RfidRepository.replaceAssignment({
      previousAssignmentId: currentAssignment.id,
      previousCardId: currentAssignment.rfidCardId,
      newCardId: targetNewCardId,
      customerId: dto.customerId,
      centerId,
      replacedBy: context.userId,
      revocationReason: `${dto.reasonCategory}: ${dto.justificationNotes}`,
      organizationId: customer.organization_id,
      newOldCardStatus: oldCardStatus,
    });

    return {
      newAssignmentId: newAssignment.id,
      previousCardUid: currentAssignment.cardUid,
      newCardUid: newUidNormalized,
      customerId: dto.customerId,
    };
  }

  /**
   * Revoke an RFID card.
   */
  public static async revokeRfidCard(
    cardId: string,
    dto: RfidRevokeDTO,
    context: AuthContext
  ): Promise<{ cardId: string; status: string; affectedCustomerIds: string[] }> {
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.SUPERVISOR,
      UserRole.REGISTRATION_OFFICER,
    ];

    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError('Unauthorized to revoke RFID cards');
    }

    const card = await RfidRepository.findCardById(cardId, context.organizationId);
    if (!card) {
      throw new NotFoundError(`RFID card ${cardId} not found`);
    }

    const result = await RfidRepository.revokeCard({
      cardId,
      status: dto.status,
      reason: dto.reason,
      revokedBy: context.userId,
      organizationId: context.organizationId,
    });

    return {
      cardId,
      status: dto.status,
      affectedCustomerIds: result.affectedCustomerIds,
    };
  }

  /**
   * Block an RFID card.
   */
  public static async blockRfidCard(
    cardId: string,
    reason: string,
    context: AuthContext
  ): Promise<{ cardId: string; status: string }> {
    return this.revokeRfidCard(
      cardId,
      { cardId, status: RfidCardStatus.BLOCKED, reason },
      context
    );
  }

  /**
   * Get RFID status and history for a customer.
   */
  public static async getCustomerRfidStatus(
    customerId: string,
    context: AuthContext
  ): Promise<CustomerRfidStatusDTO> {
    const status = await RfidRepository.getCustomerRfidStatus(customerId, context.organizationId);
    if (!status) {
      throw new NotFoundError(`Customer with UUID ${customerId} not found`);
    }
    return status;
  }
}

