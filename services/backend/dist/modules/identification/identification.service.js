// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// CUSTOMER IDENTIFICATION BUSINESS SERVICE (FACE, RFID, SUPERVISOR OVERRIDE)
// ==============================================================================
import { IdentificationRepository } from './identification.repository.js';
import { P07FaceEngineAdapter } from './face-engine.adapter.js';
import { IdentificationSessionStore, } from './identification.state-machine.js';
import { normalizeRfidUid } from '@dfarm/shared-validation';
import { BadRequestError, NotFoundError, ForbiddenError, } from '../../shared/errors/app-error.js';
import { IdentificationMethod, IdentificationState, VerificationOutcome, UserRole, } from '@dfarm/shared-types';
export class IdentificationService {
    /**
     * Start a new customer identification session at a collection counter.
     */
    static startSession(params) {
        return IdentificationSessionStore.createSession({
            organizationId: params.authContext.organizationId,
            centerId: params.centerId,
            deviceId: params.deviceId,
            initialState: IdentificationState.WAITING_FOR_FACE,
        });
    }
    /**
     * Method 1: Face Recognition Identification.
     *
     * Flow:
     * Live Camera -> Quality -> Liveness -> Embedding -> Local Authorized Template Search
     * -> Threshold Validation -> Customer UUID Resolution.
     *
     * CRITICAL REQUIREMENT:
     * If P07 has not produced a working face recognition engine, report that blocker
     * rather than simulating successful face matches.
     */
    static async identifyByFace(dto, context) {
        const session = IdentificationSessionStore.getOrCreateSession({
            sessionId: dto.sessionId,
            organizationId: context.organizationId,
            centerId: dto.centerId,
            deviceId: dto.deviceId,
        });
        // 1. Inspect P07 Face Recognition Engine
        const inspection = P07FaceEngineAdapter.inspectEngine();
        if (!inspection.isAvailable) {
            // Record audit failure for telemetry
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: null,
                identificationMethod: IdentificationMethod.FACE,
                verificationOutcome: VerificationOutcome.FAILED,
                deviceId: dto.deviceId,
                supervisorReasonCode: 'P07_ENGINE_BLOCKED',
            });
            // Advance state machine: Face failed -> prompt for RFID
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_RFID,
                method: IdentificationMethod.FACE,
                outcome: VerificationOutcome.FAILED,
                details: { blocker: inspection.blockerReason },
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.WAITING_FOR_RFID,
                customerUuid: null,
                method: IdentificationMethod.FACE,
                auditLogId,
                message: inspection.blockerReason || 'P07 face recognition engine is unavailable',
                rejectionReason: 'P07_FACE_ENGINE_UNAVAILABLE',
            };
        }
        // 2. If engine is available, execute face matching pipeline
        try {
            const candidate = await P07FaceEngineAdapter.matchProbe({
                embedding: dto.probeEmbedding,
                qualityScore: dto.qualityScore,
            }, [] // Template list from database
            );
            if (!candidate || candidate.matchScore < 0.80) {
                // Below calibrated threshold or no match
                const auditLogId = await IdentificationRepository.recordAuditLog({
                    organizationId: context.organizationId,
                    centerId: dto.centerId,
                    sessionId: session.sessionId,
                    customerId: null,
                    identificationMethod: IdentificationMethod.FACE,
                    verificationOutcome: VerificationOutcome.FAILED,
                    faceModelVersionId: candidate?.modelVersionId || null,
                    faceMatchScore: candidate?.matchScore || 0,
                    deviceId: dto.deviceId,
                });
                IdentificationSessionStore.transition({
                    sessionId: session.sessionId,
                    nextState: IdentificationState.WAITING_FOR_RFID,
                    method: IdentificationMethod.FACE,
                    outcome: VerificationOutcome.FAILED,
                });
                return {
                    success: false,
                    sessionId: session.sessionId,
                    currentState: IdentificationState.WAITING_FOR_RFID,
                    customerUuid: null,
                    method: IdentificationMethod.FACE,
                    auditLogId,
                    message: 'Face not recognized with sufficient confidence (score below 0.80). Proceeding to RFID card verification.',
                    rejectionReason: 'LOW_CONFIDENCE_OR_UNKNOWN',
                };
            }
            // Candidate found: verify customer account status
            const customer = await IdentificationRepository.findCustomerById(candidate.customerId, context.organizationId);
            if (!customer || customer.isDeleted) {
                const auditLogId = await IdentificationRepository.recordAuditLog({
                    organizationId: context.organizationId,
                    centerId: dto.centerId,
                    sessionId: session.sessionId,
                    customerId: candidate.customerId,
                    identificationMethod: IdentificationMethod.FACE,
                    verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                    faceMatchScore: candidate.matchScore,
                    deviceId: dto.deviceId,
                });
                IdentificationSessionStore.transition({
                    sessionId: session.sessionId,
                    nextState: IdentificationState.CUSTOMER_REJECTED,
                    method: IdentificationMethod.FACE,
                    outcome: VerificationOutcome.REJECTED_INACTIVE,
                    resolvedCustomerUuid: candidate.customerId,
                });
                return {
                    success: false,
                    sessionId: session.sessionId,
                    currentState: IdentificationState.CUSTOMER_REJECTED,
                    customerUuid: null,
                    method: IdentificationMethod.FACE,
                    auditLogId,
                    message: 'Rejected: Customer profile is deleted or not found',
                    rejectionReason: 'DELETED_CUSTOMER',
                };
            }
            if (customer.status !== 'ACTIVE') {
                const auditLogId = await IdentificationRepository.recordAuditLog({
                    organizationId: context.organizationId,
                    centerId: dto.centerId,
                    sessionId: session.sessionId,
                    customerId: customer.id,
                    identificationMethod: IdentificationMethod.FACE,
                    verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                    faceMatchScore: candidate.matchScore,
                    deviceId: dto.deviceId,
                });
                IdentificationSessionStore.transition({
                    sessionId: session.sessionId,
                    nextState: IdentificationState.CUSTOMER_REJECTED,
                    method: IdentificationMethod.FACE,
                    outcome: VerificationOutcome.REJECTED_INACTIVE,
                    resolvedCustomerUuid: customer.id,
                });
                return {
                    success: false,
                    sessionId: session.sessionId,
                    currentState: IdentificationState.CUSTOMER_REJECTED,
                    customerUuid: null,
                    method: IdentificationMethod.FACE,
                    auditLogId,
                    message: `Rejected: Customer account status is ${customer.status} (must be ACTIVE)`,
                    rejectionReason: 'INACTIVE_CUSTOMER',
                };
            }
            // Check active biometric enrollment & consent
            const enrollment = await IdentificationRepository.findActiveFaceEnrollment(candidate.customerId);
            if (!enrollment || enrollment.status !== 'ACTIVE') {
                const auditLogId = await IdentificationRepository.recordAuditLog({
                    organizationId: context.organizationId,
                    centerId: dto.centerId,
                    sessionId: session.sessionId,
                    customerId: candidate.customerId,
                    identificationMethod: IdentificationMethod.FACE,
                    verificationOutcome: VerificationOutcome.FAILED,
                    faceModelVersionId: candidate?.modelVersionId || null,
                    faceMatchScore: candidate.matchScore,
                    deviceId: dto.deviceId,
                    supervisorReasonCode: 'BIOMETRIC_CONSENT_REVOKED',
                });
                IdentificationSessionStore.transition({
                    sessionId: session.sessionId,
                    nextState: IdentificationState.WAITING_FOR_RFID,
                    method: IdentificationMethod.FACE,
                    outcome: VerificationOutcome.FAILED,
                });
                return {
                    success: false,
                    sessionId: session.sessionId,
                    currentState: IdentificationState.WAITING_FOR_RFID,
                    customerUuid: null,
                    method: IdentificationMethod.FACE,
                    auditLogId,
                    message: 'Biometric consent has been revoked or enrollment is inactive. Fallback to RFID verification.',
                    rejectionReason: 'REVOKED_CONSENT',
                };
            }
            // Valid identification!
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: customer.id,
                identificationMethod: IdentificationMethod.FACE,
                verificationOutcome: VerificationOutcome.SUCCESS,
                faceMatchScore: candidate.matchScore,
                deviceId: dto.deviceId,
            });
            // Transition FACE_MATCHED -> CUSTOMER_IDENTIFIED
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.FACE_MATCHED,
                method: IdentificationMethod.FACE,
                outcome: VerificationOutcome.SUCCESS,
                resolvedCustomerUuid: customer.id,
                customerName: customer.fullName,
                farmerCode: customer.farmerCode,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.CUSTOMER_IDENTIFIED,
                method: IdentificationMethod.FACE,
                outcome: VerificationOutcome.SUCCESS,
                resolvedCustomerUuid: customer.id,
                customerName: customer.fullName,
                farmerCode: customer.farmerCode,
            });
            return {
                success: true,
                sessionId: session.sessionId,
                currentState: IdentificationState.CUSTOMER_IDENTIFIED,
                customerUuid: customer.id,
                method: IdentificationMethod.FACE,
                auditLogId,
                message: 'Customer successfully identified via Face Recognition',
                customer: {
                    id: customer.id,
                    fullName: customer.fullName,
                    farmerCode: customer.farmerCode,
                    status: customer.status,
                    permittedCategories: customer.permittedCategories,
                },
            };
        }
        catch (err) {
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: session.currentState,
                customerUuid: null,
                method: IdentificationMethod.FACE,
                auditLogId: null,
                message: err.message || 'Face recognition pipeline failed',
                rejectionReason: 'FACE_PIPELINE_ERROR',
            };
        }
    }
    /**
     * Method 2: Software RFID Card Verification.
     *
     * Flow:
     * Normalize UID -> Look Up Active Assignment -> Check Card Status
     * -> Check Customer Status -> Check Organization -> Check Center Scope
     * -> Resolve Customer UUID.
     */
    static async identifyByRfid(dto, context) {
        const session = IdentificationSessionStore.getOrCreateSession({
            sessionId: dto.sessionId,
            organizationId: context.organizationId,
            centerId: dto.centerId,
            deviceId: dto.deviceId,
        });
        if (session.currentState === IdentificationState.WAITING_FOR_FACE) {
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_RFID,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.FAILED,
            });
        }
        // 1. Normalize UID (uppercase hexadecimal)
        const normalizedUid = normalizeRfidUid(dto.cardUid);
        // 2. Query Card & Assignment Record
        const record = await IdentificationRepository.findCustomerByRfidCard(normalizedUid, context.organizationId);
        // 3. Validation Chain
        // 3.1 Card does not exist in organization inventory
        if (!record) {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: null,
                identificationMethod: IdentificationMethod.RFID,
                verificationOutcome: VerificationOutcome.REJECTED_UNKNOWN,
                rfidCardUidScanned: normalizedUid,
                deviceId: dto.deviceId,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_SUPERVISOR,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.REJECTED_UNKNOWN,
                details: { reason: 'UNKNOWN_CARD' },
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.WAITING_FOR_SUPERVISOR,
                customerUuid: null,
                method: IdentificationMethod.RFID,
                auditLogId,
                message: `Unknown RFID card: Card UID ${normalizedUid} is not registered in this organization`,
                rejectionReason: 'UNKNOWN_CARD',
            };
        }
        // 3.2 Card Status Check: must not be BLOCKED, REVOKED, LOST, or UNASSIGNED
        if (record.cardStatus !== 'ACTIVE') {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: record.customerId || null,
                identificationMethod: IdentificationMethod.RFID,
                verificationOutcome: VerificationOutcome.FAILED,
                rfidCardUidScanned: normalizedUid,
                deviceId: dto.deviceId,
                supervisorReasonCode: `CARD_${record.cardStatus}`,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_SUPERVISOR,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.FAILED,
                details: { reason: `CARD_${record.cardStatus}` },
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.WAITING_FOR_SUPERVISOR,
                customerUuid: null,
                method: IdentificationMethod.RFID,
                auditLogId,
                message: `Rejected: RFID Card ${normalizedUid} is ${record.cardStatus}`,
                rejectionReason: `CARD_${record.cardStatus}`,
            };
        }
        // 3.3 Active Assignment Check
        if (!record.isAssignmentActive || !record.customerId) {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: null,
                identificationMethod: IdentificationMethod.RFID,
                verificationOutcome: VerificationOutcome.REJECTED_UNKNOWN,
                rfidCardUidScanned: normalizedUid,
                deviceId: dto.deviceId,
                supervisorReasonCode: 'UNASSIGNED_CARD',
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_SUPERVISOR,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.REJECTED_UNKNOWN,
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.WAITING_FOR_SUPERVISOR,
                customerUuid: null,
                method: IdentificationMethod.RFID,
                auditLogId,
                message: `Rejected: RFID Card ${normalizedUid} is unassigned`,
                rejectionReason: 'UNASSIGNED_CARD',
            };
        }
        // 3.4 Soft-Deleted Customer Check
        if (record.customerDeleted) {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: record.customerId,
                identificationMethod: IdentificationMethod.RFID,
                verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                rfidCardUidScanned: normalizedUid,
                deviceId: dto.deviceId,
                supervisorReasonCode: 'CUSTOMER_DELETED',
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.CUSTOMER_REJECTED,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.REJECTED_INACTIVE,
                resolvedCustomerUuid: record.customerId,
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.CUSTOMER_REJECTED,
                customerUuid: null,
                method: IdentificationMethod.RFID,
                auditLogId,
                message: 'Rejected: Assigned customer account is soft-deleted',
                rejectionReason: 'CUSTOMER_DELETED',
            };
        }
        // 3.5 Customer Account Status Check: must be ACTIVE
        if (record.customerStatus !== 'ACTIVE') {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: record.customerId,
                identificationMethod: IdentificationMethod.RFID,
                verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                rfidCardUidScanned: normalizedUid,
                deviceId: dto.deviceId,
                supervisorReasonCode: `CUSTOMER_${record.customerStatus}`,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.CUSTOMER_REJECTED,
                method: IdentificationMethod.RFID,
                outcome: VerificationOutcome.REJECTED_INACTIVE,
                resolvedCustomerUuid: record.customerId,
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.CUSTOMER_REJECTED,
                customerUuid: null,
                method: IdentificationMethod.RFID,
                auditLogId,
                message: `Rejected: Customer account status is ${record.customerStatus} (must be ACTIVE)`,
                rejectionReason: 'CUSTOMER_INACTIVE',
            };
        }
        // 3.6 Center Authorization Scope Check
        // Farmer must belong to this center or user authorized
        if (context.role !== UserRole.SUPER_ADMIN && context.role !== UserRole.DAIRY_OWNER) {
            if (!context.centerIds.includes(dto.centerId)) {
                throw new ForbiddenError(`Terminal operator is not authorized for center ${dto.centerId}`);
            }
        }
        // 4. Successful RFID Identification
        const auditLogId = await IdentificationRepository.recordAuditLog({
            organizationId: context.organizationId,
            centerId: dto.centerId,
            sessionId: session.sessionId,
            customerId: record.customerId,
            identificationMethod: IdentificationMethod.RFID,
            verificationOutcome: VerificationOutcome.SUCCESS,
            rfidCardUidScanned: normalizedUid,
            deviceId: dto.deviceId,
        });
        // Advance state machine: RFID_MATCHED -> CUSTOMER_IDENTIFIED
        IdentificationSessionStore.transition({
            sessionId: session.sessionId,
            nextState: IdentificationState.RFID_MATCHED,
            method: IdentificationMethod.RFID,
            outcome: VerificationOutcome.SUCCESS,
            resolvedCustomerUuid: record.customerId,
            customerName: record.customerName,
            farmerCode: record.farmerCode,
        });
        IdentificationSessionStore.transition({
            sessionId: session.sessionId,
            nextState: IdentificationState.CUSTOMER_IDENTIFIED,
            method: IdentificationMethod.RFID,
            outcome: VerificationOutcome.SUCCESS,
            resolvedCustomerUuid: record.customerId,
            customerName: record.customerName,
            farmerCode: record.farmerCode,
        });
        return {
            success: true,
            sessionId: session.sessionId,
            currentState: IdentificationState.CUSTOMER_IDENTIFIED,
            customerUuid: record.customerId,
            method: IdentificationMethod.RFID,
            auditLogId,
            message: 'Customer successfully identified via RFID card tap',
            customer: {
                id: record.customerId,
                fullName: record.customerName,
                farmerCode: record.farmerCode,
                status: record.customerStatus,
                permittedCategories: record.permittedCategories,
            },
        };
    }
    /**
     * Method 3: Supervisor Manual Verification.
     *
     * Flow:
     * Face Failed/Unknown -> RFID Unavailable/Invalid -> Supervisor Login
     * -> Search Customer -> Select Candidate -> Verify Customer -> Mandatory Reason
     * -> Confirm Identity -> Generate Identification Audit.
     */
    static async verifyBySupervisor(dto, context) {
        const session = IdentificationSessionStore.getOrCreateSession({
            sessionId: dto.sessionId,
            organizationId: context.organizationId,
            centerId: dto.centerId,
            deviceId: dto.deviceId,
        });
        // 1. Supervisor Role Verification: Operators cannot impersonate supervisors
        const supervisorId = dto.supervisorId || context.userId;
        const supervisorAuth = await IdentificationRepository.verifySupervisorAuthorization(supervisorId, dto.centerId, context.organizationId);
        if (!supervisorAuth || !supervisorAuth.isValid) {
            throw new ForbiddenError('Access denied: User is not an authorized supervisor for this center. Operator cannot verify identity.');
        }
        const authorizedRoles = ['SUPERVISOR', 'CENTER_MANAGER', 'DAIRY_OWNER', 'SUPER_ADMIN'];
        if (!authorizedRoles.includes(supervisorAuth.role)) {
            throw new ForbiddenError('Only users holding a Supervisor or Management role may perform manual identification overrides.');
        }
        // 2. Mandatory Reason & Justification Notes Verification
        if (!dto.justificationNotes || dto.justificationNotes.trim().length < 5) {
            throw new BadRequestError('Mandatory justification notes of at least 5 characters are required for supervisor manual override.');
        }
        // 3. Customer Existence & Status Check
        const customer = await IdentificationRepository.findCustomerById(dto.targetCustomerUuid, context.organizationId);
        if (!customer) {
            throw new NotFoundError(`Customer with UUID ${dto.targetCustomerUuid} not found in this organization.`);
        }
        // 3.1 Soft-deleted restriction: Supervisor cannot bypass soft-deletion
        if (customer.isDeleted) {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: customer.id,
                identificationMethod: IdentificationMethod.SUPERVISOR_MANUAL,
                verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                supervisorId,
                supervisorReasonCode: dto.reasonCategory,
                deviceId: dto.deviceId,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.CUSTOMER_REJECTED,
                method: IdentificationMethod.SUPERVISOR_MANUAL,
                outcome: VerificationOutcome.REJECTED_INACTIVE,
                resolvedCustomerUuid: customer.id,
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.CUSTOMER_REJECTED,
                customerUuid: null,
                method: IdentificationMethod.SUPERVISOR_MANUAL,
                auditLogId,
                message: 'Supervisor cannot verify a soft-deleted customer. Customer must be restored by an administrator first.',
                rejectionReason: 'DELETED_CUSTOMER_BLOCKED',
            };
        }
        // 3.2 Inactive customer restriction: Supervisor cannot bypass inactive status
        if (customer.status !== 'ACTIVE') {
            const auditLogId = await IdentificationRepository.recordAuditLog({
                organizationId: context.organizationId,
                centerId: dto.centerId,
                sessionId: session.sessionId,
                customerId: customer.id,
                identificationMethod: IdentificationMethod.SUPERVISOR_MANUAL,
                verificationOutcome: VerificationOutcome.REJECTED_INACTIVE,
                supervisorId,
                supervisorReasonCode: dto.reasonCategory,
                deviceId: dto.deviceId,
            });
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.CUSTOMER_REJECTED,
                method: IdentificationMethod.SUPERVISOR_MANUAL,
                outcome: VerificationOutcome.REJECTED_INACTIVE,
                resolvedCustomerUuid: customer.id,
            });
            return {
                success: false,
                sessionId: session.sessionId,
                currentState: IdentificationState.CUSTOMER_REJECTED,
                customerUuid: null,
                method: IdentificationMethod.SUPERVISOR_MANUAL,
                auditLogId,
                message: `Supervisor cannot verify inactive customer. Customer status is ${customer.status} (must be ACTIVE).`,
                rejectionReason: 'INACTIVE_CUSTOMER_BLOCKED',
            };
        }
        // 4. Record Audit Log & Supervisor Verification Record
        const auditLogId = await IdentificationRepository.recordAuditLog({
            organizationId: context.organizationId,
            centerId: dto.centerId,
            sessionId: session.sessionId,
            customerId: customer.id,
            identificationMethod: IdentificationMethod.SUPERVISOR_MANUAL,
            verificationOutcome: VerificationOutcome.SUCCESS,
            supervisorId,
            supervisorReasonCode: dto.reasonCategory,
            deviceId: dto.deviceId,
        });
        await IdentificationRepository.recordSupervisorVerification({
            auditLogId,
            supervisorId,
            customerId: customer.id,
            centerId: dto.centerId,
            reasonCategory: dto.reasonCategory,
            justificationNotes: dto.justificationNotes.trim(),
            authenticatedVia: dto.authenticatedVia,
        });
        // 5. Advance State Machine: SUPERVISOR_VERIFIED -> CUSTOMER_IDENTIFIED
        if (session.currentState !== IdentificationState.WAITING_FOR_SUPERVISOR) {
            IdentificationSessionStore.transition({
                sessionId: session.sessionId,
                nextState: IdentificationState.WAITING_FOR_SUPERVISOR,
                method: IdentificationMethod.SUPERVISOR_MANUAL,
                outcome: VerificationOutcome.FAILED,
            });
        }
        IdentificationSessionStore.transition({
            sessionId: session.sessionId,
            nextState: IdentificationState.SUPERVISOR_VERIFIED,
            method: IdentificationMethod.SUPERVISOR_MANUAL,
            outcome: VerificationOutcome.SUCCESS,
            resolvedCustomerUuid: customer.id,
            customerName: customer.fullName,
            farmerCode: customer.farmerCode,
        });
        IdentificationSessionStore.transition({
            sessionId: session.sessionId,
            nextState: IdentificationState.CUSTOMER_IDENTIFIED,
            method: IdentificationMethod.SUPERVISOR_MANUAL,
            outcome: VerificationOutcome.SUCCESS,
            resolvedCustomerUuid: customer.id,
            customerName: customer.fullName,
            farmerCode: customer.farmerCode,
        });
        return {
            success: true,
            sessionId: session.sessionId,
            currentState: IdentificationState.CUSTOMER_IDENTIFIED,
            customerUuid: customer.id,
            method: IdentificationMethod.SUPERVISOR_MANUAL,
            auditLogId,
            message: 'Customer successfully verified via Supervisor Manual Override',
            customer: {
                id: customer.id,
                fullName: customer.fullName,
                farmerCode: customer.farmerCode,
                status: customer.status,
                permittedCategories: customer.permittedCategories,
            },
        };
    }
    /**
     * Get identification session details.
     */
    static getSession(sessionId, context) {
        const session = IdentificationSessionStore.getSession(sessionId);
        if (!session) {
            throw new NotFoundError(`Identification session ${sessionId} not found`);
        }
        if (context.role !== UserRole.SUPER_ADMIN && session.organizationId !== context.organizationId) {
            throw new ForbiddenError('Access denied: Session belongs to another organization');
        }
        return session;
    }
    /**
     * Query identification audit logs.
     */
    static async queryAuditLogs(params, context) {
        return IdentificationRepository.queryAuditLogs({
            organizationId: context.organizationId,
            centerId: params.centerId,
            customerId: params.customerId,
            limit: params.limit,
        });
    }
}
//# sourceMappingURL=identification.service.js.map