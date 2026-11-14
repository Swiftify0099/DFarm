// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// IDENTIFICATION STATE MACHINE & SESSION TRACKER
// ==============================================================================
import { IdentificationState, } from '@dfarm/shared-types';
import { ConflictError, BadRequestError } from '../../shared/errors/app-error.js';
import crypto from 'node:crypto';
export class IdentificationStateMachine {
    static VALID_TRANSITIONS = {
        [IdentificationState.WAITING_FOR_FACE]: [
            IdentificationState.FACE_MATCHED,
            IdentificationState.FACE_UNKNOWN,
            IdentificationState.FACE_FAILED,
            IdentificationState.WAITING_FOR_RFID, // Direct fallback
            IdentificationState.WAITING_FOR_SUPERVISOR, // Direct fallback when face/rfid bypassed
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.FACE_MATCHED]: [
            IdentificationState.CUSTOMER_IDENTIFIED,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.FACE_UNKNOWN]: [
            IdentificationState.WAITING_FOR_RFID,
            IdentificationState.WAITING_FOR_SUPERVISOR,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.FACE_FAILED]: [
            IdentificationState.WAITING_FOR_RFID,
            IdentificationState.WAITING_FOR_SUPERVISOR,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.WAITING_FOR_RFID]: [
            IdentificationState.RFID_MATCHED,
            IdentificationState.RFID_FAILED,
            IdentificationState.WAITING_FOR_SUPERVISOR, // Direct fallback
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.RFID_MATCHED]: [
            IdentificationState.CUSTOMER_IDENTIFIED,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.RFID_FAILED]: [
            IdentificationState.WAITING_FOR_SUPERVISOR,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.WAITING_FOR_SUPERVISOR]: [
            IdentificationState.SUPERVISOR_VERIFIED,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.SUPERVISOR_VERIFIED]: [
            IdentificationState.CUSTOMER_IDENTIFIED,
            IdentificationState.CUSTOMER_REJECTED,
        ],
        [IdentificationState.CUSTOMER_IDENTIFIED]: [], // Terminal state
        [IdentificationState.CUSTOMER_REJECTED]: [
            IdentificationState.WAITING_FOR_FACE, // Reset allowed
            IdentificationState.WAITING_FOR_RFID,
            IdentificationState.WAITING_FOR_SUPERVISOR,
        ],
    };
    /**
     * Validate state transition.
     */
    static canTransition(current, next) {
        const allowed = this.VALID_TRANSITIONS[current] || [];
        return allowed.includes(next);
    }
    static assertTransition(current, next) {
        if (!this.canTransition(current, next)) {
            throw new BadRequestError(`Invalid identification state transition: Cannot transition from ${current} to ${next}`);
        }
    }
}
/**
 * In-memory identification session store for tracking multi-step intake sessions.
 */
export class IdentificationSessionStore {
    static sessions = new Map();
    static createSession(params) {
        const id = params.sessionId || crypto.randomUUID();
        const now = new Date().toISOString();
        const session = {
            sessionId: id,
            organizationId: params.organizationId,
            centerId: params.centerId,
            deviceId: params.deviceId,
            currentState: params.initialState || IdentificationState.WAITING_FOR_FACE,
            resolvedCustomerUuid: null,
            customerName: null,
            farmerCode: null,
            identificationMethod: null,
            attempts: [],
            createdAt: now,
            updatedAt: now,
        };
        this.sessions.set(id, session);
        return session;
    }
    static getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    static getOrCreateSession(params) {
        if (params.sessionId) {
            const existing = this.getSession(params.sessionId);
            if (existing) {
                // Enforce organization & center isolation
                if (existing.organizationId !== params.organizationId) {
                    throw new ConflictError('Session belongs to a different organization');
                }
                if (existing.centerId !== params.centerId) {
                    throw new ConflictError('Session belongs to a different center');
                }
                return existing;
            }
        }
        return this.createSession(params);
    }
    /**
     * Transition session state and update resolved identity.
     */
    static transition(params) {
        const session = this.getSession(params.sessionId);
        if (!session) {
            throw new BadRequestError(`Identification session ${params.sessionId} not found`);
        }
        // Check if session is already finalized with a DIFFERENT customer
        if (session.currentState === IdentificationState.CUSTOMER_IDENTIFIED &&
            session.resolvedCustomerUuid &&
            params.resolvedCustomerUuid &&
            session.resolvedCustomerUuid !== params.resolvedCustomerUuid) {
            throw new ConflictError(`Session already resolved to customer ${session.resolvedCustomerUuid}. Conflicting identification with ${params.resolvedCustomerUuid} is rejected.`);
        }
        IdentificationStateMachine.assertTransition(session.currentState, params.nextState);
        const now = new Date().toISOString();
        session.currentState = params.nextState;
        session.updatedAt = now;
        if (params.method) {
            session.identificationMethod = params.method;
            session.attempts.push({
                method: params.method,
                outcome: params.outcome,
                timestamp: now,
                details: params.details,
            });
        }
        if (params.resolvedCustomerUuid) {
            session.resolvedCustomerUuid = params.resolvedCustomerUuid;
        }
        if (params.customerName) {
            session.customerName = params.customerName;
        }
        if (params.farmerCode) {
            session.farmerCode = params.farmerCode;
        }
        return session;
    }
    static clear() {
        this.sessions.clear();
    }
}
//# sourceMappingURL=identification.state-machine.js.map